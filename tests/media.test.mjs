import test from 'node:test'
import assert from 'node:assert/strict'
import { RecorderCoordinator } from '../src/media.mjs'
const deferred=()=>{let resolve,reject;const promise=new Promise((y,n)=>{resolve=y;reject=n});return{promise,resolve,reject}}
const tick=()=>new Promise(r=>setImmediate(r))
function setup(options={}) {
  const tracks=[];const recorders=[];const calls=[]
  const stream=()=>{const track={stops:0,stop(){this.stops++}};tracks.push(track);return{getTracks:()=>[track]}}
  class Recorder {
    static isTypeSupported(){return true}
    constructor(s){this.state='inactive';this.stream=s;this.mimeType='audio/webm';recorders.push(this)}
    start(){this.state='recording'}
    stop(){this.state='inactive';queueMicrotask(()=>this.onstop?.())}
  }
  const ctl={generation:0,state:{phase:'idle'},disposed:false,
    async prepare(){this.generation++;this.state={phase:'ready'};return{generation:this.generation,backend:{max_audio_bytes:100}}},
    current(g){return !this.disposed&&g===this.generation},
    recording(g){assert.ok(this.current(g));this.state={phase:'recording'}},
    cancel(reason){this.generation++;this.state={phase:'cancelled',message:reason};coordinator.cancel()},
    emit(p){this.state={...this.state,...p}},
    async transcribe(blob,g){calls.push({blob,g})}
  }
  const coordinator=new RecorderCoordinator(ctl,{getMedia:async()=>stream(),recorderClass:()=>Recorder,setTimer:()=>1,clearTimer:()=>{},...options})
  return {ctl,coordinator,stream,tracks,recorders,calls,Recorder}
}
test('recorder constructor failure releases acquired microphone on error and disposal',async()=>{
  const h=setup({recorderClass:()=>class {static isTypeSupported(){return true} constructor(){throw new Error('constructor failed')}}})
  await h.coordinator.start({});assert.equal(h.ctl.state.phase,'error');assert.equal(h.tracks[0].stops,1);assert.equal(h.coordinator.operation,null)
  h.coordinator.dispose();assert.equal(h.tracks[0].stops,1)
})
test('MIME probing failure also releases acquired microphone',async()=>{
  const h=setup({recorderClass:()=>class {static isTypeSupported(){throw new Error('probe failed')}}})
  await h.coordinator.start({});assert.equal(h.tracks[0].stops,1);assert.equal(h.coordinator.operation,null)
})
test('obsolete permission rejection cannot stop or mark a newer recording as failed',async()=>{
  const first=deferred();let requests=0;const h=setup({getMedia:()=>++requests===1?first.promise:Promise.resolve(h.stream())})
  const a=h.coordinator.start({});await tick();h.ctl.cancel('cancelled');await h.coordinator.start({})
  const b=h.coordinator.operation;assert.equal(h.ctl.state.phase,'recording')
  first.reject(new Error('old permission denied'));await a
  assert.equal(h.coordinator.operation,b);assert.equal(h.ctl.state.phase,'recording');assert.equal(h.tracks[0].stops,0);assert.equal(b.recorder.state,'recording')
  h.coordinator.dispose();await tick()
})
test('obsolete permission success releases only the old stream',async()=>{
  const first=deferred();let requests=0;const h=setup({getMedia:()=>++requests===1?first.promise:Promise.resolve(h.stream())})
  const a=h.coordinator.start({});await tick();h.ctl.cancel('cancelled');await h.coordinator.start({});const b=h.coordinator.operation
  first.resolve(h.stream());await a
  assert.equal(h.coordinator.operation,b);assert.equal(h.tracks[0].stops,0);assert.equal(h.tracks[1].stops,1)
  h.coordinator.dispose();await tick()
})
test('late recorder error from cancelled operation cannot cancel newer operation',async()=>{
  const h=setup();await h.coordinator.start({});const oldError=h.recorders[0].onerror;h.ctl.cancel('cancelled');await tick();await h.coordinator.start({});const b=h.coordinator.operation
  oldError();assert.equal(h.ctl.state.phase,'recording');assert.equal(h.coordinator.operation,b);assert.equal(h.tracks[1].stops,0)
  h.coordinator.dispose();await tick()
})
test('disposal while microphone permission is pending cleans up late stream',async()=>{
  const d=deferred();const h=setup({getMedia:()=>d.promise});const run=h.coordinator.start({});await tick();h.coordinator.dispose();d.resolve(h.stream());await run
  assert.equal(h.tracks[0].stops,1);assert.equal(h.calls.length,0)
})
test('ordinary stop transcribes once and releases microphone',async()=>{
  const h=setup();await h.coordinator.start({});h.recorders[0].ondataavailable({data:new Blob(['audio'])});h.coordinator.stop(false);await tick()
  assert.equal(h.tracks[0].stops,1);assert.equal(h.calls.length,1);assert.equal(h.coordinator.operation,null)
})
test('cancel, oversized chunk and duplicate starts cannot leak or submit audio',async()=>{
  const h=setup();await h.coordinator.start({});await assert.rejects(h.coordinator.start({}),/busy/)
  h.recorders[0].ondataavailable({data:{size:101}});await tick();assert.equal(h.tracks[0].stops,1);assert.equal(h.calls.length,0);assert.equal(h.coordinator.operation,null)
})
test('default browser timers retain their global receiver through start and stop',async()=>{
 const savedSet=globalThis.setTimeout,savedClear=globalThis.clearTimeout;let started=0,cleared=0
 globalThis.setTimeout=function(){assert.equal(this,globalThis);started++;return 123}
 globalThis.clearTimeout=function(timer){assert.equal(this,globalThis);assert.equal(timer,123);cleared++}
 const h=setup({setTimer:undefined,clearTimer:undefined})
 try{await h.coordinator.start({});assert.equal(h.ctl.state.phase,'recording');h.coordinator.stop();await tick();assert.equal(started,1);assert.equal(cleared,1);assert.equal(h.tracks[0].stops,1);assert.equal(h.coordinator.operation,null)}
 finally{h.coordinator.dispose();globalThis.setTimeout=savedSet;globalThis.clearTimeout=savedClear}
})
test('a broken timer cancellation cannot prevent microphone cleanup',async()=>{
 const h=setup({clearTimer:()=>{throw new TypeError('Illegal invocation')}})
 await h.coordinator.start({});h.coordinator.cancel();await tick()
 assert.equal(h.tracks[0].stops,1);assert.equal(h.coordinator.operation,null);assert.equal(h.calls.length,0)
})
test('timer setup failure after recorder start releases its stream and discards audio',async()=>{
 const h=setup({setTimer:()=>{throw new Error('timer failed')}})
 await h.coordinator.start({});await tick()
 assert.equal(h.ctl.state.phase,'error');assert.equal(h.tracks[0].stops,1);assert.equal(h.coordinator.operation,null);assert.equal(h.calls.length,0)
})
