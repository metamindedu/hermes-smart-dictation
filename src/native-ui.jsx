import { useEffect, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { host, useValue, usePluginI18n, Button } from '@hermes/plugin-sdk'
import { ID, ownerKey, pickRoute, validLocalTarget } from './core.mjs'

const prose = { fontSize: 12, lineHeight: 1.65, color: 'var(--ui-text-tertiary)', margin: 0, overflowWrap: 'anywhere' }
const fields = ['selected', 'correction_enabled', 'consent_valid', 'config_valid', 'library_available', 'cache_available', 'model_load_tested']
export function parseNativeStatus(value, profile) {
  if (value?.ok !== true || value.profile !== profile || !value.native || fields.some(key => typeof value.native[key] !== 'boolean') || value.native.model_load_tested !== false) throw new Error('backend_unavailable')
  return Object.fromEntries(fields.map(key => [key, value.native[key]]))
}

// Explicit read-only check: no LLM, audio, setup/config write or model loading.
export function NativeStatus({ capture, backend }) {
  const t = usePluginI18n(ID)
  const owner = useValue(host.state.focusedSessionOwner)
  const connection = useValue(host.state.connectionId), profile = useValue(host.state.profile)
  const scope = JSON.stringify([ownerKey(owner), connection, profile])
  const epoch = useRef(0), pending = useRef(false), mounted = useRef(false)
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const allowed = validLocalTarget(capture())
  useEffect(() => {
    mounted.current = true
    const invalidate = () => { epoch.current++; pending.current = false; if (mounted.current) { setSnapshot(null); setLoading(false); setFailed(false) } }
    const disposers = [host.state.focusedSessionOwner, host.state.connectionId, host.state.profile].map(atom => atom.subscribe(invalidate))
    return () => { mounted.current = false; invalidate(); for (const dispose of disposers) dispose() }
  }, [backend])
  useEffect(() => { setSnapshot(null); setFailed(false); setLoading(false) }, [scope])
  const current = token => mounted.current && token === epoch.current && validLocalTarget(capture()) && ownerKey(capture().owner) === ownerKey(owner) && capture().activeConnectionId === connection && capture().activeProfile === profile
  const check = async () => {
    if (!allowed || pending.current || !current(epoch.current)) return
    const target = capture(), token = ++epoch.current
    pending.current = true; setLoading(true); setFailed(false); setSnapshot(null)
    try {
      pickRoute(await host.profileRoutes(), target)
      if (!current(token)) return
      const value = await backend.request(target, '/native-status', { timeoutMs: 12000 }, () => { if (!current(token)) throw new Error('owner_unavailable') })
      if (current(token)) setSnapshot({ scope, value: parseNativeStatus(value, target.owner.profile) })
    } catch { if (current(token)) setFailed(true) }
    finally { if (current(token)) { pending.current = false; setLoading(false) } }
  }
  const status = snapshot?.scope === scope ? snapshot.value : null
  return jsxs('section', { 'aria-label': t('nativeStatusHeading'), style: { display: 'grid', gap: 8, minWidth: 0 }, children: [
    jsx('h4', { style: { margin: 0, fontSize: 13, fontWeight: 600 }, children: t('nativeStatusHeading') }),
    jsx('p', { style: prose, children: t('nativeStatusHelp') }),
    jsx(Button, { type: 'button', size: 'sm', variant: 'outline', disabled: !allowed || loading, onClick: () => { void check() }, style: { whiteSpace: 'normal', height: 'auto', minHeight: 30 }, children: t(loading ? 'nativeStatusLoading' : 'nativeStatusCheck') }),
    !allowed && jsx('p', { style: prose, children: t('nativeStatusLocalChat') }),
    status && jsxs('div', { role: 'status', style: { display: 'grid', gap: 4 }, children: [
      jsx('p', { style: prose, children: t(status.selected ? 'nativeSelected' : 'nativeNotSelected') }),
      jsx('p', { style: prose, children: t(status.library_available ? 'nativeLibraryFound' : 'nativeLibraryMissing') }),
      jsx('p', { style: prose, children: t(status.cache_available ? 'nativeCacheFound' : 'nativeCacheMissing') }),
      jsx('p', { style: prose, children: t(!status.config_valid || (status.correction_enabled && !status.consent_valid) ? 'nativePolicyReview' : status.correction_enabled ? 'nativeCorrectionOn' : 'nativeCorrectionOff') }),
      jsx('p', { style: prose, children: t('nativeLoadUntested') })
    ] }),
    failed && jsx('p', { role: 'status', style: prose, children: t('nativeStatusFailed') })
  ] })
}
