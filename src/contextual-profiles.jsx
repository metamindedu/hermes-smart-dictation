import {useEffect,useRef,useState} from 'react'
import {jsx,jsxs} from 'react/jsx-runtime'
import {host,useValue,usePluginI18n,Button} from '@hermes/plugin-sdk'
import {ID,ownerKey,validLocalTarget,pickRoute} from './core.mjs'
import {setupProfiles} from './setup.mjs'
import {contextualPlan,applyContextualPlan} from './contextual-profiles.mjs'

const text={fontSize:12,lineHeight:1.65,margin:0,color:'var(--ui-text-tertiary)',overflowWrap:'anywhere'}
const button={whiteSpace:'normal',height:'auto',minHeight:30,maxWidth:'100%'}
const stamp=()=>JSON.stringify([host.state.connectionId.get(),host.state.profile.get(),ownerKey(host.state.focusedSessionOwner.get())])
export function ContextualProfiles({ctx,capture,canApply,onChanged}) {
 const t=usePluginI18n(ID),connection=useValue(host.state.connectionId),profile=useValue(host.state.profile),owner=useValue(host.state.focusedSessionOwner)
 const scope=JSON.stringify([connection,profile,ownerKey(owner)]),epoch=useRef(0),mounted=useRef(false),pending=useRef(false)
 const [view,setView]=useState({scope:'',plan:[],results:[],busy:false,error:false})
 const allowed=validLocalTarget(capture()),current=view.scope===scope,plan=current?view.plan:[],results=current?view.results:[]
 useEffect(()=>{
  mounted.current=true;let observed=stamp()
  const invalidate=()=>{const next=stamp();if(next===observed)return;observed=next;epoch.current++;pending.current=false;setView({scope:'',plan:[],results:[],busy:false,error:false})}
  const disposers=[host.state.connectionId,host.state.profile,host.state.focusedSessionOwner].map(a=>a.subscribe(invalidate))
  return()=>{mounted.current=false;epoch.current++;pending.current=false;for(const f of disposers)f()}
 },[ctx])
 const valid=token=>mounted.current&&token===epoch.current&&stamp()===scope&&validLocalTarget(capture())
 const load=async()=>{
  if(!allowed||pending.current)return
  const token=++epoch.current;pending.current=true;setView({scope,plan:[],results:[],busy:true,error:false})
  try {
   const routes=await host.profileRoutes()
   if(!valid(token))return
   pickRoute(routes,capture())
   const names=setupProfiles(routes,connection)
   const prepared=contextualPlan(ctx.storage,connection,names)
   setView({scope,plan:prepared,results:[],busy:false,error:false})
  } catch {if(valid(token))setView({scope,plan:[],results:[],busy:false,error:true})}
  finally {if(valid(token))pending.current=false}
 }
 const apply=async()=>{
  if(!current||!plan.length||pending.current||!valid(epoch.current)||!canApply())return
  const token=++epoch.current;pending.current=true;let changed=[]
  setView(v=>({...v,busy:true,error:false}))
  try {
   const routes=await host.profileRoutes()
   if(!valid(token)||!canApply())return
   pickRoute(routes,capture())
   const available=setupProfiles(routes,connection)
   if(plan.some(row=>!available.includes(row.profile)))throw new Error('targets_changed')
   changed=applyContextualPlan(ctx.storage,plan,()=>valid(token)&&canApply())
   if(valid(token))setView({scope,plan:[],results:changed,busy:false,error:false})
  } catch(error) {
   changed=error.completed||[]
   if(valid(token))setView({scope,plan:[],results:changed,busy:false,error:true})
  } finally {if(valid(token)){pending.current=false;setView(v=>({...v,busy:false}))}if(changed.length)onChanged(changed,valid(token))}
 }
 return jsxs('details',{'data-smart-dictation-contextual-profiles':'',children:[
  jsx('summary',{style:{fontSize:13,cursor:'pointer'},children:t('contextBatchTitle')}),
  jsxs('div',{style:{display:'grid',gap:8,paddingBlock:10,minWidth:0},children:[
   jsx('p',{style:text,children:t('contextBatchHelp')}),
   jsx('p',{style:text,children:t('contextBatchSource',owner?.profile||'—')}),
   jsx(Button,{type:'button',size:'sm',variant:'outline',style:button,disabled:!allowed||view.busy,onClick:()=>{void load()},children:t('contextBatchLoad')}),
   plan.length>0&&jsx('p',{style:text,children:t('contextBatchTargets',plan.map(p=>p.profile).join(', '))}),
   plan.length>0&&jsx(Button,{type:'button',size:'sm',style:button,disabled:view.busy||!canApply(),onClick:()=>{void apply()},'data-contextual-enable-all':'',children:t('contextBatchEnable',plan.length)}),
   results.length>0&&jsxs('div',{role:'status','data-contextual-batch-result':'',style:{display:'grid',gap:4},children:[
    jsx('p',{style:text,children:t('contextBatchDone',results.length)}),
    ...results.map(row=>jsx('p',{style:text,'data-contextual-profile':row.profile,children:row.profile+' · ON'},row.profile))
   ]}),
   view.error&&jsx('p',{role:'status',style:text,children:t('contextBatchError')})
  ]})
 ]})
}
