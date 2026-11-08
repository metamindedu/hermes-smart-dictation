import {useEffect,useRef,useState} from 'react'
import {jsx,jsxs} from 'react/jsx-runtime'
import {host,useValue,usePluginI18n,Button} from '@hermes/plugin-sdk'
import {ID,ownerKey,pickRoute,validLocalTarget} from './core.mjs'

// A native settings link, not an authenticated HTTP proxy. Hermes owns model
// validation, account routing, cost consent and persistence.
export const NATIVE_MODEL_SETTINGS='/settings?tab=config:model&aux=smart_dictation_correction'
const textStyle={fontSize:12,lineHeight:1.6,color:'var(--ui-text-tertiary)',margin:0,overflowWrap:'anywhere'}
export function ModelSettings({capture}) {
  const t=usePluginI18n(ID)
  const owner=useValue(host.state.focusedSessionOwner)
  const connection=useValue(host.state.connectionId),profile=useValue(host.state.profile)
  const scope=ownerKey(owner),epoch=useRef(0),pending=useRef(false)
  const [busy,setBusy]=useState(false),[failed,setFailed]=useState(false)
  useEffect(()=>{epoch.current++;pending.current=false;setBusy(false);setFailed(false);return()=>{epoch.current++}},[scope,connection,profile])
  const allowed=validLocalTarget(capture())
  const current=token=>token===epoch.current&&validLocalTarget(capture())&&ownerKey(capture().owner)===scope
  const open=async()=>{
    if(!allowed||pending.current||!current(epoch.current))return
    const target=capture(),token=++epoch.current
    pending.current=true;setBusy(true);setFailed(false)
    try {
      // Inventory is public metadata only; no configuration, credentials, context
      // source or model completion is fetched. Remote/ambiguous routes refuse.
      pickRoute(await host.profileRoutes(),target)
      if(!current(token))return
      host.navigate(NATIVE_MODEL_SETTINGS)
    } catch {if(current(token))setFailed(true)}
    finally {if(current(token)){pending.current=false;setBusy(false)}}
  }
  return jsxs('section',{'aria-label':t('modelHeading'),style:{display:'grid',gap:9,minWidth:0,borderBottom:'1px solid var(--ui-stroke-secondary)',paddingBottom:14},children:[
    jsx('h4',{style:{fontSize:13,fontWeight:600,margin:0},children:t('modelHeading')}),
    jsx('p',{style:textStyle,children:t('modelScope',owner?.profile||t('unknownOwner'))}),
    jsx(Button,{type:'button',size:'sm',variant:'outline',disabled:!allowed||busy,onClick:()=>void open(),children:t(busy?'modelOpening':'openModelSettings')}),
    jsx('p',{style:textStyle,children:t('modelNativeHelp')}),
    failed&&jsx('p',{role:'status',style:textStyle,children:t('modelNavigationFailed')})
  ]})
}
