import { createElement, forwardRef, useSyncExternalStore, Children } from 'react'
import { locales } from '../src/locales.mjs'
export const usePluginI18n = () => (key, ...args) => typeof locales.en[key] === 'function' ? locales.en[key](...args) : locales.en[key] || key
export function atom(initial) { let value = initial; const ls = new Set(); return { get:()=>value, set:v=>{value=v; for(const f of ls) f()}, subscribe:f=>{ls.add(f); return ()=>ls.delete(f)} } }
export const useValue = a => useSyncExternalStore(a.subscribe, a.get, a.get)
export const host = { state: { focusedSessionOwner:atom({connectionId:'local',profile:'default'}), focusedSessionId:atom('runtime-1'), focusedStoredSessionId:atom('saved-1'), connectionId:atom('local'), profile:atom('default'), busy:atom(false) }, profileRoutes:async()=>[{connectionId:'local',mode:'local',profile:'default',targetProfile:'default'}], composer: {getDraft:async()=>'',setDraft:async()=>true,insertText:async()=>true}, requestProfile:async()=>{throw new Error('unexpected network')} }
export const Button = forwardRef(({variant,size,...p},ref)=>createElement('button',{...p,ref}))
// Primitive boundary: the real SDK CopyButton owns protected clipboard delivery.
export const CopyButton = ({text,label,disabled,onCopied,onCopyError})=>createElement('button',{disabled,onClick:async()=>{try{const value=typeof text==='function'?await text():text;await navigator.clipboard.writeText(value);onCopied?.()}catch(error){onCopyError?.(error)}}},label)
export const Input = forwardRef((p,ref)=>createElement('input',{...p,ref}))
export const Textarea = forwardRef((p,ref)=>createElement('textarea',{...p,ref}))
export const Checkbox = ({checked,onCheckedChange,...p})=>createElement('input',{...p,type:'checkbox',checked,onChange:e=>onCheckedChange(e.target.checked)})
export const Codicon = ({name,...p})=>createElement('span',{'data-icon':name})
export const Popover = ({children})=>createElement('div',{},children)
export const PopoverTrigger = ({children})=>children
export const PopoverContent = ({children,...p})=>createElement('div',{},children)
export const COMPOSER_AREAS={actions:'composer.actions'}
export const PALETTE_AREA='palette'
export const queryClient={fetchQuery(){throw new Error('unexpected job query in UI fixture')},removeQueries(){}}
export const SelectTrigger=()=>null
export const SelectValue=()=>null
export const SelectContent=()=>null
export const SelectItem=()=>null
export const Select=({value,onValueChange,disabled,children})=>{
  const [trigger,content]=Children.toArray(children)
  return createElement('select',{id:trigger?.props.id,'aria-label':trigger?.props['aria-label'],value,disabled,onChange:e=>onValueChange(e.target.value)},Children.toArray(content?.props.children).map(o=>createElement('option',{key:o.props.value,value:o.props.value},o.props.children)))
}
