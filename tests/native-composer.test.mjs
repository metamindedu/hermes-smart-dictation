import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir,access} from 'node:fs/promises'
import {JSDOM} from 'jsdom'
import {DictationController} from '../src/core.mjs'

const source=process.env.HERMES_NATIVE_SOURCE
let available=Boolean(source);if(available)try{await access(source+'/apps/desktop/src/app/chat/composer/focus.ts')}catch{available=false}
test('native synchronous draft bus never writes a switched primary session', {skip:!available},async()=>{
  const dom=new JSDOM('<div></div>',{url:'http://localhost'});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.CustomEvent=dom.window.CustomEvent
  await mkdir('tests/.ui-fixture',{recursive:true})
  await build({entryPoints:[source+'/apps/desktop/src/app/chat/composer/focus.ts'],outfile:'tests/.ui-fixture/native-focus.mjs',bundle:true,format:'esm',platform:'node',plugins:[{name:'isolate-native-dependencies',setup(b){
    b.onResolve({filter:/^@\/|^\.\/floating-state$|^\.\/rich-editor$/},a=>({path:a.path,namespace:'native-fixture'}))
    b.onLoad({filter:/.*/,namespace:'native-fixture'},()=>({contents:"export const isElementInHiddenPane=()=>false, queryAllVisible=()=>[], queryVisible=()=>null, $hoveredTreeGroup={get:()=>null}, $floatingComposerOwner={get:()=>null}, subscribePreviewAnnotateHandoff=()=>()=>{}, dataUrlToBlob=()=>null, RICH_INPUT_SLOT='fixture';",loader:'js'}))
  }}]})
  const bus=await import('./.ui-fixture/native-focus.mjs')
  let active='A';const drafts={A:'A original',B:'B private draft'}
  const off=bus.onComposerDraftRequests({getIds:()=>[active],isActive:()=>true},{read:()=>drafts[active],write:t=>{drafts[active]=t;return true}})
  const capture=()=>({owner:{connectionId:'local',profile:'default'},storedId:active,runtimeId:'runtime-'+active,activeConnectionId:'local',activeProfile:'default'})
  let controller
  controller=new DictationController({capture,routes:async()=>[{connectionId:'local',mode:'local',profile:'default',targetProfile:'default'}],status:async()=>({ok:true,profile:'default',stt:{provider:'local',available:true}}),getDraft:async id=>(await bus.requestComposerGetDraft([id]))?.text??null,
    setDraft:(id,text)=>{const answer=bus.requestComposerSetDraft([id],text);assert.equal(drafts.A,'A original A transcript');queueMicrotask(()=>{active='B';controller.observeOwner()});return answer},
    insertText:()=>{throw new Error('deferred surface-only insertion forbidden')},rpc:async()=>({text:'A transcript'}),stopRecording:()=>{}})
  const prepared=await controller.prepare({});await controller.correct('A transcript',prepared.generation)
  assert.equal(drafts.A,'A original A transcript');assert.equal(drafts.B,'B private draft')
  // Direct ID-addressed request also refuses a primary now showing another id.
  assert.equal(await bus.requestComposerSetDraft(['A'],'late text'),false);assert.equal(drafts.B,'B private draft')
  off();controller.dispose();dom.window.close()
})
