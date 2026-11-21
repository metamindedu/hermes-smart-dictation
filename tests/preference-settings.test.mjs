import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'
import path from 'node:path'
import {JSDOM} from 'jsdom'
import {createRoot} from 'react-dom/client'
import {act,createElement,useState} from 'react'
import {commonWorkflowKey,profilePreferenceKey} from '../src/preferences.mjs'
await mkdir('tests/.ui-fixture',{recursive:true})
await build({stdin:{contents:"export {PreferenceModes} from './src/preference-settings.jsx';export {host} from '@hermes/plugin-sdk';",resolveDir:process.cwd()},outfile:'tests/.ui-fixture/preference-settings.mjs',bundle:true,format:'esm',platform:'node',external:['react','react/jsx-runtime'],plugins:[{name:'test-sdk',setup(b){b.onResolve({filter:/^@hermes\/plugin-sdk$/},()=>({path:path.resolve('tests/sdk-fixture.mjs')}))}}]})
const module=await import('./.ui-fixture/preference-settings.mjs')
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return{promise,resolve}}
async function mount({routes,canApply=()=>true,initial={}}={}){
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
 const {host}=module;host.state.focusedSessionOwner.set({connectionId:'local',profile:'default'});host.state.connectionId.set('local');host.state.profile.set('default')
 let calls=0,changed=0;host.profileRoutes=async()=>{calls++;return routes?routes():[{connectionId:'local',profile:'default',targetProfile:'default',mode:'local'}]}
 const values=new Map(Object.entries(initial)),writes=[];const ctx={storage:{get:(k,d)=>values.has(k)?structuredClone(values.get(k)):d,set:(k,v)=>{writes.push(k);values.set(k,structuredClone(v))}}}
 const capture=()=>({owner:host.state.focusedSessionOwner.get(),activeConnectionId:host.state.connectionId.get(),activeProfile:host.state.profile.get()})
 function View(){const [selection,setSelection]=useState('inherit');return createElement(module.PreferenceModes,{ctx,capture,selection,onSelectionChange:setSelection,canApply,onCommonChanged:()=>{changed++}})}
 const root=createRoot(document.getElementById('root'));await act(async()=>root.render(createElement(View)))
 return{dom,host,values,writes,get calls(){return calls},get changed(){return changed},async close(){await act(async()=>root.unmount());dom.window.close()}}
}
const button=text=>[...document.querySelectorAll('button')].find(n=>n.textContent===text)
async function choose(value,label='Common dictation mode'){await act(async()=>{const select=document.querySelector('select[aria-label="'+label+'"]');select.value=value;select.dispatchEvent(new window.Event('change',{bubbles:true}))})}

test('common mode UI is inert on mount/edit and saves only its own common key after local-route validation',async()=>{
 const old={workflow:'native',startOnClick:false,includeSoul:true,opaque:{keep:1}},key=profilePreferenceKey({connectionId:'local',profile:'another'});const h=await mount({initial:{[key]:old}})
 try{
  assert.equal(h.calls,0);assert.equal(h.writes.length,0)
  assert.equal(document.querySelector('select[aria-label="Mode for default"]').value,'inherit')
  assert.equal(document.querySelector('label').style.overflowWrap,'anywhere','long profile labels must not size the Select beyond a narrow card')
  await choose('native');assert.equal(h.writes.length,0)
  await act(async()=>button('Save common mode').click())
  assert.equal(h.calls,1);assert.deepEqual(h.writes,[commonWorkflowKey('local')]);assert.deepEqual(h.values.get(key),old);assert.equal(h.changed,1)
  assert.ok(document.body.textContent.includes('saved and read back'));assert.equal(h.values.size,2)
 }finally{await h.close()}
})
test('remote or duplicate native descriptors never write a common mode',async()=>{
 for(const mode of ['remote','duplicate']){
  const row={connectionId:'local',profile:'default',targetProfile:'default',mode:mode==='remote'?'remote':'local'}
  const h=await mount({routes:()=>mode==='remote'?[row]:[row,row]})
  try{await choose('native');await act(async()=>button('Save common mode').click());assert.equal(h.writes.length,0);assert.equal(h.changed,0);assert.ok(document.body.textContent.includes('Nothing was reset'))}finally{await h.close()}
 }
})
test('a genuine owner A-to-B-to-A transition invalidates pending common save',async()=>{
 const d=deferred(),h=await mount({routes:()=>d.promise})
 try{
  await choose('native');await act(async()=>button('Save common mode').click())
  await act(async()=>{h.host.state.focusedSessionOwner.set({connectionId:'local',profile:'other'});h.host.state.profile.set('other');h.host.state.focusedSessionOwner.set({connectionId:'local',profile:'default'});h.host.state.profile.set('default')})
  await act(async()=>d.resolve([{connectionId:'local',profile:'default',targetProfile:'default',mode:'local'}]))
  assert.equal(h.writes.length,0);assert.equal(h.changed,0)
 }finally{await h.close()}
})
test('semantically equivalent owner notifications retain the pending common intent',async()=>{
 const d=deferred(),h=await mount({routes:()=>d.promise})
 try{
  await choose('native');await act(async()=>button('Save common mode').click())
  await act(async()=>h.host.state.focusedSessionOwner.set({connectionId:'local',profile:'default'}))
  await act(async()=>d.resolve([{connectionId:'local',profile:'default',targetProfile:'default',mode:'local'}]))
  assert.equal(h.writes.length,1);assert.equal(h.values.get(commonWorkflowKey('local')).workflow,'native')
 }finally{await h.close()}
})
test('a common preference edited elsewhere is not overwritten by a stale draft',async()=>{
 const h=await mount()
 try{
  await choose('native');const elsewhere={schema:1,connectionId:'local',workflow:'native'};h.values.set(commonWorkflowKey('local'),elsewhere)
  await act(async()=>button('Save common mode').click());assert.equal(h.writes.length,0);assert.deepEqual(h.values.get(commonWorkflowKey('local')),elsewhere)
  await act(async()=>button('Reload saved preferences').click());assert.equal(document.querySelector('select[aria-label="Common dictation mode"]').value,'native')
  assert.equal(h.writes.length,0,'reload is read-only')
 }finally{await h.close()}
})
test('becoming busy during route preflight refuses save and releases the pending flag',async()=>{
 let busy=false;const d=deferred(),h=await mount({routes:()=>d.promise,canApply:()=>!busy})
 try{
  await choose('native');await act(async()=>button('Save common mode').click());busy=true
  await act(async()=>d.resolve([{connectionId:'local',profile:'default',targetProfile:'default',mode:'local'}]))
  assert.equal(h.writes.length,0);assert.equal(button('Save common mode').disabled,false)
  busy=false;await act(async()=>button('Save common mode').click());assert.equal(h.writes.length,1)
 }finally{await h.close()}
})
