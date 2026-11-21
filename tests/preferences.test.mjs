import test from 'node:test'
import assert from 'node:assert/strict'
import { preferenceState, commonWorkflowKey, profilePreferenceKey, savePreferenceRecord, persistPreferences, persistCommonWorkflow, preferenceEventRelevant } from '../src/preferences.mjs'
const owner=(profile='default',connectionId='local')=>({profile,connectionId})
function store(initial={}){const values=new Map(Object.entries(initial));const writes=[];return{values,writes,get:(k,d)=>values.has(k)?structuredClone(values.get(k)):d,set:(k,v)=>{writes.push(k);values.set(k,structuredClone(v))}}}
const state=(s,p='default',c='local')=>preferenceState(s,owner(p,c))

test('fresh preference reads follow common Contextual presentation without persisting or granting context',()=>{
 const s=store(),r=state(s);assert.equal(r.cfg.workflow,'contextual');assert.equal(r.selection,'inherit');assert.equal(r.cfg.startOnClick,true);assert.equal(r.cfg.includeSoul,false);assert.equal(r.cfg.includeHistory,false);assert.equal(r.source,'factory');assert.equal(s.writes.length,0)
})
test('one common preference serves current and future profiles but does not replace explicit choices',()=>{
 const key=profilePreferenceKey(owner('explicit'));const original={workflow:'native',startOnClick:false,opaque:{model:'fixture-A'}};const s=store({[key]:original})
 persistCommonWorkflow(s,'local',undefined,'native');for(const p of ['default','existing','created-later'])assert.equal(state(s,p).cfg.workflow,'native')
 assert.deepEqual(s.get(key),original);assert.deepEqual(s.writes,[commonWorkflowKey('local')]);assert.equal(s.values.size,2)
})
test('explicit Native and Contextual modes win over opposite common values',()=>{
 for(const [chosen,common] of [['native','contextual'],['contextual','native']]){
  const s=store({[profilePreferenceKey(owner())]:{workflow:chosen,startOnClick:false,includeTitle:true}});persistCommonWorkflow(s,'local',undefined,common)
  const r=state(s);assert.equal(r.cfg.workflow,chosen);assert.equal(r.source,'profile');assert.equal(r.cfg.startOnClick,false);assert.equal(r.cfg.includeTitle,true)
 }
})
test('legacy context preferences retain compatibility without being migrated into inheritance',()=>{
 const original={startOnClick:false,includeSoul:true,instructions:'fixture legacy',opaque:5};const s=store({[profilePreferenceKey(owner())]:original});persistCommonWorkflow(s,'local',undefined,'native')
 const r=state(s);assert.equal(r.cfg.workflow,'contextual');assert.equal(r.source,'legacy');assert.equal(r.cfg.startOnClick,false)
 const next=savePreferenceRecord(original,{...r.cfg,includeTitle:true},'keep');assert.equal(Object.hasOwn(next,'workflow'),false);assert.equal(next.includeSoul,true);assert.equal(next.opaque,5);assert.deepEqual(s.get(profilePreferenceKey(owner())),original)
})
test('saving references on a fresh profile records inheritance rather than pinning effective mode',()=>{
 const s=store();const before=state(s);persistPreferences(s,owner(),undefined,{...before.cfg,includeTitle:true},'keep')
 assert.equal(s.get(profilePreferenceKey(owner())).workflow,'inherit');assert.equal(s.get(profilePreferenceKey(owner())).workflowSchema,1)
 persistCommonWorkflow(s,'local',undefined,'native');assert.equal(state(s).cfg.workflow,'native');assert.equal(state(s).cfg.includeTitle,true)
})
test('explicit inheritance preserves each profile shortcut/reference/unknown data across common changes',()=>{
 const raw={workflow:'native',startOnClick:false,includeHistory:true,opaque:{keep:7}};const next=savePreferenceRecord(raw,state(store({[profilePreferenceKey(owner())]:raw})).cfg,'inherit');const s=store({[profilePreferenceKey(owner())]:next})
 assert.equal(state(s).cfg.workflow,'contextual');persistCommonWorkflow(s,'local',undefined,'native');assert.equal(state(s).cfg.workflow,'native');assert.equal(state(s).cfg.startOnClick,false);assert.equal(state(s).cfg.includeHistory,true);assert.deepEqual(next.opaque,raw.opaque);assert.equal(raw.workflow,'native')
})
test('explicit mode change removes only the owned inheritance version marker',()=>{
 const raw={workflow:'inherit',workflowSchema:1,startOnClick:false,opaque:'retained'};const next=savePreferenceRecord(raw,{startOnClick:false},'contextual');assert.equal(next.workflow,'contextual');assert.equal('workflowSchema' in next,false);assert.equal(next.opaque,'retained');assert.equal(raw.workflow,'inherit')
})
test('malformed/null/empty/inherited-only and unknown-schema records remain manual and are never overwritten',()=>{
 for(const raw of [null,[],false,'bad',{}, {workflow:null},{workflow:'unsupported'},{opaque:7},{workflow:'inherit'},{workflow:'inherit',workflowSchema:2},Object.create({workflow:'native',startOnClick:true})]){
  const s=store({[profilePreferenceKey(owner())]:raw}),r=state(s);assert.equal(r.editable,false);assert.equal(r.cfg.startOnClick,false);assert.throws(()=>persistPreferences(s,owner(),raw,{},'inherit'),/invalid_preferences/);assert.equal(s.writes.length,0)
 }
})
test('malformed common policy produces manual Native fallback, preserving the saved object',()=>{
 for(const raw of [null,[],{}, {schema:2,connectionId:'local',workflow:'contextual'}, {schema:1,connectionId:'other',workflow:'contextual'}, {schema:1,connectionId:'local',workflow:'contextual',includeSoul:true}]){
  const s=store({[commonWorkflowKey('local')]:raw});assert.equal(state(s).cfg.workflow,'native');assert.equal(state(s).cfg.startOnClick,false);assert.equal(state(s).common.editable,false);assert.throws(()=>persistCommonWorkflow(s,'local',raw,'contextual'),/invalid_preferences/);assert.deepEqual(s.get(commonWorkflowKey('local')),raw);assert.equal(s.writes.length,0)
 }
})
test('common settings never cross connections and references/model-like values never cross profiles',()=>{
 const a={workflow:'contextual',includeSoul:true,opaque:{model:'fixture-A'}},b={workflow:'native',includeHistory:true,opaque:{model:'fixture-B'}}
 const s=store({[profilePreferenceKey(owner('a'))]:a,[profilePreferenceKey(owner('b'))]:b});persistCommonWorkflow(s,'local',undefined,'native')
 assert.equal(state(s,'c','other').cfg.workflow,'contextual');assert.equal(state(s,'a').cfg.includeHistory,false);assert.equal(state(s,'b').cfg.includeSoul,false);assert.deepEqual(s.get(profilePreferenceKey(owner('a'))),a);assert.deepEqual(s.get(profilePreferenceKey(owner('b'))),b)
})
test('stale profile/common snapshots and invalid source prevent writes',()=>{
 const s=store(),raw={workflow:'native'};s.values.set(profilePreferenceKey(owner()),raw)
 assert.throws(()=>persistPreferences(s,owner(),undefined,{},'inherit'),/preferences_changed/)
 s.values.set(commonWorkflowKey('local'),{schema:1,connectionId:'local',workflow:'native'});assert.throws(()=>persistCommonWorkflow(s,'local',undefined,'contextual'),/preferences_changed/)
 assert.throws(()=>persistCommonWorkflow(s,'local',s.get(commonWorkflowKey('local')),'contextual',()=>false),/source_changed/);assert.equal(s.writes.length,0)
})
test('silent storage write failure is not reported as persisted success',()=>{
 const s={get:(_k,d)=>d,set(){}};assert.throws(()=>persistPreferences(s,owner(),undefined,{},'inherit'),/save_failed/);assert.throws(()=>persistCommonWorkflow(s,'local',undefined,'native'),/save_failed/)
})
test('unrelated and unsupported storage notifications do not refresh this common mode',()=>{
 assert.equal(preferenceEventRelevant(null,'local'),true);assert.equal(preferenceEventRelevant('hermes.plugin.smart-dictation.'+commonWorkflowKey('local'),'local'),true)
 assert.equal(preferenceEventRelevant('hermes.plugin.smart-dictation.'+commonWorkflowKey('other'),'local'),false);assert.equal(preferenceEventRelevant('hermes.plugin.foreign.settings:x','local'),false)
 for(const value of [undefined,5,{},[]])assert.equal(preferenceEventRelevant(value,'local'),false)
})
test('invalid owner and invalid write draft fail closed without affecting keys',()=>{
 const s=store();for(const o of [null,{},owner(''),owner('bad\nname'),owner('default','')]){assert.equal(preferenceState(s,o).editable,false);assert.throws(()=>persistPreferences(s,o,undefined,{},'inherit'),/source_changed/)}
 assert.throws(()=>savePreferenceRecord(undefined,null,'inherit'),/invalid_preferences/);assert.equal(s.writes.length,0)
})
