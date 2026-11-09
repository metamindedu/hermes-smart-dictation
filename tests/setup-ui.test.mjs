import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir,readFile} from 'node:fs/promises'
import path from 'node:path'
import {JSDOM} from 'jsdom'
import {createRoot} from 'react-dom/client'
import {act,createElement} from 'react'
import {locales} from '../src/locales.mjs'

await mkdir('tests/.ui-fixture',{recursive:true})
await build({stdin:{contents:"export {SetupGuide} from './src/setup-guide.jsx'; export {host} from '@hermes/plugin-sdk'",resolveDir:process.cwd()},outfile:'tests/.ui-fixture/setup-ui.mjs',bundle:true,format:'esm',platform:'node',external:['react','react/jsx-runtime'],plugins:[{name:'setup-sdk',setup(b){b.onResolve({filter:/^@hermes\/plugin-sdk$/},()=>({path:path.resolve('tests/sdk-fixture.mjs')}))}}]})
const {SetupGuide,host}=await import('./.ui-fixture/setup-ui.mjs')
const route=(profile,extra={})=>({connectionId:'local',profile,targetProfile:profile,mode:'local',...extra})
const tick=()=>new Promise(resolve=>setImmediate(resolve))
async function mount({routes=async()=>[route('default'),route('alpha')],copyError=false,values=new Map(),...initialProps}={}) {
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'})
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
 const priorNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator')
 const calls={inventory:0,rpc:0,backend:0,media:0,composer:0,writes:0},copies=[]
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async text=>{if(copyError)throw Error('private clipboard failure details');copies.push(text)}},mediaDevices:{getUserMedia:()=>{calls.media++;throw Error('forbidden')}}}})
 host.state.connectionId.set('local');host.state.profile.set('default');host.state.focusedSessionOwner.set(null)
 host.profileRoutes=async()=>{calls.inventory++;return routes()}
 host.requestProfile=async()=>{calls.rpc++;throw Error('forbidden RPC')}
 host.composer.setDraft=async()=>{calls.composer++;throw Error('forbidden composer write')}
 const ctx={storage:{get:(key,fallback)=>values.has(key)?values.get(key):fallback,set:(key,value)=>{calls.writes++;values.set(key,value)}},rest:async()=>{calls.backend++;throw Error('missing backend')}}
 const root=createRoot(document.getElementById('root'));let props={ctx,...initialProps}
 await act(async()=>root.render(createElement(SetupGuide,props)))
 const button=text=>[...document.querySelectorAll('button')].find(node=>node.textContent===text)
 const click=async text=>{const node=button(text);assert.ok(node,`button ${text}`);await act(async()=>{node.click();await tick()})}
 const request=()=>document.querySelector('textarea')?.value
 const rerender=async next=>{props={...props,...next};await act(async()=>root.render(createElement(SetupGuide,props)))}
 const cleanup=async()=>{await act(async()=>root.unmount());if(priorNavigator)Object.defineProperty(globalThis,'navigator',priorNavigator);else delete globalThis.navigator;dom.window.close()}
 return {dom,ctx,root,calls,copies,values,button,click,request,rerender,cleanup}
}

test('first-use guide and request copy work with no backend or conversation; no implicit actions',async()=>{
 const original={startOnClick:false,includeSoul:true}
 const values=new Map([['settings:["local","default"]',original]])
 const h=await mount({values})
 try {
  assert.ok(document.body.textContent.includes('Seeing this panel is not proof'))
  assert.ok(h.request().includes('No target profiles have been selected'))
  assert.deepEqual(h.calls,{inventory:0,rpc:0,backend:0,media:0,composer:0,writes:0})
  await h.click('Copy setup request')
  assert.deepEqual(h.copies,[h.request()])
  assert.ok(document.querySelector('[role=status]').textContent.includes('No profiles have been changed'))
  assert.equal(values.size,1);assert.deepEqual(values.get('settings:["local","default"]'),original)
  assert.deepEqual(h.calls,{inventory:0,rpc:0,backend:0,media:0,composer:0,writes:0})
 }finally{await h.cleanup()}
})

test('profile selection edits only the request; refresh preserves subsets and empty selections',async()=>{
 let rows=[route('default'),route('alpha'),route('remote',{mode:'oauth'}),route('other',{connectionId:'other'}),route('duplicate'),route('duplicate')]
 const h=await mount({routes:async()=>rows,native:true})
 try {
  await h.click('Choose profiles for the request')
  assert.deepEqual([...document.querySelectorAll('fieldset label')].map(n=>n.textContent),['alpha','default'])
  const boxes=[...document.querySelectorAll('fieldset input[type=checkbox]')]
  assert.deepEqual(boxes.map(n=>n.checked),[false,true])
  await act(async()=>{boxes[0].click();boxes[1].click()})
  assert.ok(h.request().includes('["alpha"]'));assert.ok(h.request().includes('built-in Hermes microphone'))
  rows=[route('default'),route('alpha'),route('new-profile')]
  await h.click('Refresh profile list')
  assert.deepEqual([...document.querySelectorAll('fieldset input[type=checkbox]')].map(n=>n.checked),[true,false,false])
  await h.click('Clear selection');await h.click('Refresh profile list')
  assert.ok(h.request().includes('No target profiles have been selected'))
  await h.click('Select all shown');await h.click('Copy setup request')
  assert.ok(h.copies[0].includes('["alpha","default","new-profile"]'))
  assert.deepEqual({...h.calls,inventory:0},{inventory:0,rpc:0,backend:0,media:0,composer:0,writes:0})
 }finally{await h.cleanup()}
})

test('inventory failure keeps a usable generic request without exposing error payloads',async()=>{
 const h=await mount({routes:async()=>{throw Error('private path or token must not be shown')}})
 try {
  await h.click('Choose profiles for the request')
  assert.ok(document.querySelector('[role=status]').textContent.includes('Nothing was changed'))
  assert.ok(!document.body.textContent.includes('private path'))
  await h.click('Copy setup request');assert.equal(h.copies.length,1)
  assert.ok(h.copies[0].includes('confirm the targets before changing anything'))
  assert.equal(h.calls.writes,0);assert.equal(h.calls.backend,0)
 }finally{await h.cleanup()}
})

test('late inventory cannot cross a profile switch and back; retry is not stranded',async()=>{
 let resolve
 const h=await mount({routes:()=>new Promise(r=>{resolve=r})})
 try {
  await h.click('Choose profiles for the request')
  assert.equal(h.button('Loading local profiles…').disabled,true)
  await act(async()=>{host.state.profile.set('alpha');host.state.profile.set('default');await tick()})
  assert.equal(h.button('Choose profiles for the request').disabled,false)
  await act(async()=>{resolve([route('default'),route('stale-profile')]);await tick()})
  assert.equal(document.querySelector('fieldset'),null)
  assert.ok(!h.request().includes('stale-profile'))
  host.profileRoutes=async()=>[route('default')]
  await h.click('Choose profiles for the request')
  assert.equal(document.querySelectorAll('fieldset label').length,1)
 }finally{await h.cleanup()}
})

test('unmounted inventory is inert and duplicate load gestures are deduplicated',async()=>{
 let resolve
 const h=await mount({routes:()=>new Promise(r=>{resolve=r})})
 await act(async()=>{const b=h.button('Choose profiles for the request');b.click();b.click();await tick()})
 assert.equal(h.calls.inventory,1)
 await h.cleanup();resolve([route('default')]);await tick()
 assert.equal(h.calls.writes,0);assert.equal(h.calls.rpc,0)
})

test('hiding is explicit and profile-scoped; settings and backend failure can reveal instructions',async()=>{
 const h=await mount()
 try {
  await h.click('Hide instructions for this profile')
  assert.equal(h.request(),undefined);assert.equal(h.calls.writes,1)
  assert.equal(h.values.get('setup-guide-hidden:["local","default"]'),true)
  await act(async()=>host.state.profile.set('alpha'))
  assert.ok(h.request());assert.equal(h.calls.writes,1)
  await act(async()=>host.state.profile.set('default'))
  assert.equal(h.request(),undefined)
  await h.rerender({forceOpen:true});assert.ok(h.request())
  await h.click('Collapse');assert.equal(h.request(),undefined)
  await h.rerender({settingsPage:true,forceOpen:false});assert.ok(h.request())
  assert.equal(h.calls.writes,1);assert.equal(h.calls.inventory,0)
 }finally{await h.cleanup()}
})

test('clipboard failure is visible without claiming activation or exposing the exception',async()=>{
 const h=await mount({copyError:true})
 try {
  await h.click('Copy setup request')
  assert.ok(document.querySelector('[role=status]').textContent.includes('Could not copy'))
  assert.ok(!document.body.textContent.includes('private clipboard'))
  assert.equal(h.copies.length,0);assert.equal(h.calls.writes,0)
 }finally{await h.cleanup()}
})

test('Native correction checkbox only edits a request and resets on source change',async()=>{
 const h=await mount({native:true})
 try {
  const checkbox=document.querySelector('input[aria-label="Include optional Native correction setup in the request"]')
  assert.equal(checkbox.checked,false)
  assert.ok(!h.request().includes('correction_enabled = true'))
  await act(async()=>checkbox.click())
  assert.ok(h.request().includes('correction_enabled = true'))
  assert.ok(h.request().includes('obtain my consent'))
  assert.equal(h.calls.writes,0);assert.equal(h.calls.backend,0);assert.equal(h.calls.rpc,0)
  await act(async()=>host.state.profile.set('alpha'))
  assert.equal(document.querySelector('input[aria-label="Include optional Native correction setup in the request"]').checked,false)
  assert.ok(!h.request().includes('correction_enabled = true'))
 }finally{await h.cleanup()}
})

test('English and Korean setup copy stays localized and preserves the no-auto-send boundary',()=>{
 for(const [key,value] of Object.entries(locales.en).filter(([k])=>k.startsWith('setup')))assert.equal(typeof locales.ko[key],typeof value,key)
 assert.ok(locales.ko.setupAgentRequest(['alpha'],true).includes('대상 프로필 이름'))
 assert.ok(locales.ko.setupNoActivation.includes('메시지를 보내지 않습니다'))
 assert.ok(locales.en.setupNoActivation.includes('does not enable them or send a message'))
})

test('released native CopyButton supports the request getter and visible copy/error labels',{skip:!process.env.HERMES_NATIVE_SOURCE},async()=>{
 const source=await readFile(path.join(process.env.HERMES_NATIVE_SOURCE,'apps/desktop/src/components/ui/copy-button.tsx'),'utf8')
 assert.match(source,/type CopyPayload = string \| \(\(\) => Promise<string> \| string\)/)
 for(const name of ['onCopied','onCopyError','errorMessage','buttonVariant','label'])assert.ok(source.includes(name),name)
})
