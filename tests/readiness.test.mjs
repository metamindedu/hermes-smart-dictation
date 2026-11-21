import test from 'node:test'
import assert from 'node:assert/strict'
import { ReadinessProbe, READINESS_METHOD, readinessRequest, parseReadiness, matchesReadinessSchema, readinessRows } from '../src/readiness.mjs'
import { readinessFixture } from './readiness-fixture.mjs'

const req = readinessRequest('default', '0'.repeat(32))
const deferred = () => { let resolve, reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject} }
function fixture() {
  let target={owner:{connectionId:'local',profile:'default'},activeConnectionId:'local',activeProfile:'default'},count=0
  const calls=[],queries=[],removed=[]
  const d={capture:()=>target,routes:async()=>[{connectionId:'local',mode:'local',profile:target.owner.profile,targetProfile:target.owner.profile}],nonce:()=> (++count).toString(16).padStart(32,'0'),request:async(route,method,payload,timeout)=>{calls.push({route,method,payload,timeout});return readinessFixture(payload.profile,payload.request_id)},queryClient:{fetchQuery:async opts=>{queries.push(opts);return opts.queryFn()},removeQueries:opts=>removed.push(opts)}}
  const probe=new ReadinessProbe(d)
  return {d,probe,calls,queries,removed,setOwner(profile){target={...target,owner:{...target.owner,profile},activeProfile:profile};probe.observeOwner()},equivalent(){target={...target,owner:{...target.owner}};probe.observeOwner()},setTarget(value){target=value;probe.observeOwner()}}
}

test('pinned closed schema accepts only read-only metadata and never turns it into readiness',()=>{
  const source=readinessFixture();const value=parseReadiness(source,req)
  assert.equal(value.ok,true);assert.equal(Object.hasOwn(value,'ready'),false);assert.equal(Object.hasOwn(value,'safe'),false)
  assert.equal(value.local_stt.cache_files,'not_checked');assert.equal(value.correction.payer_verified,false)
  assert.equal(value.task.current_registry_state,'unverified');assert.equal(value.correction.strict_bridge,'not_exposed')
  source.task.registration_observed=false;assert.equal(value.task.registration_observed,true);assert.equal(Object.isFrozen(value.task),true)
  assert.ok(readinessRows(value).includes('readinessExecutionUntested'))
})

const badResults=[
 ['wrong version',r=>{r.schema_version='smart-dictation.readiness.v0'}],
 ['wrong request',r=>{r.request_id='a'.repeat(32)}],
 ['wrong owner',r=>{r.profile='other'}],
 ['aggregate ready',r=>{r.ready=true}],
 ['safe claim',r=>{r.correction.safe=true}],
 ['loaded model claim',r=>{r.local_stt.model_load_tested=true}],
 ['tested correction claim',r=>{r.correction.model_call_tested=true}],
 ['payer claim',r=>{r.correction.payer_verified=true}],
 ['route freeze claim',r=>{r.correction.configuration_frozen_through_dispatch=true}],
 ['registry guarantee',r=>{r.task.current_registry_state='verified'}],
 ['unknown nested field',r=>{r.local_stt.api_key='synthetic-not-a-key'}],
 ['missing mandatory limit',r=>{r.limitations=r.limitations.slice(1)}],
 ['duplicate limit',r=>{r.limitations.push(r.limitations[0])}],
 ['boolean coercion',r=>{r.task.registration_observed='true'}],
 ['false success shape',r=>{r.ok=false}],
 ['missing field',r=>{delete r.correction.original_tool_metadata}],
 ['trailing newline id',r=>{r.instance_id+='\n'}],
 ['oversized version',r=>{r.backend_version='x'.repeat(33)}],
 ['configured while off',r=>{r.local_stt.enabled='off'}],
 ['configured wrong provider',r=>{r.local_stt.selected_provider='other'}],
 ['configured after failed read',r=>{r.config.read_state='failed'}],
 ['oversized list',r=>{r.limitations=Array(1000).fill('cache_not_checked')}],
 ['sparse capability list',r=>{r.capabilities=Array(1)}],
]
for(const [name,mutate] of badResults)test('rejects '+name,()=>{const value=readinessFixture();mutate(value);assert.throws(()=>parseReadiness(value,req),/readiness_unverified/)})

test('schema rejects accessors, prototypes, cycles and non-JSON values without reading a getter',()=>{
  let reads=0;const a=readinessFixture();Object.defineProperty(a,'ok',{get(){reads++;throw Error('must not read')},enumerable:true})
  assert.equal(matchesReadinessSchema(a,'ReadinessResult'),false);assert.equal(reads,0)
  const b=readinessFixture();Object.setPrototypeOf(b,{extra:true});assert.equal(matchesReadinessSchema(b,'ReadinessResult'),false)
  const c=readinessFixture();c.local_stt=c;assert.equal(matchesReadinessSchema(c,'ReadinessResult'),false)
  const e=readinessFixture();e.config.read_state=undefined;assert.equal(matchesReadinessSchema(e,'ReadinessResult'),false)
})

test('requests reject routing overrides, sessions, malformed identities and non-own fields',()=>{
  for(const extra of ['session_id','task','model','provider','home','raw_text'])assert.equal(matchesReadinessSchema({...req,[extra]:'synthetic'},'ReadinessRequest'),false)
  for(const profile of ['default\n','../other','DEFAULT','',null,{},'x'.repeat(65)])assert.throws(()=>readinessRequest(profile,'0'.repeat(32)))
  for(const id of ['x'.repeat(32),'0'.repeat(32)+'\n','0'.repeat(31),null])assert.throws(()=>readinessRequest('default',id))
  assert.equal(matchesReadinessSchema(Object.create(req),'ReadinessRequest'),false)
})

test('manual probe uses exact descriptor, matching assertions, fixed method/deadline and query client; no session or fallback',async()=>{
  const f=fixture();assert.equal(f.calls.length,0);assert.equal(f.queries.length,0)
  assert.equal(await f.probe.check(),true);assert.equal(f.calls.length,1)
  const {route,method,payload,timeout}=f.calls[0]
  assert.equal(method,READINESS_METHOD);assert.equal(method,'plugin.smart-dictation.readiness');assert.equal(timeout,5000)
  assert.equal(route.profile,payload.profile);assert.equal(payload.owner_profile,payload.profile)
  assert.deepEqual(Object.keys(payload).sort(),['schema_version','request_id','profile','owner_profile'].sort())
  assert.equal(f.queries[0].retry,false);assert.equal(f.queries[0].staleTime,10000);assert.equal(f.queries[0].gcTime,10000);assert.equal(f.removed.length,1)
  assert.equal(f.probe.state.phase,'observed');assert.equal(f.probe.state.value.profile,'default')
  await f.probe.check();assert.notEqual(f.calls[1].payload.request_id,payload.request_id);assert.equal(f.calls.length,2)
  f.probe.dispose()
})

test('scope leave and return invalidates stale metadata, including within one UI batch',async()=>{
  const f=fixture(),pending=deferred();f.d.request=()=>pending.promise
  const work=f.probe.check();await Promise.resolve();await Promise.resolve();assert.equal(f.probe.state.phase,'checking')
  f.setOwner('other');f.setOwner('default');pending.resolve(readinessFixture('default','1'.padStart(32,'0')))
  assert.equal(await work,false);assert.equal(f.probe.state.phase,'idle');assert.equal(f.probe.state.value,null)
  f.probe.dispose()
})

test('equivalent owner notifications preserve pending reads and observed metadata',async()=>{
  const f=fixture(),pending=deferred();f.d.request=()=>pending.promise
  const work=f.probe.check();await Promise.resolve();await Promise.resolve();f.equivalent()
  assert.equal(f.probe.state.phase,'checking');pending.resolve(readinessFixture('default','1'.padStart(32,'0')))
  assert.equal(await work,true);f.equivalent();assert.equal(f.probe.state.phase,'observed');assert.ok(f.probe.state.value)
  f.probe.dispose()
})

test('route changes before dispatch, remote/ambiguous routes and mismatched focus never call backend',async()=>{
  const f=fixture(),wait=deferred();f.d.routes=()=>wait.promise
  const work=f.probe.check();f.setOwner('other');wait.resolve([{connectionId:'local',mode:'local',profile:'default',targetProfile:'default'}])
  assert.equal(await work,false);assert.equal(f.calls.length,0)
  for(const routes of [[],[{connectionId:'local',mode:'remote',profile:'other',targetProfile:'other'}],[{connectionId:'local',mode:'local',profile:'other',targetProfile:'other'},{connectionId:'local',mode:'local',profile:'other',targetProfile:'other'}]]){f.d.routes=async()=>routes;assert.equal(await f.probe.check(),false);assert.equal(f.calls.length,0)}
  f.setTarget({owner:{connectionId:'local',profile:'other'},activeConnectionId:'remote',activeProfile:'other'});assert.equal(await f.probe.check(),false);assert.equal(f.calls.length,0)
  f.probe.dispose()
})

test('missing capability, timeout, denied or malformed results stay unverified; no alternate calls',async()=>{
  for(const response of [null,{ok:true},{schema_version:'smart-dictation.readiness.v1',request_id:'1'.padStart(32,'0'),ok:false,error:'backend_unavailable'}]){
    const f=fixture();f.d.request=async(...args)=>{f.calls.push(args);return response}
    assert.equal(await f.probe.check(),false);assert.equal(f.probe.state.phase,'unverified');assert.equal(f.calls.length,1);assert.equal(f.probe.state.value,null);f.probe.dispose()
  }
  for(const message of ['unknown_method','timeout','permission_denied']){
    const f=fixture();f.d.request=async(...args)=>{f.calls.push(args);throw Error(message)}
    assert.equal(await f.probe.check(),false);assert.equal(f.probe.state.phase,'unverified');assert.equal(f.calls.length,1);assert.equal(Object.hasOwn(f.probe.state,'error'),false);f.probe.dispose()
  }
})

test('rapid duplicate checks dedupe and disposal prevents late projection',async()=>{
  const f=fixture(),pending=deferred();f.d.request=(...args)=>{f.calls.push(args);return pending.promise}
  const work=f.probe.check();assert.equal(await f.probe.check(),false);await Promise.resolve();assert.equal(f.calls.length,1)
  f.probe.dispose();pending.resolve(readinessFixture('default','1'.padStart(32,'0')))
  assert.equal(await work,false);assert.equal(f.probe.state.value,null);assert.equal(f.probe.state.profile,'')
})

test('ON/OFF, missing consent, task registration, model declaration and library observations remain independent',()=>{
  const a=readinessFixture();a.correction.native_requested='off';a.correction.native_consent='missing'
  assert.ok(readinessRows(parseReadiness(a,req)).includes('readinessNativeOff'))
  a.correction.native_requested='on';a.task.registration_observed=false;a.task.handle_state='unavailable';a.local_stt.library_presence='missing';a.correction.configured_task_model='present'
  const rows=readinessRows(parseReadiness(a,req));assert.ok(rows.includes('readinessNativeReview'));assert.ok(rows.includes('readinessTaskUnknown'));assert.ok(rows.includes('readinessLibraryMissing'));assert.ok(rows.includes('readinessModelDeclared'));assert.ok(rows.includes('readinessExecutionUntested'))
  assert.equal(rows.some(r=>/Ready$|Safe$/.test(r)),false)
})
