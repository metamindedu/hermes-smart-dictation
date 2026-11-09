import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'
import path from 'node:path'
import {JSDOM} from 'jsdom'
import {createRoot} from 'react-dom/client'
import {act,createElement} from 'react'

await mkdir('tests/.ui-fixture',{recursive:true})
await build({stdin:{contents:"export {NativeStatus,parseNativeStatus} from './src/native-ui.jsx'; export {host} from '@hermes/plugin-sdk'",resolveDir:process.cwd()},outfile:'tests/.ui-fixture/native-ui.mjs',bundle:true,format:'esm',platform:'node',external:['react','react/jsx-runtime'],plugins:[{name:'native-status-sdk',setup(b){b.onResolve({filter:/^@hermes\/plugin-sdk$/},()=>({path:path.resolve('tests/sdk-fixture.mjs')}))}}]})
const {NativeStatus,parseNativeStatus,host}=await import('./.ui-fixture/native-ui.mjs')
const tick=()=>new Promise(resolve=>setImmediate(resolve))
const response=(profile='default',extra={})=>({ok:true,profile,version:'0.5.0',native:{selected:true,correction_enabled:false,consent_valid:false,config_valid:true,library_available:true,cache_available:true,model_load_tested:false,...extra}})
async function mount({reply=async()=>response(),routes=async()=>[{connectionId:'local',profile:'default',targetProfile:'default',mode:'local'}],owner={connectionId:'local',profile:'default'}}={}) {
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'})
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
 host.state.connectionId.set('local');host.state.profile.set('default');host.state.focusedSessionOwner.set(owner)
 const calls=[]
 host.profileRoutes=async()=>{calls.push('inventory');return routes()}
 const capture=()=>({owner:host.state.focusedSessionOwner.get(),activeConnectionId:host.state.connectionId.get(),activeProfile:host.state.profile.get()})
 const backend={request:async(target,url,options,guard)=>{guard();calls.push(url);const value=await reply(target);guard();return value}}
 const root=createRoot(document.getElementById('root'));await act(async()=>root.render(createElement(NativeStatus,{capture,backend})))
 const click=async()=>{await act(async()=>{document.querySelector('button').click();await tick()})}
 const cleanup=async()=>{await act(async()=>root.unmount());dom.window.close()}
 return {calls,click,cleanup}
}

test('Native setup check is explicit, read-only and labels cache discovery as untested',async()=>{
 const h=await mount()
 try {
  assert.deepEqual(h.calls,[])
  await h.click();assert.deepEqual(h.calls,['inventory','/native-status'])
  assert.ok(document.body.textContent.includes('Native correction is OFF'))
  assert.ok(document.body.textContent.includes('Decoder execution and model-provider access were not tested'))
  assert.ok(!document.body.textContent.includes('Ready'))
 }finally{await h.cleanup()}
})
test('Native setup works without backend until the check gesture; missing owner cannot read',async()=>{
 const h=await mount({owner:null})
 try {assert.equal(document.querySelector('button').disabled,true);assert.deepEqual(h.calls,[]);assert.ok(document.body.textContent.includes('copy a setup request'))}finally{await h.cleanup()}
 const failed=await mount({reply:async()=>{throw Error('private raw provider body')}})
 try {await failed.click();assert.ok(document.body.textContent.includes('Nothing was changed'));assert.ok(!document.body.textContent.includes('private raw'))}finally{await failed.cleanup()}
})
test('Native status projection rejects foreign, malformed and unproved load assertions',()=>{
 for(const value of [response('other'),{ok:true,profile:'default'},response('default',{selected:'yes'}),response('default',{model_load_tested:true})]) assert.throws(()=>parseNativeStatus(value,'default'))
 const value=response();value.native.secret='not projected'
 assert.equal(Object.hasOwn(parseNativeStatus(value,'default'),'secret'),false)
})
test('a duplicate/remote route blocks Native backend metadata before dispatch',async()=>{
 for(const routes of [[],[{connectionId:'local',profile:'default',targetProfile:'default',mode:'oauth'}],Array(2).fill({connectionId:'local',profile:'default',targetProfile:'default',mode:'local'})]) {
  const h=await mount({routes:async()=>routes})
  try {await h.click();assert.deepEqual(h.calls,['inventory']);assert.ok(document.body.textContent.includes('Could not read Native setup'))}finally{await h.cleanup()}
 }
})
test('Native late replies cannot survive a source switch and back, and duplicate gestures deduplicate',async()=>{
 let resolve
 const h=await mount({reply:()=>new Promise(r=>{resolve=r})})
 try {
  await act(async()=>{const b=document.querySelector('button');b.click();b.click();await tick()})
  assert.deepEqual(h.calls,['inventory','/native-status'])
  await act(async()=>{host.state.profile.set('alpha');host.state.profile.set('default');await tick()})
  await act(async()=>{resolve(response());await tick()})
  assert.equal(document.querySelector('[role=status]'),null)
  assert.equal(document.querySelector('button').disabled,false)
 }finally{await h.cleanup()}
})
test('Native callback is inert after unmount',async()=>{
 let resolve
 const h=await mount({reply:()=>new Promise(r=>{resolve=r})})
 await h.click();await h.cleanup();resolve(response());await tick()
 assert.deepEqual(h.calls,['inventory','/native-status'])
})
