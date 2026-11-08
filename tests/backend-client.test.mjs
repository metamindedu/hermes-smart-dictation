import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import path from 'node:path'
import {OwnerBackend} from '../src/backend.mjs'

const target=(profile='claire')=>({owner:{connectionId:'local',profile},activeConnectionId:'local',activeProfile:profile,storedId:'saved-'+profile,runtimeId:'runtime-'+profile})
const job='0123456789abcdef0123456789abcdef'
const status={capabilities:['async-transcription-v1'],max_audio_bytes:12582912}
const blob=()=>new Blob([new Uint8Array([0,1,2,255])],{type:'audio/webm;codecs=opus'})
function fixture({profile='claire',rest,queryClient,clock}={}) {
 const state={live:target(profile),calls:[],removed:[]}
 const query=queryClient||{fetchQuery:options=>options.queryFn({signal:new AbortController().signal}),removeQueries:options=>state.removed.push(options)}
 const client=new OwnerBackend({rest:(url,options)=>{
  state.calls.push({url,options,profile:state.live.owner.profile})
  if(rest)return rest(url,options,state)
  return Promise.resolve({ok:true,profile,job_id:job,state:url.startsWith('/transcribe/jobs/')?'done':'running',raw_transcript:'synthetic transcript'})
 }},()=>structuredClone(state.live),query,{pollMs:1,waitMs:1000,...clock})
 return {state,client,captured:target(profile),query}
}
test('REST asserts the captured owner before synchronous ambient dispatch and after reply',async()=>{
 const h=fixture({rest:()=>({ok:true,profile:'claire'})})
 await h.client.request(h.captured,'/status')
 assert.equal(h.state.calls[0].url,'/status?owner_profile=claire')
 h.state.live=target('morgan')
 assert.throws(()=>h.client.request(h.captured,'/status'),/owner_unavailable/)
 assert.equal(h.state.calls.length,1)
})
test('foreign and duplicate owner assertions and routing-query injection never dispatch',()=>{
 const h=fixture()
 for(const url of ['/status?owner_profile=default','/status?owner_profile=claire&owner_profile=claire','/status?profile=default','/../status','/status?x=1?z=2'])assert.throws(()=>h.client.request(h.captured,url))
 assert.equal(h.state.calls.length,0)
})
test('named owner rejects default/missing/nested-foreign status envelopes',async()=>{
 for(const reply of [{ok:true,profile:'default'},{ok:true},{ok:true,profile:'claire',state:{ok:true,profile:'morgan'}}]){
  const h=fixture({rest:()=>reply})
  await assert.rejects(h.client.request(h.captured,'/status'),/owner_unavailable/)
 }
})
test('late REST reply is discarded after an owner switch',async()=>{
 let resolve;const reply=new Promise(r=>resolve=r)
 const h=fixture({rest:()=>reply});const work=h.client.request(h.captured,'/soul')
 h.state.live=target('ireum');resolve({ok:true,profile:'claire',soul:'not used'})
 await assert.rejects(work,/owner_unavailable/)
})
test('owner switch during audio conversion cannot upload to the new ambient profile',async()=>{
 let resolve;const bytes=new Promise(r=>resolve=r)
 const h=fixture();const work=h.client.transcribe({size:4,type:'audio/webm',arrayBuffer:()=>bytes},h.captured,()=>{},status)
 h.state.live=target('ireum');resolve(new ArrayBuffer(4))
 await assert.rejects(work,/owner_unavailable/);assert.equal(h.state.calls.length,0)
})
test('async STT uploads once, polls one owned job, drops query data and deletes the owned result',async()=>{
 const h=fixture();const result=await h.client.transcribe(blob(),h.captured,()=>{},status)
 assert.equal(result.raw_transcript,'synthetic transcript')
 assert.equal(h.state.calls.filter(c=>c.options?.upload).length,1)
 const upload=h.state.calls.find(c=>c.options?.upload)
 assert.deepEqual([...new Uint8Array(upload.options.upload.bytes)],[0,1,2,255])
 assert.ok(h.state.calls.every(c=>c.url.includes('owner_profile=claire')))
 assert.equal(h.state.calls.filter(c=>c.options?.method==='DELETE').length,1)
 assert.equal(h.state.removed.length,1)
})
test('foreign job results never become transcription output',async()=>{
 const h=fixture({rest:(url,options)=>options.method==='POST'?{ok:true,profile:'claire',job_id:job,state:'running'}:{ok:true,profile:'morgan',job_id:job,state:'done',raw_transcript:'foreign'}})
 await assert.rejects(h.client.transcribe(blob(),h.captured,()=>{},status),/owner_unavailable/)
 assert.equal(h.state.removed.length,1)
})
test('same-profile wrong job identity is rejected',async()=>{
 const h=fixture({rest:(url,options)=>options.method==='POST'?{ok:true,profile:'claire',job_id:job,state:'running'}:{ok:true,profile:'claire',job_id:'fedcba9876543210fedcba9876543210',state:'done',raw_transcript:'wrong job'}})
 await assert.rejects(h.client.transcribe(blob(),h.captured,()=>{},status),/owner_unavailable/)
})
test('legacy synchronous compatibility is restricted to the captured default owner',async()=>{
 const h=fixture({profile:'default',rest:()=>({ok:true,raw_transcript:'legacy text'})})
 const result=await h.client.transcribe(blob(),h.captured,()=>{},{version:'0.2.0'})
 assert.equal(result.raw_transcript,'legacy text');assert.equal(h.state.calls.length,1)
 const named=fixture();await assert.rejects(named.client.transcribe(blob(),named.captured,()=>{},{version:'0.2.0'}),/backend_unavailable/)
 assert.equal(named.state.calls.length,0)
})
test('job wait deadline does not repeat the upload',async()=>{
 const h=fixture({clock:{waitMs:0},rest:()=>({ok:true,profile:'claire',job_id:job,state:'running'})})
 await assert.rejects(h.client.transcribe(blob(),h.captured,()=>{},status),/transcription_timeout/)
 assert.equal(h.state.calls.filter(c=>c.options?.upload).length,1)
})
let NativeQueryClient
if(process.env.HERMES_NATIVE_SOURCE){
 const require=createRequire(path.join(process.env.HERMES_NATIVE_SOURCE,'apps/desktop/package.json'))
 NativeQueryClient=require('@tanstack/react-query').QueryClient
}
test('native query client retries only status, keeps no dictated text cached',{skip:!NativeQueryClient},async()=>{
 const query=new NativeQueryClient();let polls=0
 const h=fixture({queryClient:query,rest:(url,options)=>{
  if(options.method==='POST')return{ok:true,profile:'claire',job_id:job,state:'running'}
  if(options.method==='DELETE')return{ok:true,profile:'claire'}
  polls++;return{ok:true,profile:'claire',job_id:job,state:polls<3?'running':'done',...(polls>=3?{raw_transcript:'native retry result'}:{})}
 }})
 try{
  const result=await h.client.transcribe(blob(),h.captured,()=>{},status)
  assert.equal(result.raw_transcript,'native retry result');assert.equal(polls,3)
  assert.equal(h.state.calls.filter(c=>c.options?.upload).length,1)
  assert.equal(query.getQueryCache().getAll().length,0)
 }finally{query.clear()}
})
test('native retry stops on owner change without polling or deleting in the new profile',{skip:!NativeQueryClient},async()=>{
 const query=new NativeQueryClient()
 const h=fixture({queryClient:query,rest:(url,options,state)=>{
  if(options.method==='POST')return{ok:true,profile:'claire',job_id:job,state:'running'}
  state.live=target('morgan');return{ok:true,profile:'claire',job_id:job,state:'running'}
 }})
 try{
  await assert.rejects(h.client.transcribe(blob(),h.captured,()=>{},status),/owner_unavailable/)
  assert.equal(h.state.calls.length,2);assert.equal(query.getQueryCache().getAll().length,0)
 }finally{query.clear()}
})
