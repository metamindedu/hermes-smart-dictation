import { useEffect, useId, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { host, useValue, usePluginI18n, Button, Checkbox, Textarea, CopyButton } from '@hermes/plugin-sdk'
import { ID } from './core.mjs'
import { setupScope, setupProfiles, retainSetupSelection } from './setup.mjs'

const prose = { margin: 0, fontSize: 12, lineHeight: 1.65, color: 'var(--ui-text-tertiary)', overflowWrap: 'anywhere' }
const liveScope = () => setupScope(host.state.connectionId.get(), host.state.profile.get())

// No backend dependency, automatic inventory, inference, chat submission or media access.
export function SetupGuide({ ctx, native = false, forceOpen = false, settingsPage = false }) {
  const t = usePluginI18n(ID)
  const connection = useValue(host.state.connectionId)
  const profile = useValue(host.state.profile)
  const scope = setupScope(connection, profile)
  const uid = useId()
  const hidden = () => Boolean(scope && ctx.storage.get('setup-guide-hidden:' + scope, false) === true)
  const [view, setView] = useState(() => ({ scope, open: settingsPage || !hidden() }))
  const [inventory, setInventory] = useState({ scope: '', profiles: [], selected: [], loaded: false })
  const [loading, setLoading] = useState('')
  const [feedback, setFeedback] = useState('')
  const [requestCorrection, setRequestCorrection] = useState(false)
  const sequence = useRef(0)
  const inflight = useRef(false)
  const mounted = useRef(false)
  const isOpen = view.scope === scope ? view.open : settingsPage || !hidden()
  const current = inventory.scope === scope && Boolean(scope)
  const profiles = current ? inventory.profiles : []
  const selected = current ? inventory.selected : []
  const request = t('setupAgentRequest', selected, native, requestCorrection)

  useEffect(() => {
    mounted.current = true
    // Invalidate even an A -> B -> A transition batched into one render.
    const invalidate = () => {
      sequence.current++; inflight.current = false
      if (mounted.current) {
        setLoading(''); setFeedback(''); setRequestCorrection(false)
        setInventory({ scope: '', profiles: [], selected: [], loaded: false })
      }
    }
    const disposers = [host.state.connectionId, host.state.profile].map(a => a.subscribe(invalidate))
    return () => { mounted.current = false; invalidate(); for (const dispose of disposers) dispose() }
  }, [ctx])
  useEffect(() => {
    sequence.current++; inflight.current = false
    setInventory({ scope: '', profiles: [], selected: [], loaded: false })
    setLoading(''); setFeedback(''); setRequestCorrection(false)
    setView({ scope, open: settingsPage || !hidden() })
  }, [scope, ctx, settingsPage])
  useEffect(() => { if (forceOpen) setView({ scope, open: true }) }, [forceOpen, scope])
  useEffect(() => { setFeedback(''); setRequestCorrection(false) }, [native])

  const load = async () => {
    if (!scope || liveScope() !== scope || inflight.current) return
    const ticket = ++sequence.current
    inflight.current = true; setLoading(scope); setFeedback('')
    const valid = () => mounted.current && ticket === sequence.current && liveScope() === scope
    try {
      const names = setupProfiles(await host.profileRoutes(), connection)
      if (!valid()) return
      setInventory(previous => ({ scope, profiles: names, loaded: true,
        selected: previous.scope === scope && previous.loaded
          ? retainSetupSelection(previous.selected, names) : names.includes(profile) ? [profile] : [] }))
      if (!names.length) setFeedback('setupNoProfiles')
    } catch { if (valid()) setFeedback('setupInventoryFailed') }
    finally { if (valid()) { inflight.current = false; setLoading('') } }
  }
  const choose = names => {
    if (liveScope() !== scope) return
    setFeedback('')
    setInventory(previous => previous.scope === scope
      ? { ...previous, selected: retainSetupSelection(names, previous.profiles) } : previous)
  }
  const copy = () => {
    if (!mounted.current || liveScope() !== scope) throw new Error('setup_scope_changed')
    return request
  }
  const hide = () => {
    if (!scope || liveScope() !== scope) return
    ctx.storage.set('setup-guide-hidden:' + scope, true)
    setView({ scope, open: false })
  }
  return jsxs('section', { 'data-smart-dictation-setup': '', style: { display: 'grid', gap: 10, minWidth: 0, padding: 12, border: '1px solid var(--ui-stroke-secondary)', borderRadius: 8 }, children: [
    jsx('style', { children: '.smart-dictation-setup-controls button{white-space:normal;overflow-wrap:anywhere;max-width:100%;height:auto;min-height:30px}.smart-dictation-setup-controls{min-width:0}' }),
    jsxs('div', { className: 'smart-dictation-setup-controls', style: { display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }, children: [
      jsx('h4', { style: { margin: 0, fontSize: 13, fontWeight: 600 }, children: t('setupHeading') }),
      jsx(Button, { type: 'button', size: 'sm', variant: 'ghost', 'aria-expanded': isOpen, onClick: () => setView({ scope, open: !isOpen }), children: t(isOpen ? 'setupCollapse' : 'setupExpand') })
    ] }),
    isOpen && jsxs('div', { style: { display: 'grid', gap: 10, minWidth: 0 }, children: [
      jsx('p', { style: prose, children: t(native ? 'setupNativeIntro' : 'setupContextIntro') }),
      jsx('p', { style: prose, children: t('setupNoActivation') }),
      jsxs('ol', { style: { ...prose, paddingInlineStart: 20 }, children: [
        jsx('li', { children: t('setupStepProfile') }),
        jsx('li', { children: t('setupStepLocal') }),
        jsx('li', { children: t('setupStepModel') })
      ] }),
      jsx('p', { style: prose, children: t('setupRequestHelp') }),
      jsx('div', { className: 'smart-dictation-setup-controls', children: jsx(Button, { type: 'button', size: 'sm', variant: 'outline', disabled: !scope || loading === scope, onClick: () => { void load() }, children: t(loading === scope ? 'setupLoading' : current && inventory.loaded ? 'setupRefresh' : 'setupChoose') }) }),
      profiles.length > 0 && jsxs('fieldset', { style: { margin: 0, padding: 10, border: '1px solid var(--ui-stroke-secondary)', borderRadius: 6, minWidth: 0 }, children: [
        jsx('legend', { style: prose, children: t('setupTargets') }),
        jsx('div', { style: { display: 'grid', gap: 8, maxHeight: 160, overflowY: 'auto', minWidth: 0 }, children: profiles.map((name, index) => jsxs('label', { htmlFor: `${uid}-${index}`, style: { display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0, cursor: 'pointer' }, children: [
          jsx(Checkbox, { id: `${uid}-${index}`, 'aria-label': name, checked: selected.includes(name), style: { flexShrink: 0, marginTop: 2 }, onCheckedChange: checked => choose(checked === true ? [...selected, name] : selected.filter(value => value !== name)) }),
          jsx('span', { style: { ...prose, minWidth: 0 }, children: name })
        ] }, name)) }),
        jsxs('div', { className: 'smart-dictation-setup-controls', style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }, children: [
          jsx(Button, { type: 'button', size: 'sm', variant: 'ghost', onClick: () => choose(profiles), children: t('setupSelectAll') }),
          jsx(Button, { type: 'button', size: 'sm', variant: 'ghost', onClick: () => choose([]), children: t('setupClear') })
        ] })
      ] }),
      jsx('p', { style: prose, children: t('setupSelection', selected.length) }),
      native && jsxs('label', { htmlFor: `${uid}-correction`, style: { display: 'flex', gap: 8, alignItems: 'flex-start', minWidth: 0 }, children: [
        jsx(Checkbox, { id: `${uid}-correction`, 'aria-label': t('setupCorrectionRequest'), checked: requestCorrection, onCheckedChange: value => { setRequestCorrection(value === true); setFeedback('') }, style: { flexShrink: 0, marginTop: 3 } }),
        jsxs('span', { style: { ...prose, minWidth: 0 }, children: [jsx('span', { style: { display: 'block', fontWeight: 500 }, children: t('setupCorrectionRequest') }), jsx('span', { style: { display: 'block' }, children: t('setupCorrectionHelp') })] })
      ] }),
      jsx(Textarea, { readOnly: true, 'aria-label': t('setupRequestLabel'), value: request, rows: 5, style: { width: '100%', minWidth: 0, maxWidth: '100%', resize: 'vertical', fontSize: 12, lineHeight: 1.6, overflowWrap: 'anywhere' } }),
      jsxs('div', { className: 'smart-dictation-setup-controls', style: { display: 'flex', flexWrap: 'wrap', gap: 8 }, children: [
        jsx(CopyButton, { text: copy, label: t('setupCopy'), buttonSize: 'sm', buttonVariant: 'outline', haptic: false,
          errorMessage: t('setupCopyFailed'), onCopied: () => { if (mounted.current && liveScope() === scope) setFeedback('setupCopied') },
          onCopyError: () => { if (mounted.current && liveScope() === scope) setFeedback('setupCopyFailed') } }, scope + ':' + native + ':' + requestCorrection),
        !settingsPage && jsx(Button, { type: 'button', size: 'sm', variant: 'ghost', disabled: !scope, onClick: hide, children: t('setupHide') })
      ] }),
      feedback && jsx('p', { role: 'status', style: prose, children: t(feedback) })
    ] })
  ] })
}
