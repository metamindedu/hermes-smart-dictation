import { useEffect, useId, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { host, useValue, usePluginI18n, Button, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@hermes/plugin-sdk'
import { ID, ownerKey, pickRoute, validLocalTarget } from './core.mjs'
import { preferenceState, persistCommonWorkflow } from './preferences.mjs'

const prose = { margin: 0, fontSize: 12, lineHeight: 1.65, color: 'var(--ui-text-tertiary)', overflowWrap: 'anywhere' }
const selectStyle = { width: '100%', minWidth: 0, minHeight: 32, height: 'auto', whiteSpace: 'normal' }
function ModeSelect({ id, label, value, disabled, onChange, inherit, t }) {
  return jsxs('div', { style: { display: 'grid', gap: 6, minWidth: 0 }, children: [
    jsx('label', { htmlFor: id, style: { fontSize: 12, fontWeight: 500, minWidth: 0, overflowWrap: 'anywhere' }, children: label }),
    jsxs(Select, { value, disabled, onValueChange: onChange, children: [
      jsx(SelectTrigger, { id, 'aria-label': label, style: selectStyle, children: jsx(SelectValue, {}) }),
      jsxs(SelectContent, { children: [
        inherit && jsx(SelectItem, { value: 'inherit', children: t('workflow_inherit') }),
        jsx(SelectItem, { value: 'contextual', children: t('workflow_contextual') }),
        jsx(SelectItem, { value: 'native', children: t('workflow_native') })
      ] })
    ] })
  ] })
}

// Common mode is a separate one-key save. Profile model/context/shortcut values
// and explicit mode overrides are never copied by this card.
export function PreferenceModes({ ctx, capture, selection, onSelectionChange, disabled = false, selectionDisabled = false, canApply = () => true, onCommonChanged }) {
  const t = usePluginI18n(ID), uid = useId()
  const owner = useValue(host.state.focusedSessionOwner)
  const connection = useValue(host.state.connectionId), profile = useValue(host.state.profile)
  const scope = JSON.stringify([ownerKey(owner), connection, profile])
  const currentState = () => preferenceState(ctx.storage, capture().owner)
  const first = preferenceState(ctx.storage, owner)
  const [draft, setDraft] = useState(first.common.workflow)
  const baseline = useRef(first.commonRaw), dirty = useRef(false), epoch = useRef(0), pending = useRef(false), mounted = useRef(false)
  const [busy, setBusy] = useState(false), [saved, setSaved] = useState(false), [failed, setFailed] = useState(false)
  const liveScope = () => JSON.stringify([ownerKey(capture().owner), capture().activeConnectionId, capture().activeProfile])
  const current = token => mounted.current && token === epoch.current && scope === liveScope() && validLocalTarget(capture())
  useEffect(() => {
    mounted.current = true
    let observed = liveScope()
    const invalidate = () => {
      const next = liveScope()
      if (next === observed) return
      observed = next; epoch.current++; pending.current = false
      if (mounted.current) { setBusy(false); setSaved(false); setFailed(false) }
    }
    const disposers = [host.state.focusedSessionOwner, host.state.connectionId, host.state.profile].map(atom => atom.subscribe(invalidate))
    return () => { mounted.current = false; epoch.current++; pending.current = false; for (const dispose of disposers) dispose() }
  }, [ctx, capture])
  useEffect(() => {
    const value = currentState(); baseline.current = value.commonRaw; dirty.current = false
    setDraft(value.common.workflow); setSaved(false); setFailed(false)
  }, [scope])
  const commonRaw = JSON.stringify(first.commonRaw)
  useEffect(() => {
    if (dirty.current || pending.current) return
    const changed=JSON.stringify(baseline.current)!==commonRaw
    baseline.current = first.commonRaw; setDraft(first.common.workflow); if(changed)setSaved(false)
  }, [commonRaw, scope])
  const reload = () => {
    if (pending.current) return
    const value = currentState(); baseline.current = value.commonRaw; dirty.current = false
    setDraft(value.common.workflow); setSaved(false); setFailed(false)
  }
  const save = async () => {
    if (disabled || pending.current || !current(epoch.current) || !canApply()) return
    const target = capture(), token = ++epoch.current, before = baseline.current, workflow = draft
    pending.current = true; setBusy(true); setSaved(false); setFailed(false)
    try {
      pickRoute(await host.profileRoutes(), target)
      if (!current(token)) return
      if (!canApply()) throw new Error('busy')
      const next = persistCommonWorkflow(ctx.storage, target.owner.connectionId, before, workflow, () => current(token) && canApply())
      baseline.current = next; dirty.current = false; setSaved(true); onCommonChanged?.()
    } catch { if (current(token)) setFailed(true) }
    finally { if (current(token)) { pending.current = false; setBusy(false) } }
  }
  const allowed = validLocalTarget(capture())
  const source = first.source === 'legacy' ? 'workflowSourceLegacy' : first.source === 'profile' ? 'workflowSourceProfile' : first.source === 'invalid' ? 'workflowSourceInvalid' : 'workflowSourceCommon'
  return jsxs('section', { 'data-smart-dictation-mode-settings': '', style: { display: 'grid', gap: 12, minWidth: 0 }, children: [
    jsx('h4', { style: { margin: 0, fontSize: 13 }, children: t('workflowHeading') }),
    jsx(ModeSelect, { id: uid + '-profile', label: t('profileWorkflow', owner?.profile || t('unknownOwner')), value: selection, disabled: disabled || selectionDisabled || !allowed, onChange: onSelectionChange, inherit: true, t }),
    jsx('p', { style: prose, children: t(source) }),
    jsx('p', { style: prose, children: t('profileWorkflowSaveHelp') }),
    jsxs('details', { children: [
      jsx('summary', { style: { fontSize: 12, cursor: 'pointer' }, children: t('commonWorkflowHeading') }),
      jsxs('div', { style: { display: 'grid', gap: 8, paddingTop: 10, minWidth: 0 }, children: [
        jsx(ModeSelect, { id: uid + '-common', label: t('commonWorkflow'), value: draft, disabled: disabled || busy || !allowed || !first.common.editable, onChange: value => { dirty.current = true; setDraft(value); setSaved(false); setFailed(false) }, t }),
        jsx('p', { style: prose, children: t('commonWorkflowHelp') }),
        jsxs('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8 }, children: [
          jsx(Button, { type: 'button', size: 'sm', variant: 'outline', disabled: disabled || busy || !allowed || !first.common.editable, onClick: () => void save(), children: t(busy ? 'commonWorkflowSaving' : 'saveCommonWorkflow') }),
          failed && jsx(Button, { type: 'button', size: 'sm', variant: 'ghost', disabled: busy, onClick: reload, children: t('reloadPreferences') })
        ] }),
        saved && jsx('p', { role: 'status', style: prose, children: t('commonWorkflowSaved') }),
        (failed || !first.common.editable) && jsx('p', { role: 'status', style: prose, children: t('preferenceSaveFailed') })
      ] })
    ] })
  ] })
}
