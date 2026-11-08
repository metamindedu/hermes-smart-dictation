import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import { createRoot } from 'react-dom/client'
import { act, createElement } from 'react'

await mkdir('tests/.ui-fixture', {recursive:true})
await build({stdin:{contents:"export * from './src/plugin.jsx'; export {default} from './src/plugin.jsx'; export {host} from '@hermes/plugin-sdk';",resolveDir:process.cwd()},outfile:'tests/.ui-fixture/plugin.mjs',bundle:true,format:'esm',platform:'node',external:['react','react/jsx-runtime'],plugins:[{name:'test-sdk',setup(b){b.onResolve({filter:/^@hermes\/plugin-sdk$/},()=>({path:path.resolve('tests/sdk-fixture.mjs')}))}}]})
const module = await import('./.ui-fixture/plugin.mjs')

test('settings render and persist only explicit owner-scoped choices; no runtime request on mount', async()=>{
  const dom = new JSDOM('<div id="root"></div>',{url:'http://localhost'})
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
  const values=new Map(); const registrations=[]; const cleanup=[]; let calls=0
  const ctx={i18n:{register:()=>{},t:key=>key},storage:{get:(k,d)=>values.has(k)?values.get(k):d,set:(k,v)=>values.set(k,v)},rest:async()=>{calls++;throw new Error('no network permitted')},register:c=>registrations.push(c),registerSettingsPage:c=>registrations.push(c),onDispose:fn=>cleanup.push(fn)}
  module.default.register(ctx)
  const root=createRoot(document.getElementById('root'))
  await act(async()=>root.render(createElement(module.SettingsForm)))
  assert.equal(calls,0);assert.equal(values.size,0)
  const quick=document.getElementById('sd-start-on-click')
  assert.equal(quick.checked,true,'new installs inherit the user-requested ON default without starting media')
  await act(async()=>quick.click())
  assert.equal(quick.checked,false)
  const labels=[...document.querySelectorAll('label')].map(n=>n.textContent)
  assert.ok(labels.some(t=>t.includes('Profile SOUL.md')));assert.ok(labels.some(t=>t.includes('Session title')));assert.ok(labels.some(t=>t.includes('Previous conversation turns')))
  const soul=document.getElementById('sd-includeSoul')
  assert.equal(soul.checked,false)
  await act(async()=>soul.click())
  assert.equal(soul.checked,true);assert.equal(values.size,0);assert.equal(calls,0)
  const save=[...document.querySelectorAll('button')].find(n=>n.textContent==='Save settings for this profile')
  await act(async()=>save.click())
  assert.equal(values.size,1)
  const [[key,cfg]]=values.entries();assert.ok(key.includes('local')&&key.includes('default'));assert.equal(cfg.includeSoul,true);assert.equal(cfg.includeHistory,false);assert.equal(cfg.startOnClick,false)
  assert.ok(document.body.textContent.includes('Saved'))
  assert.ok(registrations.some(r=>r.area==='composer.actions'))
  await act(async()=>root.unmount())
  for(const f of cleanup.reverse())f()
  assert.equal(calls,0)
  dom.window.close()
})
test('named profile preferences are isolated; fresh ON never captures on mount, save or source switch',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'})
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
  const nav=Object.getOwnPropertyDescriptor(globalThis,'navigator');let microphone=0,requests=0
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia(){microphone++;throw Error('no physical capture')}}}})
  const original={startOnClick:false,includeSoul:true,instructions:'existing root-only text'}
  const rootKey='settings:'+JSON.stringify(['local','default'])
  const values=new Map([[rootKey,original]]),cleanup=[]
  const {host}=module
  host.state.focusedSessionOwner.set({connectionId:'local',profile:'alpha'});host.state.profile.set('alpha')
  module.default.register({i18n:{register(){},t:k=>k},storage:{get:(k,d)=>values.has(k)?values.get(k):d,set:(k,v)=>values.set(k,v)},rest:async()=>{requests++;throw Error('no network')},register(){},onDispose:f=>cleanup.push(f)})
  const root=createRoot(document.getElementById('root'))
  try{
    await act(async()=>root.render(createElement(module.SettingsForm)))
    assert.equal(document.getElementById('sd-start-on-click').checked,true)
    assert.equal(document.getElementById('sd-includeSoul').checked,false)
    assert.equal(document.getElementById('sd-start-on-click').disabled,false)
    await act(async()=>document.getElementById('sd-start-on-click').click())
    await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Save settings for this profile').click())
    assert.equal(values.get('settings:'+JSON.stringify(['local','alpha'])).startOnClick,false)
    assert.deepEqual(values.get(rootKey),original)
    await act(async()=>{host.state.focusedSessionOwner.set({connectionId:'local',profile:'beta'});host.state.profile.set('beta')})
    assert.equal(document.getElementById('sd-start-on-click').checked,true)
    assert.equal(document.getElementById('sd-includeSoul').checked,false)
    await act(async()=>host.state.profile.set('alpha'))
    const save=[...document.querySelectorAll('button')].find(b=>b.textContent==='Save settings for this profile')
    assert.equal(save.disabled,true)
    assert.equal(values.size,2);assert.equal(requests,0);assert.equal(microphone,0)
  }finally{
    await act(async()=>root.unmount());for(const f of cleanup.reverse())f()
    if(nav)Object.defineProperty(globalThis,'navigator',nav);else delete globalThis.navigator
    dom.window.close()
  }
})
