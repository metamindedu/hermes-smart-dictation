import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir,readFile} from 'node:fs/promises'
import path from 'node:path'
import {JSDOM} from 'jsdom'
import {createRoot} from 'react-dom/client'
import {act,createElement} from 'react'
await mkdir('tests/.ui-fixture',{recursive:true})
await build({stdin:{contents:"export {ModelSettings,NATIVE_MODEL_SETTINGS} from './src/model-settings.jsx'; export {host} from '@hermes/plugin-sdk'",resolveDir:process.cwd()},outfile:'tests/.ui-fixture/model-ui.mjs',bundle:true,format:'esm',platform:'node',external:['react','react/jsx-runtime'],plugins:[{name:'fixture-sdk',setup(b){b.onResolve({filter:/^@hermes\/plugin-sdk$/},()=>({path:path.resolve('tests/sdk-fixture.mjs')}))}}]})
const {ModelSettings,NATIVE_MODEL_SETTINGS,host}=await import('./.ui-fixture/model-ui.mjs')
async function mount({profile='default',routes}={}) {
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
 host.state.focusedSessionOwner.set({connectionId:'local',profile});host.state.connectionId.set('local');host.state.profile.set(profile)
 const calls=[],navigation=[]
 host.navigate=url=>navigation.push(url)
 host.profileRoutes=async()=>{calls.push('inventory');return routes?await routes():[{connectionId:'local',mode:'local',profile,targetProfile:profile}]}
 host.requestProfile=async()=>{calls.push('forbidden-rpc');throw new Error('No model/config RPC is allowed')}
 const live=()=>({owner:host.state.focusedSessionOwner.get(),activeConnectionId:host.state.connectionId.get(),activeProfile:host.state.profile.get()})
 let override=null
 const capture=()=>override||live()
 const root=createRoot(document.getElementById('root'));await act(async()=>root.render(createElement(ModelSettings,{capture})))
 const button=()=>document.querySelector('button')
 const click=async()=>{await act(async()=>{button().click();await new Promise(r=>setImmediate(r))})}
 const cleanup=async()=>{await act(async()=>root.unmount());dom.window.close()}
 return{calls,navigation,button,click,cleanup,setCapture:value=>{override=value}}
}
test('native model settings link performs no model/config/context/provider calls or writes',async()=>{
 const h=await mount()
 try {
  assert.deepEqual(h.calls,[]);assert.equal(document.querySelector('select'),null)
  assert.ok(document.body.textContent.includes('check the save targets'))
  await h.click()
  assert.deepEqual(h.navigation,[NATIVE_MODEL_SETTINGS]);assert.deepEqual(h.calls,['inventory'])
  const url=new URL(NATIVE_MODEL_SETTINGS,'https://localhost')
  assert.equal(url.pathname,'/settings');assert.equal(url.searchParams.get('aux'),'smart_dictation_correction')
  assert.equal(url.searchParams.has('profile'),false) // no invented native profile selector
 } finally {await h.cleanup()}
})
test('named owner gets explicit native profile/target guidance without a hidden save',async()=>{
 const h=await mount({profile:'alpha'})
 try {assert.ok(document.body.textContent.includes('“alpha”'));await h.click();assert.deepEqual(h.navigation,[NATIVE_MODEL_SETTINGS]);assert.deepEqual(h.calls,['inventory'])} finally {await h.cleanup()}
})
test('stale or mismatched owner blocks navigation before and after route discovery',async()=>{
 let resolve
 const h=await mount({routes:()=>new Promise(r=>{resolve=r})})
 try {
  await h.click();assert.equal(h.calls.length,1)
  h.setCapture({owner:{connectionId:'local',profile:'beta'},activeConnectionId:'local',activeProfile:'beta'})
  await act(async()=>{resolve([{connectionId:'local',mode:'local',profile:'default',targetProfile:'default'}]);await new Promise(r=>setImmediate(r))})
  assert.deepEqual(h.navigation,[])
 } finally {await h.cleanup()}
 const mismatch=await mount()
 try {mismatch.setCapture({owner:{connectionId:'other',profile:'default'},activeConnectionId:'local',activeProfile:'default'});await mismatch.click();assert.deepEqual(mismatch.calls,[]);assert.deepEqual(mismatch.navigation,[])} finally {await mismatch.cleanup()}
})
test('remote, missing or ambiguous native routes cannot open local model settings',async()=>{
 for(const routes of [[],[{connectionId:'local',mode:'oauth',profile:'default',targetProfile:'default'}],Array(2).fill({connectionId:'local',mode:'local',profile:'default',targetProfile:'default'})]) {
  const h=await mount({routes:async()=>routes})
  try {await h.click();assert.deepEqual(h.navigation,[]);assert.ok(document.querySelector('[role=status]'))} finally {await h.cleanup()}
 }
})
test('duplicate gestures deduplicate inventory and unmounted requests cannot navigate',async()=>{
 let resolve
 const h=await mount({routes:()=>new Promise(r=>{resolve=r})})
 await act(async()=>{h.button().click();h.button().click();await new Promise(r=>setImmediate(r))})
 assert.deepEqual(h.calls,['inventory']);await h.cleanup()
 resolve([{connectionId:'local',mode:'local',profile:'default',targetProfile:'default'}]);await new Promise(r=>setImmediate(r))
 assert.deepEqual(h.navigation,[])
})
test('the pinned native settings exposes plugin auxiliary rows and the aux deep-link contract',{skip:!process.env.HERMES_NATIVE_SOURCE},async()=>{
 const root=process.env.HERMES_NATIVE_SOURCE
 const rows=await readFile(path.join(root,'apps/desktop/src/app/settings/aux-task-rows.tsx'),'utf8')
 const detail=await readFile(path.join(root,'apps/desktop/src/app/capabilities/toolsets/toolset-detail.tsx'),'utf8')
 assert.match(rows,/param: 'aux'/);assert.match(rows,/aux-task-/);assert.match(rows,/entry\.task/)
 assert.match(detail,/\?tab=config:model&aux=vision/)
})
