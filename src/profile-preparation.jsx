import { useEffect, useId, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { host, useValue, usePluginI18n, Button, Checkbox } from '@hermes/plugin-sdk'
import { ID, ownerKey, validLocalTarget } from './core.mjs'
import { checkPreparation, preparationRoutes, PLUGINS_PAGE } from './profile-preparation.mjs'

const scopeOf = t => JSON.stringify([ownerKey(t.owner), t.activeConnectionId, t.activeProfile])
const text = { margin: 0, fontSize: 12, lineHeight: 1.65, overflowWrap: 'anywhere', minWidth: 0 }
const actions = { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 8, minWidth: 0 }
const button = { whiteSpace: 'normal', overflowWrap: 'anywhere', height: 'auto', minHeight: 30, maxWidth: '100%' }
const empty = scope => ({ scope, names: null, chosen: [], results: {}, phase: 'idle' })

export function ProfilePreparation({ capture }) {
  const t = usePluginI18n(ID), uid = useId()
  useValue(host.state.focusedSessionOwner); useValue(host.state.connectionId); useValue(host.state.profile)
  const source = capture(), scope = scopeOf(source), allowed = validLocalTarget(source)
  const [store, setView] = useState(() => empty(scope))
  const view = store.scope === scope ? store : empty(scope)
  const job = useRef({ mounted: false, epoch: 0, busy: false })
  const busy = view.phase === 'loading' || view.phase === 'checking'

  useEffect(() => {
    const a = job.current; a.mounted = true
    let observed = scopeOf(capture())
    const invalidate = () => {
      const next = scopeOf(capture())
      if (observed === next) return
      observed = next; a.epoch++; a.busy = false
      setView(empty(next))
    }
    const off = [host.state.focusedSessionOwner, host.state.connectionId, host.state.profile].map(atom => atom.subscribe(invalidate))
    return () => { a.mounted = false; a.epoch++; a.busy = false; off.forEach(dispose => dispose()) }
  }, [capture])

  const start = async kind => {
    const a = job.current
    if (!a.mounted || a.busy || !allowed || scopeOf(capture()) !== scope) return
    const chosen = view.chosen.slice(), epoch = ++a.epoch
    if (kind === 'check' && !chosen.length) return
    const current = () => a.mounted && a.epoch === epoch && scopeOf(capture()) === scope
    a.busy = true
    setView({ ...view, phase: kind === 'load' ? 'loading' : 'checking', results: {} })
    try {
      if (kind === 'load') {
        const names = preparationRoutes(await host.profileRoutes(), source).map(route => route.profile)
        if (!current()) return
        setView({ ...empty(scope), names, chosen: view.names ? chosen.filter(name => names.includes(name)) : names })
      } else {
        await checkPreparation({ routes: () => host.profileRoutes(), request: (...args) => host.requestProfile(...args), selected: chosen, target: source, current,
          progress: (name, result) => setView(previous => ({ ...previous, results: { ...previous.results, [name]: result } })) })
        if (current()) setView(previous => ({ ...previous, phase: 'done' }))
      }
    } catch {
      if (current()) setView(previous => ({ ...previous, phase: 'error' }))
    } finally { if (current()) a.busy = false }
  }
  const select = chosen => {
    if (job.current.busy || !allowed || scopeOf(capture()) !== scope) return
    setView({ ...view, chosen, results: {}, phase: 'idle' })
  }

  return jsxs('section', { 'data-smart-dictation-profile-preparation': '', style: { display: 'grid', gap: 10, minWidth: 0, padding: 12, border: '1px solid var(--ui-stroke-secondary)', borderRadius: 8 }, children: [
    jsx('h3', { style: { margin: 0, fontSize: 15 }, children: t('profilePrepHeading') }),
    jsx('p', { style: text, children: t('profilePrepHelp') }),
    jsxs('div', { style: actions, children: [
      jsx(Button, { type: 'button', size: 'sm', variant: 'outline', style: button, disabled: !allowed || busy, onClick: () => { void start('load') }, children: t(view.names ? 'setupRefresh' : 'profilePrepLoad') }),
      jsx(Button, { type: 'button', size: 'sm', variant: 'outline', style: button, onClick: () => { if (job.current.mounted && scopeOf(capture()) === scope) host.navigate(PLUGINS_PAGE) }, children: t('profilePrepManage') }),
    ] }),
    view.names?.length > 0 && jsxs('fieldset', { style: { margin: 0, padding: 8, border: '1px solid var(--ui-stroke-secondary)', borderRadius: 6, minWidth: 0 }, children: [
      jsx('legend', { style: text, children: t('profilePrepTargets') }),
      jsx('div', { style: { display: 'grid', maxHeight: 220, overflowY: 'auto', gap: 8, minWidth: 0 }, children: view.names.map((name, index) => jsxs('div', { style: { display: 'grid', gap: 2, minWidth: 0 }, children: [
        jsxs('label', { htmlFor: `${uid}-${index}`, style: { ...text, display: 'flex', gap: 8, alignItems: 'flex-start' }, children: [
          jsx(Checkbox, { id: `${uid}-${index}`, checked: view.chosen.includes(name), disabled: busy, style: { flexShrink: 0, marginTop: 2 }, onCheckedChange: on => select(on === true ? [...new Set([...view.chosen, name])] : view.chosen.filter(value => value !== name)) }),
          jsx('span', { style: { minWidth: 0, overflowWrap: 'anywhere' }, children: name })
        ] }),
        Object.hasOwn(view.results, name) && jsx('span', { style: { ...text, marginInlineStart: 24 }, children: t('profilePrep_' + view.results[name]) })
      ] }, name)) }),
      jsxs('div', { style: { ...actions, marginTop: 8 }, children: [
        jsx(Button, { type: 'button', size: 'sm', variant: 'ghost', style: button, disabled: busy, onClick: () => select(view.names.slice()), children: t('setupSelectAll') }),
        jsx(Button, { type: 'button', size: 'sm', variant: 'ghost', style: button, disabled: busy, onClick: () => select([]), children: t('setupClear') }),
        jsx(Button, { type: 'button', size: 'sm', style: button, disabled: busy || !view.chosen.length || !allowed, onClick: () => { void start('check') }, children: t('profilePrepCheck', view.chosen.length) }),
      ] })
    ] }),
    !allowed && jsx('p', { style: text, children: t('profilePrepLocalOnly') }),
    view.phase !== 'idle' && jsx('p', { role: 'status', style: text, children: t('profilePrep_' + view.phase) }),
  ] })
}
