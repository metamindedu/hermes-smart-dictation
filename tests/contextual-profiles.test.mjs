import test from 'node:test'
import assert from 'node:assert/strict'
import {contextualPlan,applyContextualPlan} from '../src/contextual-profiles.mjs'
const key=p=>'settings:'+JSON.stringify(['local',p])
function store(initial={}){const values=new Map(Object.entries(initial));let writes=0;return{values,get:(k,d)=>values.has(k)?structuredClone(values.get(k)):d,set(k,v){writes++;values.set(k,structuredClone(v))},get writes(){return writes}}}
test('all target workflows enabled without copying references or shortcut/model fields',()=>{
 const s=store({[key('a')]:{workflow:'native',startOnClick:false,includeSoul:false,instructions:'A',custom:{v:1}},[key('b')]:{workflow:'contextual',includeHistory:true,instructions:'B'}})
 const plan=contextualPlan(s,'local',['a','b','fresh']);assert.equal(s.writes,0)
 const rows=applyContextualPlan(s,plan,()=>true);assert.equal(rows.length,3);assert.equal(s.writes,2)
 assert.deepEqual(s.get(key('a')),{workflow:'contextual',startOnClick:false,includeSoul:false,instructions:'A',custom:{v:1}})
 assert.deepEqual(s.get(key('b')),{workflow:'contextual',includeHistory:true,instructions:'B'})
 assert.deepEqual(s.get(key('fresh')),{workflow:'contextual'})
})
test('invalid target or existing malformed record prevents every write',()=>{
 for(const bad of [null,[],false,'bad']){const s=store({[key('bad')]:bad});assert.throws(()=>contextualPlan(s,'local',['ok','bad']),/invalid_preferences/);assert.equal(s.writes,0)}
 for(const names of [[],['a','a'],[''],['bad\nname']])assert.throws(()=>contextualPlan(store(),'local',names),/invalid_targets/)
})
test('changed later target refuses a plan before any write',()=>{
 const s=store(),plan=contextualPlan(s,'local',['a','b']);s.values.set(key('b'),{includeTitle:true});assert.throws(()=>applyContextualPlan(s,plan,()=>true),/preferences_changed/);assert.equal(s.writes,0)
})
test('owner/busy refusal makes no writes',()=>{const s=store(),p=contextualPlan(s,'local',['a']);assert.throws(()=>applyContextualPlan(s,p,()=>false),/source_changed/);assert.equal(s.writes,0)})
test('failed read-back reports only completed targets and never resets another value',()=>{
 const s=store(),p=contextualPlan(s,'local',['a','b']);const set=s.set;s.set=(k,v)=>{if(k===key('a'))set(k,v)}
 let error;try{applyContextualPlan(s,p,()=>true)}catch(e){error=e};assert.equal(error.message,'save_failed');assert.deepEqual(error.completed.map(x=>x.profile),['a']);assert.equal(s.get(key('a')).workflow,'contextual');assert.equal(s.get(key('b'),undefined),undefined)
})
test('connection/profile data are storage-key data, never execution or cross-connection writes',()=>{
 const s=store(),names=['__proto__','profile " data'];const p=contextualPlan(s,'local',names);applyContextualPlan(s,p,()=>true);assert.equal(s.values.size,2);assert.equal(s.get('settings:'+JSON.stringify(['other','__proto__']),undefined),undefined)
})
