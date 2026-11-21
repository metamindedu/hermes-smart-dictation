import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir,access} from 'node:fs/promises'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {JSDOM} from 'jsdom'
import {createRoot} from 'react-dom/client'
import {act,createElement} from 'react'

const source=process.env.HERMES_NATIVE_SOURCE
let available=Boolean(source)
if(available)try{await access(path.join(source,'apps/desktop/src/components/ui/popover.tsx'))}catch{available=false}

test('native launcher focus ownership and explicit quick-record gestures',{skip:!available},async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true})
 for(const key of ['window','document','HTMLElement','HTMLButtonElement','HTMLInputElement','Element','Node','NodeFilter','DocumentFragment','CustomEvent','Event','FocusEvent','MouseEvent','MutationObserver','getComputedStyle'])globalThis[key]=dom.window[key]
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window)
 globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}}
 const require=createRequire(path.join(source,'apps/desktop/package.json'))
 const core=path.join(source,'apps/desktop/src')
 const sdk=`
 import {atom} from ${JSON.stringify(require.resolve('nanostores'))};
 export {atom}; export {useStore as useValue} from ${JSON.stringify(require.resolve('@nanostores/react'))};
 export {Button} from ${JSON.stringify(path.join(core,'components/ui/button.tsx'))};
 export {Popover,PopoverTrigger,PopoverContent} from ${JSON.stringify(path.join(core,'components/ui/popover.tsx'))};
 export {useI18n,usePluginI18n,Checkbox,Input,Textarea,CopyButton,Codicon,Select,SelectTrigger,SelectValue,SelectContent,SelectItem,COMPOSER_AREAS,PALETTE_AREA,queryClient,pluginSettingsHref} from './tests/sdk-fixture.mjs';
 export const host={state:{focusedSessionOwner:atom({connectionId:'local',profile:'default'}),focusedSessionId:atom('runtime-1'),focusedStoredSessionId:atom('saved-1'),connectionId:atom('local'),profile:atom('default'),busy:atom(false)},profileRoutes:async()=>[{connectionId:'local',profile:'default',targetProfile:'default',mode:'local'}],composer:{getDraft:()=>'',setDraft:()=>true},navigate:url=>{host.lastNavigation=url},requestProfile:async()=>{throw Error('unexpected request')}};`
 await mkdir('tests/.ui-fixture',{recursive:true})
 await build({entryPoints:['src/plugin.jsx'],outfile:'tests/.ui-fixture/native-launcher.mjs',bundle:true,format:'esm',platform:'node',banner:{js:"import {createRequire as fixtureRequire} from 'node:module';const require=fixtureRequire(import.meta.url);"},external:['react','react/jsx-runtime','react-dom','react-dom/client'],nodePaths:[path.join(source,'node_modules'),path.join(source,'apps/desktop/node_modules')],plugins:[{name:'native-fixture',setup(b){
  b.onResolve({filter:/^@hermes\/plugin-sdk$/},()=>({path:'sdk',namespace:'fixture'}))
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:sdk,resolveDir:process.cwd(),loader:'js'}))
  b.onLoad({filter:/[\\/]src[\\/]plugin\.jsx$/},a=>({contents:fs.readFileSync(a.path,'utf8')+'\nexport {host as fixtureHost};',resolveDir:path.dirname(a.path),loader:'jsx'}))
  b.onResolve({filter:/^@\/lib\/icons$/},()=>({path:'icons',namespace:'native-stub'}))
  b.onResolve({filter:/^@\/components\/ui\/menu$/},()=>({path:'menu',namespace:'native-stub'}))
  b.onLoad({filter:/.*/,namespace:'native-stub'},a=>({contents:a.path==='icons'?"import {createElement} from 'react';export const Loader2=()=>createElement('span');":"export const menuSurfaceClass='native-menu-fixture'",loader:'js'}))
  b.onResolve({filter:/^@\//},a=>{const base=path.join(core,a.path.slice(2));for(const p of [base,base+'.ts',base+'.tsx',base+'/index.ts'])if(fs.existsSync(p)&&fs.statSync(p).isFile())return{path:p};throw Error('missing alias '+a.path)})
 }}]})
 const plugin=await import('./.ui-fixture/native-launcher.mjs?native')
 const cleanup=[],registrations=[],values=new Map([['settings:'+JSON.stringify(['local','default']),{startOnClick:false}]]),tracks=[];let requests=0,mediaRequests=0,permission=null
 const navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator'),previousRecorder=globalThis.MediaRecorder
 const stream=()=>{const track={stops:0,stop(){this.stops++}};tracks.push(track);return{getTracks:()=>[track]}}
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>{mediaRequests++;return permission||Promise.resolve(stream())}}}})
 globalThis.MediaRecorder=class{static isTypeSupported(){return true}constructor(){this.state='inactive';this.mimeType='audio/webm'}start(){this.state='recording'}stop(){this.state='inactive';queueMicrotask(()=>this.onstop?.())}}
 plugin.default.register({i18n:{register(){},t:k=>k},storage:{get:(k,d)=>values.has(k)?values.get(k):d,set:(k,v)=>values.set(k,v)},rest:async url=>{requests++;assert.ok(url.startsWith('/status'));return{ok:true,profile:'default',stt:{provider:'local',available:true},max_audio_bytes:1000}},register:r=>registrations.push(r),registerSettingsPage(){},addEventListener:(target,type,fn)=>{target.addEventListener(type,fn);cleanup.push(()=>target.removeEventListener(type,fn))},onDispose:f=>cleanup.push(f)})
 const root=createRoot(document.getElementById('root'))
 try{
  await act(async()=>root.render(createElement(plugin.Launcher)))
  await act(async()=>{document.querySelector('button').click();await new Promise(r=>setTimeout(r,30))})
  assert.equal(document.querySelectorAll('[data-smart-dictation-panel]').length,1,'single native launcher control must open')
  assert.ok(document.querySelector('[data-slot="popover-content"]').style.maxHeight.includes('--radix-popover-content-available-height'),'the panel must respect native collision space, not just viewport height')
  await act(async()=>{document.querySelector('button').click();await new Promise(r=>setTimeout(r,30))})
  await act(async()=>root.render(createElement('div',{},createElement(plugin.Launcher),createElement(plugin.Launcher))))
  assert.equal(document.querySelectorAll('[data-smart-dictation-panel]').length,0)
  const buttons=[...document.querySelectorAll('button')].filter(b=>b.hasAttribute('data-smart-dictation-launcher'))
  assert.equal(buttons.length,2)
  await act(async()=>{buttons[0].click();await new Promise(r=>setTimeout(r,30))})
  assert.equal(document.querySelectorAll('[data-smart-dictation-panel]').length,1,'one clicked launcher must open one panel, not every mounted composer')
  assert.equal(requests,0)
  await act(async()=>{buttons[1].click();await new Promise(r=>setTimeout(r,20))})
  assert.equal(document.querySelectorAll('[data-smart-dictation-panel]').length,1,'switching composer keeps exactly one focus owner')
  await act(async()=>buttons[1].click())
  await act(async()=>root.render(createElement('div',{},createElement(plugin.Launcher),createElement(plugin.Launcher),createElement(plugin.SettingsForm))))
  assert.equal(document.getElementById('sd-start-on-click').checked,false)
  await act(async()=>document.getElementById('sd-start-on-click').click())
  assert.equal(mediaRequests,0,'editing opt-in never starts media')
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Save settings for this profile').click())
  assert.equal(mediaRequests,0,'saving opt-in never starts media')
  assert.equal([...values.values()][0].startOnClick,true)
  const main=[...document.querySelectorAll('[data-smart-dictation-launcher]')]
  assert.equal(main[0].textContent,'','compact toolbar has no visible text label')
  assert.equal(main[0].getAttribute('aria-label'),'Start recording')
  assert.equal(main[0].style.width,'28px')
  for(const b of main)b.getClientRects=()=>[{width:80,height:30}]
  await act(async()=>{document.querySelector('button[aria-label="Open panel without recording"]').click();await new Promise(r=>setTimeout(r,20))})
  assert.equal(mediaRequests,0,'panel-only arrow never starts media')
  await act(async()=>{registrations.find(r=>r.id==='open').data.run();await new Promise(r=>setTimeout(r,20))})
  assert.ok(plugin.fixtureHost.lastNavigation.includes('plugin=smart-dictation%3Asettings'))
  assert.equal(mediaRequests,0,'palette never starts media even with opt-in')
  await act(async()=>{main[0].click();main[0].click();await new Promise(r=>setTimeout(r,20))})
  assert.equal(mediaRequests,1,'rapid main clicks start only one recording')
  assert.equal(requests,1)
  assert.equal(main[0].textContent,'')
  assert.equal(main[0].getAttribute('aria-label'),'Stop and proofread')
  assert.equal(document.querySelectorAll('[data-smart-dictation-panel]').length,1)
  assert.equal(document.querySelectorAll('[data-smart-dictation-mic-style]').length,0,'focus-global work cannot prove an owning composer, so Core controls stay available')
  await act(async()=>{main[0].click();await new Promise(r=>setTimeout(r,20))})
  assert.equal(tracks[0].stops,1,'second main gesture stops and releases media')
  assert.equal(requests,1,'empty synthetic recording never calls ASR or a model')
  assert.equal(document.querySelectorAll('[data-smart-dictation-mic-style]').length,0,'failed empty recording restores Core controls')
  let resolve;permission=new Promise(r=>{resolve=r})
  await act(async()=>{main[0].click();await new Promise(r=>setTimeout(r,20))})
  assert.equal(mediaRequests,2)
  await act(async()=>plugin.fixtureHost.state.focusedStoredSessionId.set('another-session'))
  await act(async()=>{resolve(stream());await new Promise(r=>setTimeout(r,20))})
  assert.equal(tracks[1].stops,1,'late permission result after session switch is discarded')
  const count=mediaRequests
  values.set('settings:'+JSON.stringify(['local','claire']),{startOnClick:true})
  await act(async()=>{plugin.fixtureHost.state.focusedSessionOwner.set({connectionId:'local',profile:'claire'});plugin.fixtureHost.state.profile.set('claire')})
  await act(async()=>{document.querySelector('[data-smart-dictation-launcher]').click();await new Promise(r=>setTimeout(r,20))})
  assert.equal(mediaRequests,count,'unsupported owner never acquires media')
  values.set('settings:'+JSON.stringify(['local','fresh-native']),{workflow:'native'})
  await act(async()=>{plugin.fixtureHost.state.focusedSessionOwner.set({connectionId:'local',profile:'fresh-native'});plugin.fixtureHost.state.profile.set('fresh-native')})
  assert.equal(document.querySelector('[data-smart-dictation-launcher]'),null,'Native uses the existing Core mic, not an options launcher')
  assert.equal(document.querySelectorAll('[data-smart-dictation-native]').length,0)
  values.set('settings:'+JSON.stringify(['local','fresh-native']),{workflow:'contextual',startOnClick:false})
  await act(async()=>window.dispatchEvent(new dom.window.StorageEvent('storage',{key:'hermes.plugin.unrelated.settings:ignored'})))
  assert.equal(document.querySelector('[data-smart-dictation-launcher]'),null,'foreign storage notifications do not trigger adoption')
  await act(async()=>window.dispatchEvent(new dom.window.StorageEvent('storage',{key:'hermes.plugin.smart-dictation.settings:'+JSON.stringify(['local','fresh-native'])})))
  assert.ok(document.querySelector('[data-smart-dictation-launcher]'),'a scoped cross-window preference update shows Context record')
  assert.equal(mediaRequests,count,'cross-window settings adoption never captures audio')
  const beforeNative={mediaRequests,requests}
  await act(async()=>registrations.find(r=>r.id==='open').data.run())
  assert.equal(plugin.fixtureHost.lastNavigation,'/settings?tab=plugins&plugin=smart-dictation%3Asettings')
  await act(async()=>registrations.find(r=>r.id==='advanced').data.run())
  assert.equal(plugin.fixtureHost.lastNavigation,'/settings?tab=plugins&plugin=smart-dictation%3Asettings&ppage=advanced')
  assert.deepEqual({mediaRequests,requests},beforeNative,'Settings and Advanced navigation never record, request data or invoke a model')
  assert.equal(document.querySelector('button[aria-label="Open panel without recording"]'),null)
 }finally{await act(async()=>root.unmount());for(const f of cleanup.reverse())f();if(navigatorDescriptor)Object.defineProperty(globalThis,'navigator',navigatorDescriptor);else delete globalThis.navigator;globalThis.MediaRecorder=previousRecorder;dom.window.close()}
})
