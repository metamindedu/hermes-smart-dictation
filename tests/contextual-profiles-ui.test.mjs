import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'
import {JSDOM} from 'jsdom'
import {createElement,act} from 'react'
import {createRoot} from 'react-dom/client'
await mkdir('tests/.ui-fixture',{recursive:true})
await build({stdin:{contents:"export {ContextualProfiles} from './src/contextual-profiles.jsx';export {host} from '@hermes/plugin-sdk'",resolveDir:process.cwd()},outfile:'tests/.ui-fixture/contextual-profiles-ui.mjs',bundle:true,format:'esm',platform:'node',external:['react','react/jsx-runtime'],plugins:[{name:'sdk',setup(b){b.onResolve({filter:/^@hermes\/plugin-sdk$/},()=>({path:process.cwd()+'/tests/sdk-fixture.mjs'}))}}]})
const {ContextualProfiles,host}=await import('./.ui-fixture/contextual-profiles-ui.mjs')
const names=['default','claire','ireum','morgan','postmaster','pychrong','satoshi','shinyoung','taxkeeper','vmaicreator','wallace']
const routes=()=>names.map(profile=>({connectionId:'local',profile,targetProfile:profile,mode:'local'}))
const key=p=>'settings:'+JSON.stringify(['local',p])
async function boot(){
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});for(const k of ['window','document','navigator','HTMLElement','Element','Event','MouseEvent'])Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:dom.window[k]});globalThis.IS_REACT_ACT_ENVIRONMENT=true
 host.state.focusedSessionOwner.set({connectionId:'local',profile:'default'});host.state.connectionId.set('local');host.state.profile.set('default')
 const values=new Map([[key('default'),{workflow:'contextual',instructions:'A'}],[key('claire'),{workflow:'native',startOnClick:false,includeSoul:true,includeHistory:false,instructions:'B',custom:{keep:1}}]]);let writes=0,calls=0,changed=0,busy=false,handler=async()=>routes()
 host.profileRoutes=async()=>{calls++;return handler()}
 const ctx={storage:{get:(k,d)=>values.has(k)?structuredClone(values.get(k)):d,set:(k,v)=>{writes++;values.set(k,structuredClone(v))}}}
 const capture=()=>({owner:host.state.focusedSessionOwner.get(),activeConnectionId:host.state.connectionId.get(),activeProfile:host.state.profile.get()})
 const root=createRoot(document.getElementById('root'));await act(async()=>root.render(createElement(ContextualProfiles,{ctx,capture,canApply:()=>!busy,onChanged:()=>changed++})))
 const click=async selector=>{await act(async()=>document.querySelector(selector).click())}
 return{dom,root,values,get writes(){return writes},get calls(){return calls},get changed(){return changed},set handler(v){handler=v},set busy(v){busy=v},load:()=>click('button'),apply:()=>click('[data-contextual-enable-all]'),close:async()=>{await act(async()=>root.unmount());dom.window.close()}}
}
test('explicit inventory then explicit all-profile write, exact results and preserved per-profile data',async()=>{
 const h=await boot();try{
  assert.equal(h.calls,0);assert.equal(h.writes,0)
  await h.load();assert.equal(h.calls,1);assert.equal(h.writes,0);assert.ok(document.body.textContent.includes('wallace'))
  await h.apply();assert.equal(h.calls,2);assert.equal(h.writes,10);assert.equal(h.changed,1)
  assert.equal(document.querySelectorAll('[data-contextual-profile]').length,11)
  assert.deepEqual(h.values.get(key('claire')),{workflow:'contextual',startOnClick:false,includeSoul:true,includeHistory:false,instructions:'B',custom:{keep:1}})
  for(const n of names)assert.equal(h.values.get(key(n)).workflow,'contextual')
 }finally{await h.close()}
})
test('batched A-B-A source change invalidates late inventory with no write',async()=>{
 const h=await boot();try{let resolve;h.handler=()=>new Promise(r=>resolve=r);await h.load();await act(async()=>{host.state.profile.set('claire');host.state.profile.set('default');resolve(routes())});assert.equal(document.querySelector('[data-contextual-enable-all]'),null);assert.equal(h.writes,0)}finally{await h.close()}
})
test('new profile is not silently added after the target review',async()=>{
 const h=await boot();try{await h.load();h.handler=async()=>[...routes(),{connectionId:'local',profile:'later',targetProfile:'later',mode:'local'}];await h.apply();assert.equal(h.values.has(key('later')),false);assert.equal(document.querySelectorAll('[data-contextual-profile]').length,11)}finally{await h.close()}
})
test('changed references or a disappearing route refuses writes',async()=>{
 for(const failure of ['edited','removed','remote']){
  const h=await boot();try{await h.load();if(failure==='edited')h.values.set(key('wallace'),{includeTitle:true});else h.handler=async()=>failure==='removed'?routes().filter(r=>r.profile!=='wallace'):routes().map(r=>({...r,mode:'remote'}));await h.apply();assert.equal(h.writes,0);assert.equal(document.querySelectorAll('[data-contextual-profile]').length,0);assert.ok(document.body.textContent.includes('save failed'))}finally{await h.close()}
 }
})
test('unmount during the final route recheck cannot persist preferences',async()=>{
 const h=await boot();let closed=false;try{await h.load();let resolve;h.handler=()=>new Promise(r=>resolve=r);await h.apply();await act(async()=>h.root.unmount());closed=true;await act(async()=>resolve(routes()));assert.equal(h.writes,0)}finally{if(!closed)await act(async()=>h.root.unmount());h.dom.window.close()}
})
test('equivalent owner notifications preserve the frozen plan; active audio blocks its apply',async()=>{
 const h=await boot();try{await h.load();await act(async()=>host.state.focusedSessionOwner.set({connectionId:'local',profile:'default'}));assert.ok(document.querySelector('[data-contextual-enable-all]'));h.busy=true;await h.apply();assert.equal(h.writes,0);h.busy=false;await h.apply();assert.equal(h.writes,10)}finally{await h.close()}
})
