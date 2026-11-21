import { useSyncExternalStore } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { Button, usePluginI18n } from '@hermes/plugin-sdk'
import { ID } from './core.mjs'
import { readinessRows } from './readiness.mjs'

const prose = { fontSize: 12, lineHeight: 1.65, color: 'var(--ui-text-tertiary)', margin: 0, overflowWrap: 'anywhere' }
export function ReadinessStatus({ probe }) {
  const t = usePluginI18n(ID)
  const state = useSyncExternalStore(fn => probe.subscribe(fn), () => probe.state, () => probe.state)
  return jsxs('section', { 'data-smart-dictation-readiness': '', 'aria-label': t('readinessHeading'), style: { display: 'grid', gap: 8, minWidth: 0 }, children: [
    jsx('h4', { style: { fontSize: 13, fontWeight: 600, margin: 0 }, children: t('readinessHeading') }),
    jsx('p', { style: prose, children: t('readinessOwner', state.profile || t('unknownOwner')) }),
    jsx('p', { style: prose, children: t('readinessHelp') }),
    jsx(Button, { type: 'button', size: 'sm', variant: 'outline', disabled: !state.allowed || state.phase === 'checking', onClick: () => { void probe.check() }, style: { whiteSpace: 'normal', height: 'auto', minHeight: 30 }, children: t(state.phase === 'checking' ? 'readinessChecking' : 'readinessCheck') }),
    !state.allowed && jsx('p', { style: prose, children: t('nativeStatusLocalChat') }),
    state.phase === 'idle' && jsx('p', { style: prose, children: t('readinessNotChecked') }),
    state.phase === 'unverified' && jsx('p', { role: 'status', style: prose, children: t('readinessUnavailable') }),
    state.value && jsxs('div', { role: 'status', style: { display: 'grid', gap: 5, minWidth: 0 }, children: [
      ...readinessRows(state.value).map(key => jsx('p', { style: prose, children: t(key) }, key)),
      jsx('p', { style: prose, children: t('readinessSeparateConsent') }),
      jsxs('details', { children: [
        jsx('summary', { style: { fontSize: 12, cursor: 'pointer', overflowWrap: 'anywhere' }, children: t('readinessLimitsHeading') }),
        jsx('p', { style: { ...prose, marginTop: 6 }, children: t('readinessLimits') })
      ] })
    ] })
  ] })
}
