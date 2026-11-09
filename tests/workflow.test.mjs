import test from 'node:test'
import assert from 'node:assert/strict'
import { workflowPreferences, saveWorkflowPreferences, contextualView } from '../src/workflow.mjs'

test('genuinely absent preferences use Native without persisting or acquiring media',()=>{
 const cfg=workflowPreferences(undefined)
 assert.equal(cfg.workflow,'native');assert.equal(cfg.startOnClick,true)
 assert.equal(cfg.includeSoul,false);assert.equal(cfg.includeHistory,false)
})
test('saved legacy choices remain Contextual and explicit OFF/custom context are preserved',()=>{
 const raw={startOnClick:false,includeSoul:true,includeHistory:true,instructions:'my saved wording',historyTurns:3}
 const before=structuredClone(raw),cfg=workflowPreferences(raw)
 assert.equal(cfg.workflow,'contextual');assert.equal(cfg.startOnClick,false)
 assert.equal(cfg.includeSoul,true);assert.equal(cfg.instructions,'my saved wording')
 assert.deepEqual(raw,before)
})
test('empty, malformed and inherited-only preferences fail to manual Contextual guidance',()=>{
 for(const raw of [{},null,[],false,'native',{workflow:null},{workflow:'unsupported'},Object.create({workflow:'native',startOnClick:true}),{unknownFutureFlag:true}]) {
  const cfg=workflowPreferences(raw);assert.equal(cfg.workflow,'contextual');assert.equal(cfg.startOnClick,false)
 }
})
test('explicit workflow is honored while inactive preferences survive switching and saving',()=>{
 const raw={workflow:'contextual',startOnClick:false,includeTitle:true,includeInstructions:true,instructions:'keep me',opaque:{future:'value'}}
 const native=saveWorkflowPreferences(raw,{...workflowPreferences(raw),workflow:'native'})
 assert.equal(native.workflow,'native');assert.equal(native.startOnClick,false);assert.equal(native.includeTitle,true)
 assert.deepEqual(native.opaque,raw.opaque);assert.equal(native.instructions,'keep me')
 const contextual=saveWorkflowPreferences(native,{...workflowPreferences(native),workflow:'contextual'})
 assert.equal(contextual.workflow,'contextual');assert.equal(contextual.includeInstructions,true)
 assert.equal(raw.workflow,'contextual')
})
test('saving cannot persist an invalid workflow or silently strip unrelated own values',()=>{
 const cfg=saveWorkflowPreferences({opaque:17},{workflow:'invalid',startOnClick:false})
 assert.equal(cfg.workflow,'contextual');assert.equal(cfg.startOnClick,false);assert.equal(cfg.opaque,17)
})

test('Contextual results are displayed only for their captured connection/profile/session',()=>{
 const target={owner:{connectionId:'local',profile:'alpha'},storedId:'A',runtimeId:'run-A'}
 const live={...target,activeConnectionId:'local',activeProfile:'alpha'}
 const state={phase:'review',raw:'private original',corrected:'private correction',applied:{before:'private draft'},warnings:['private'],message:'private',pending:false}
 assert.equal(contextualView(state,target,live),state)
 for(const changed of [{...live,storedId:'B'},{...live,runtimeId:'run-B'},{...live,activeProfile:'beta'},{...live,owner:{connectionId:'other',profile:'alpha'}}]) {
  const view=contextualView(state,target,changed)
  assert.equal(view.raw,'');assert.equal(view.corrected,'');assert.equal(view.applied,null)
  assert.deepEqual(view.warnings,[]);assert.equal(view.message,'');assert.equal(view.phase,'idle')
 }
 assert.equal(state.raw,'private original','projection does not destroy the captured owner recovery text')
})
