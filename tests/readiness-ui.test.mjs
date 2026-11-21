import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import { createRoot } from 'react-dom/client'
import { act, createElement } from 'react'
import { readinessFixture } from './readiness-fixture.mjs'

await mkdir('tests/.ui-fixture',{recursive:true})
await build({stdin:{contents:"export * from './src/plugin.jsx';export {default} from './src/plugin.jsx';export {host,queryClient} from '@hermes/plugin-sdk';",resolveDir:process.cwd()},outfile:'tests/.ui-fixture/readiness-ui.mjs',bundle:true,format:'esm',platform:'node',external:['react','react/jsx-runtime'],plugins:[{name:'test-sdk',setup(b){b.onResolve({filter:/^@hermes\/plugin-sdk$/},()=>({path:path.resolve('tests/sdk-fixture.mjs')}))}}]})
const plugin=await import('./.ui-fixture/readiness-ui.mjs')
async function fixture() {
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'})
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
  const nav=Object.getOwnPropertyDescriptor(globalThis,'navigator'),cleanup=[],values=new Map(),calls=[],warnings=[];let media=0,rest=0,drafts=0
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia(){media++;throw Error('no physical capture')}}}})
  const {host,queryClient}=plugin;const error=console.error;console.error=(...args)=>{warnings.push(args.map(String).join(' '))}
  host.state.focusedSessionOwner.set({connectionId:'local',profile:'default'});host.state.profile.set('default');host.state.connectionId.set('local')
  host.profileRoutes=async()=>[{connectionId:'local',mode:'local',profile:host.state.profile.get(),targetProfile:host.state.profile.get()}]
  host.requestProfile=async(route,method,params,timeout)=>{calls.push({route,method,params,timeout});return readinessFixture(params.profile,params.request_id)}
  host.composer.setDraft=()=>{drafts++;return true};queryClient.fetchQuery=async opts=>opts.queryFn()
  plugin.default.register({i18n:{register(){},t:k=>k},storage:{get:(k,d)=>values.has(k)?values.get(k):d,set:(k,v)=>values.set(k,v)},rest:async()=>{rest++;throw Error('no REST fallback')},register(){},onDispose:f=>cleanup.push(f)})
  const root=createRoot(document.getElementById('root'))
  await act(async()=>root.render(createElement('div',{},createElement(plugin.SettingsForm),createElement(plugin.Launcher))))
  return {root,dom,host,values,calls,warnings,counts:()=>({media,rest,drafts}),check:()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Check setup and registration'),async close(){try{await act(async()=>root.unmount());for(const f of cleanup.reverse())f();assert.deepEqual(warnings,[])}finally{console.error=error;if(nav)Object.defineProperty(globalThis,'navigator',nav);else delete globalThis.navigator;dom.window.close()}}}
}

test('manual setup read renders observations, preserves dirty context/inheritance, never hides Core or calls audio/model',async()=>{
  const f=await fixture()
  try{
    assert.equal(f.calls.length,0);assert.deepEqual(f.counts(),{media:0,rest:0,drafts:0});assert.ok(document.body.textContent.includes('Not checked.'))
    await act(async()=>document.getElementById('sd-includeTitle').click());assert.equal(document.getElementById('sd-includeTitle').checked,true)
    const mode=document.querySelector('select[aria-label="Mode for default"]');assert.equal(mode.value,'inherit')
    await act(async()=>f.check().click())
    assert.equal(f.calls.length,1);assert.equal(f.calls[0].method,'plugin.smart-dictation.readiness');assert.equal(f.calls[0].params.profile,f.calls[0].route.profile);assert.equal(Object.hasOwn(f.calls[0].params,'session_id'),false)
    assert.ok(document.body.textContent.includes('an active registration handle was observed'));assert.ok(document.body.textContent.includes('not tested by this check'));assert.ok(document.body.textContent.includes('cannot guarantee tool-free execution'))
    assert.equal(document.getElementById('sd-includeTitle').checked,true);assert.equal(mode.value,'inherit');assert.equal(f.values.size,0)
    assert.equal(document.querySelector('[data-smart-dictation-mic-style]'),null,'even a successful declaration read cannot hide the idle Core mic')
    assert.deepEqual(f.counts(),{media:0,rest:0,drafts:0})
    await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Save settings for this profile').click())
    assert.equal(f.values.get('settings:'+JSON.stringify(['local','default'])).workflow,'inherit');assert.equal(f.values.get('settings:'+JSON.stringify(['local','default'])).includeTitle,true)
    assert.ok(document.body.textContent.includes('Saved · applies to the next operation'))
  }finally{await f.close()}
})

test('missing old RPC is visibly unverified without a looser REST/model fallback or preference writes',async()=>{
  const f=await fixture()
  try{
    f.host.requestProfile=async(...args)=>{f.calls.push(args);throw Error('unknown_method')}
    await act(async()=>f.check().click())
    assert.ok(document.body.textContent.includes('Setup is unverified'));assert.ok(document.querySelector('[data-smart-dictation-launcher]'))
    assert.equal(document.querySelector('[data-smart-dictation-mic-style]'),null);assert.equal(f.calls.length,1);assert.equal(f.values.size,0);assert.deepEqual(f.counts(),{media:0,rest:0,drafts:0})
  }finally{await f.close()}
})

test('scope leave-return invalidates pending result; equivalent notifications do not erase metadata',async()=>{
  const f=await fixture()
  try{
    let resolve,request;const pending=new Promise(r=>{resolve=r})
    f.host.requestProfile=async(route,method,params)=>{request=params;return pending}
    await act(async()=>{f.check().click();await Promise.resolve();await Promise.resolve()})
    await act(async()=>{f.host.state.focusedSessionOwner.set({connectionId:'local',profile:'other'});f.host.state.profile.set('other');f.host.state.focusedSessionOwner.set({connectionId:'local',profile:'default'});f.host.state.profile.set('default')})
    await act(async()=>resolve(readinessFixture('default',request.request_id)))
    assert.equal(document.body.textContent.includes('an active registration handle was observed'),false)
    f.host.requestProfile=async(route,method,params)=>readinessFixture(params.profile,params.request_id)
    await act(async()=>f.check().click());assert.ok(document.body.textContent.includes('an active registration handle was observed'))
    await act(async()=>f.host.state.focusedSessionOwner.set({connectionId:'local',profile:'default'}))
    assert.ok(document.body.textContent.includes('an active registration handle was observed'))
    assert.deepEqual(f.counts(),{media:0,rest:0,drafts:0});assert.equal(f.values.size,0)
  }finally{await f.close()}
})

test('settings preparation checks selected local targets and hands installation off without writing preferences', async () => {
  const f=await fixture(), destinations=[]
  const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text)
  const route=(profile,mode='local',connectionId='local',targetProfile=profile)=>({profile,mode,connectionId,targetProfile})
  const card=()=>document.querySelector('[data-smart-dictation-profile-preparation]')
  let rows=[route('default'),route('fresh'),route('duplicate'),route('duplicate'),route('remote','remote'),route('different','local','other'),route('alias','local','local','default')]
  try {
    f.host.profileRoutes=async()=>rows
    f.host.requestProfile=async(r,method,params)=>{
      f.calls.push([r,method,params])
      if (params.profile==='fresh') throw Error('unknown_method')
      return readinessFixture(params.profile,params.request_id)
    }
    f.host.navigate=x=>destinations.push(x)
    assert.ok(card()); assert.equal(f.calls.length,0)
    await act(async()=>button('Load local profiles').click())
    assert.equal(f.calls.length,0)
    assert.equal(card().querySelector('legend').textContent,'Profiles to check')
    assert.deepEqual([...card().querySelectorAll('label')].map(label=>label.textContent),['default','fresh'])
    const freshRoute=rows[1]; rows=[...rows,route('future')]
    await act(async()=>button('Check registration in 2 selected profiles').click())
    assert.deepEqual(f.calls.map(call=>call[2].profile),['default','fresh'])
    assert.equal(f.calls[1][0],freshRoute)
    assert.ok(f.calls.every(([,method,params])=>method==='plugin.smart-dictation.readiness' && !('session_id' in params) && params.profile===params.owner_profile))
    assert.match(card().textContent,/Active correction registration observed/)
    assert.match(card().textContent,/Unverified · check the selected profile in Hermes Plugins/)
    assert.doesNotMatch(card().textContent,/future|duplicate|different|alias/)
    await act(async()=>button('Open Hermes Plugins').click())
    assert.deepEqual(destinations,['/capabilities?tab=plugins'])
    assert.equal(f.calls.length,2); assert.equal(f.values.size,0)
    assert.deepEqual(f.counts(),{media:0,rest:0,drafts:0})
  } finally { await f.close() }
})

test('profile preparation never publishes a late result or dispatches later rows after an owner leave-return', async () => {
  const f=await fixture()
  const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text)
  let reply, payload
  try {
    f.host.profileRoutes=async()=>['default','next'].map(profile=>({profile,targetProfile:profile,mode:'local',connectionId:'local'}))
    const pending=new Promise(resolve=>{reply=resolve})
    f.host.requestProfile=async(route,method,params)=>{f.calls.push(route.profile);payload=params;return pending}
    await act(async()=>button('Load local profiles').click())
    await act(async()=>button('Check registration in 2 selected profiles').click())
    assert.deepEqual(f.calls,['default'])
    await act(async()=>{
      f.host.state.focusedSessionOwner.set({connectionId:'local',profile:'next'}); f.host.state.profile.set('next')
      f.host.state.focusedSessionOwner.set({connectionId:'local',profile:'default'}); f.host.state.profile.set('default')
      reply(readinessFixture('default',payload.request_id))
    })
    assert.deepEqual(f.calls,['default']); assert.ok(button('Load local profiles'))
    assert.doesNotMatch(document.querySelector('[data-smart-dictation-profile-preparation]').textContent,/Active correction registration observed/)
    assert.equal(f.values.size,0)
  } finally { await f.close() }
})

test('preparation rereads routes before each dispatch and skips removed or ambiguous targets', async () => {
  const f=await fixture()
  const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text)
  const route=profile=>({profile,targetProfile:profile,mode:'local',connectionId:'local'})
  let rows=['default','removed','unclear','valid'].map(route), release, firstPayload
  const replacement=route('valid'), gate=new Promise(resolve=>{release=resolve})
  try {
    f.host.profileRoutes=async()=>rows
    f.host.requestProfile=async(target,method,params)=>{
      f.calls.push(target)
      if (target.profile==='default') {firstPayload=params; return gate}
      return readinessFixture(params.profile,params.request_id)
    }
    await act(async()=>button('Load local profiles').click())
    await act(async()=>button('Check registration in 4 selected profiles').click())
    assert.deepEqual(f.calls.map(x=>x.profile),['default'])
    rows=[route('default'),route('unclear'),route('unclear'),replacement,route('future')]
    await act(async()=>release(readinessFixture('default',firstPayload.request_id)))
    assert.deepEqual(f.calls.map(x=>x.profile),['default','valid'])
    assert.equal(f.calls[1],replacement)
    const cards=[...document.querySelectorAll('[data-smart-dictation-profile-preparation] label')]
    for (const name of ['removed','unclear']) assert.match(cards.find(x=>x.textContent===name).parentElement.textContent,/Unverified · check the selected profile/)
    assert.equal(f.values.size,0)
    assert.deepEqual(f.counts(),{media:0,rest:0,drafts:0})
  } finally { await f.close() }
})
