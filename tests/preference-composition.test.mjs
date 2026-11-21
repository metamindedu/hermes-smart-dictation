import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'
import path from 'node:path'
import {JSDOM} from 'jsdom'
import {createRoot} from 'react-dom/client'
import {act,createElement} from 'react'

await mkdir('tests/.ui-fixture',{recursive:true})
await build({stdin:{contents:"export * from './src/plugin.jsx';export {default} from './src/plugin.jsx';export {host} from '@hermes/plugin-sdk';",resolveDir:process.cwd()},outfile:'tests/.ui-fixture/composition.mjs',bundle:true,format:'esm',platform:'node',external:['react','react/jsx-runtime'],plugins:[{name:'composition-fixture',setup(b){
 b.onResolve({filter:/^@hermes\/plugin-sdk$/},()=>({path:path.resolve('tests/sdk-fixture.mjs')}))
 b.onLoad({filter:/[\\/]src[\\/]plugin\.jsx$/},async a=>{const fs=await import('node:fs/promises');return{contents:await fs.readFile(a.path,'utf8')+'\nexport {app as fixtureApp};',resolveDir:path.dirname(a.path),loader:'jsx'}})
}}]})

const plugin=await import('./.ui-fixture/composition.mjs')
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text)
async function fixture({raw,partial=false}={}){
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'})
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
 const nav=Object.getOwnPropertyDescriptor(globalThis,'navigator'),counts={media:0,rest:0,rpc:0,draft:0}
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia(){counts.media++;throw Error('no real media')}}}})
 const {host}=plugin;host.state.connectionId.set('local');host.state.profile.set('default');host.state.focusedSessionOwner.set({connectionId:'local',profile:'default'});host.state.focusedSessionId.set('runtime-1');host.state.focusedStoredSessionId.set('saved-1')
 const row=profile=>({connectionId:'local',mode:'local',profile,targetProfile:profile})
 host.profileRoutes=async()=>partial?[row('default'),row('zeta')]:[row('default')]
 host.requestProfile=async()=>{counts.rpc++;throw Error('no RPC')};host.composer={getDraft(){counts.draft++;throw Error('no draft')},setDraft(){counts.draft++;throw Error('no draft')}}
 const key='settings:'+JSON.stringify(['local','default']),other='settings:'+JSON.stringify(['local','zeta'])
 const values=new Map([[key,structuredClone(raw||{workflow:'native',includeSoul:true,startOnClick:true,includeTitle:false,opaque:{keep:1}})]])
 if(partial)values.set(other,{workflow:'native',includeSoul:false})
 const writes=[],cleanup=[]
 plugin.default.register({i18n:{register(){},t:k=>k},storage:{get:(k,d)=>values.has(k)?structuredClone(values.get(k)):d,set:(k,v)=>{if(partial&&k===other)throw Error('synthetic second-target failure');writes.push(k);values.set(k,structuredClone(v))}},rest:async()=>{counts.rest++;throw Error('no REST')},register(){},addEventListener:(target,type,fn)=>{target.addEventListener(type,fn);cleanup.push(()=>target.removeEventListener(type,fn))},onDispose:f=>cleanup.push(f)})
 const root=createRoot(document.getElementById('root'))
 return{root,values,writes,key,other,counts,async close(){await act(async()=>root.unmount());for(const f of cleanup.reverse())f();if(nav)Object.defineProperty(globalThis,'navigator',nav);else delete globalThis.navigator;dom.window.close();assert.deepEqual(counts,{media:0,rest:0,rpc:0,draft:0})}}
}

for(const field of ['includeSoul','startOnClick'])for(const partial of [false,true])test(`mode batch preserves conflict fence for external ${field} OFF; partial=${partial}`,async()=>{
 const h=await fixture({partial})
 try{
  await act(async()=>h.root.render(createElement(plugin.SettingsForm)))
  await act(async()=>document.getElementById('sd-includeTitle').click())
  const external={...h.values.get(h.key),[field]:false,opaque:{external:'retained'}};h.values.set(h.key,external)
  await act(async()=>window.dispatchEvent(new window.StorageEvent('storage',{key:'hermes.plugin.smart-dictation.'+h.key})))
  assert.equal(document.getElementById(field==='startOnClick'?'sd-start-on-click':'sd-includeSoul').checked,true,'unsaved draft is retained, not silently discarded')
  await act(async()=>button('Load local Context record targets').click())
  await act(async()=>document.querySelector('[data-contextual-enable-all]').click())
  assert.equal(h.values.get(h.key).workflow,'contextual');assert.equal(h.values.get(h.key)[field],false)
  if(partial){assert.equal(h.values.get(h.other).workflow,'native');assert.ok(document.body.textContent.includes('Only listed ON results were verified'))}
  const beforeSaveWrites=h.writes.length
  await act(async()=>button('Save settings for this profile').click())
  assert.equal(h.values.get(h.key)[field],false,'profile Save must not restore a revoked preference')
  assert.equal(h.values.get(h.key).includeTitle,false,'dirty title is not secretly saved through a rebased baseline')
  assert.equal(h.writes.length,beforeSaveWrites);assert.ok(document.body.textContent.includes('Nothing was reset'))
  assert.equal(document.getElementById('sd-includeTitle').checked,true,'conflict keeps the user draft until explicit reload')
  await act(async()=>button('Reload saved preferences').click())
  assert.equal(document.getElementById(field==='startOnClick'?'sd-start-on-click':'sd-includeSoul').checked,false)
  assert.equal(h.writes.length,beforeSaveWrites);assert.deepEqual(h.values.get(h.key).opaque,{external:'retained'})
 }finally{await h.close()}
})

test('mode-only batch permits an unchanged baseline to save retained local reference edits',async()=>{
 const h=await fixture()
 try{
  await act(async()=>h.root.render(createElement(plugin.SettingsForm)))
  await act(async()=>document.getElementById('sd-includeTitle').click())
  await act(async()=>button('Load local Context record targets').click())
  await act(async()=>document.querySelector('[data-contextual-enable-all]').click())
  await act(async()=>button('Save settings for this profile').click())
  assert.equal(h.values.get(h.key).includeTitle,true);assert.equal(h.values.get(h.key).includeSoul,true)
  assert.equal(h.values.get(h.key).workflow,'contextual');assert.ok(document.body.textContent.includes('Saved · applies to the next operation'))
 }finally{await h.close()}
})

test('two mounted launchers and Advanced-origin active states retain both Core idle mics and stop controls',async()=>{
 const h=await fixture({raw:{workflow:'contextual',startOnClick:false}})
 const composer=id=>createElement('form',{'data-slot':'composer-root',id},createElement(plugin.Launcher),createElement('span',{'data-slot':'fan-menu-anchor',id:id+'-idle'},createElement('button',{'aria-label':'Voice dictation','aria-pressed':'false'},'Core mic')),createElement('span',{'data-slot':'fan-menu-anchor',id:id+'-stop'},createElement('button',{'aria-label':'Stop dictation','aria-pressed':'true'},'Core stop')))
 const visible=()=>{
  assert.equal(document.querySelectorAll('[data-smart-dictation-control="contextual"]').length,0)
  assert.equal(document.querySelectorAll('[data-smart-dictation-mic-style]').length,0)
  for(const id of ['focused-A-idle','focused-A-stop','neighbour-B-idle','neighbour-B-stop'])assert.notEqual(window.getComputedStyle(document.getElementById(id)).display,'none')
 }
 try{
  await act(async()=>h.root.render(createElement('div',{},composer('focused-A'),composer('neighbour-B'))))
  const runtime=plugin.fixtureApp;runtime.controller.target={owner:{connectionId:'local',profile:'default'},runtimeId:'runtime-1',storedId:'saved-1'}
  visible()
  // These are synthetic controller states, not microphone or model execution.
  // No public per-slot owner exists, including an Advanced-settings origin.
  for(const phase of ['recording','transcribing','correcting','cancelled','idle']){await act(async()=>runtime.controller.emit({phase}));visible()}
  await act(async()=>h.root.render(createElement('div',{},composer('focused-A'),composer('neighbour-B'),createElement(plugin.ContextualPanel))))
  await act(async()=>runtime.controller.emit({phase:'correcting'}));visible()
  await act(async()=>h.root.render(createElement('div',{},composer('focused-A'),composer('neighbour-B'))));visible()
 }finally{await h.close()}
})
