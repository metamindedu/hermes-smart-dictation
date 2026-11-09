import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { host, atom, queryClient, useValue, usePluginI18n, Button, Checkbox, Input, Textarea, Codicon, Popover, PopoverTrigger, PopoverContent, COMPOSER_AREAS, PALETTE_AREA } from '@hermes/plugin-sdk'
import { ID, VERSION, ownerKey, sameTarget, validLocalTarget, DictationController, safeError } from './core.mjs'
import { RecorderCoordinator } from './media.mjs'
import { locales } from './locales.mjs'
import { ModelSettings } from './model-settings.jsx'
import { OwnerBackend } from './backend.mjs'
import { SetupGuide } from './setup-guide.jsx'
import { NativeStatus } from './native-ui.jsx'
import { workflowPreferences, saveWorkflowPreferences, contextualView } from './workflow.mjs'

// A shared boolean opens every mounted composer and their focus layers clash.
const open = atom(null)
const preferencesVersion = atom(0)
let app = null
const muted = 'var(--ui-text-tertiary)'
const line = 'var(--ui-stroke-secondary)'
const active = s => ['preparing', 'ready', 'recording', 'transcribing', 'correcting'].includes(s.phase)
const sectionStyle = { display: 'grid', gap: 12, minWidth: 0 }
const proseStyle = { fontSize: 12, lineHeight: 1.65, margin: 0, color: muted, overflowWrap: 'anywhere' }

function capture() {
  const owner = host.state.focusedSessionOwner?.get()
  return { owner: owner ? { ...owner } : null, runtimeId: host.state.focusedSessionId?.get() || null, storedId: host.state.focusedStoredSessionId?.get() || null, activeConnectionId: host.state.connectionId.get(), activeProfile: host.state.profile.get(), busy: host.state.busy.get() }
}
function rawConfigFor(owner) { return ownerKey(owner) ? app.ctx.storage.get('settings:' + ownerKey(owner), undefined) : undefined }
function configFor(owner) { return workflowPreferences(rawConfigFor(owner)) }
function startRecording() { return app.recorder.start(configFor(capture().owner)) }
function openExistingPanel(runtime) {
  if (app !== runtime) return
  const visible = [...runtime.launchers].filter(([, ref]) => ref.current?.isConnected && ref.current.getClientRects().length)
  const chosen = visible.find(([id]) => id === runtime.lastLauncher) || visible[0]
  if (chosen) open.set(chosen[0])
  else host.notify?.({kind:'info',message:runtime.ctx.i18n.t('panelUnavailable')})
}
function useController() {
  const controller = app.controller
  return useSyncExternalStore(fn => controller.subscribe(fn), () => controller.state, () => controller.state)
}
function Notice({ children }) { return jsx('p', { style: { ...proseStyle, padding: '9px 10px', border: `1px solid ${line}`, borderRadius: 7 }, children }) }
function CheckRow({ id, title, description, checked, onChange, disabled }) {
  return jsxs('label', { htmlFor: id, style: { display: 'flex', alignItems: 'flex-start', gap: 10, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? .6 : 1, minWidth: 0 }, children: [
    jsx(Checkbox, { id, checked, disabled, onCheckedChange: v => onChange(v === true), style: { marginTop: 3, flexShrink: 0 } }),
    jsxs('span', { style: { minWidth: 0, flex: 1 }, children: [jsx('span', { style: { display: 'block', fontSize: 13, fontWeight: 500 }, children: title }), jsx('span', { style: { ...proseStyle, display: 'block' }, children: description })] })
  ] })
}
export function SettingsForm({ showSetup = true } = {}) {
  const t = usePluginI18n(ID)
  const operation = useController()
  const owner = useValue(host.state.focusedSessionOwner)
  useValue(host.state.connectionId); useValue(host.state.profile)
  const key = ownerKey(owner)
  const [draft, setDraft] = useState(() => configFor(owner))
  const [loadedKey, setLoadedKey] = useState(key)
  const [saved, setSaved] = useState(false)
  useEffect(() => { setDraft(configFor(owner)); setLoadedKey(key); setSaved(false) }, [key])
  const allowed = loadedKey === key && validLocalTarget(capture())
  const operationBusy = active(operation) || operation.pending
  const update = (name, value) => { setDraft(s => ({ ...s, [name]: value })); setSaved(false) }
  const save = () => {
    if (!allowed || loadedKey !== key || !validLocalTarget(capture()) || key !== ownerKey(capture().owner)) return
    const live = app.controller.state
    if (draft.workflow !== configFor(capture().owner).workflow && (active(live) || live.pending)) return
    app.ctx.storage.set('settings:' + key, saveWorkflowPreferences(rawConfigFor(capture().owner), draft)); preferencesVersion.set(preferencesVersion.get() + 1); setSaved(true)
  }
  const checks = [
    ['includeInstructions', t('contextInstructions'), t('contextInstructionsHelp')],
    ['includeSoul', t('contextSoul'), t('contextSoulHelp')],
    ['includeTitle', t('contextTitleLabel'), t('contextTitleHelp')],
    ['includeHistory', t('contextHistory'), t('contextHistoryHelp')]
  ]
  return jsxs('div', { className: 'smart-dictation-settings', style: sectionStyle, children: [
    showSetup && jsx(SetupGuide, { ctx: app.ctx, settingsPage: true, native: draft.workflow === 'native' }),
    jsx('p', { style: proseStyle, children: t('scope', owner?.profile || t('unknownOwner')) }),
    !allowed && jsx(Notice, { children: t('localOnly') }),
    jsxs('fieldset', { style: { border: `1px solid ${line}`, borderRadius: 7, padding: 10, margin: 0, minWidth: 0 }, children: [
      jsx('legend', { style: { fontSize: 13 }, children: t('workflowHeading') }),
      jsx('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' }, children: ['native', 'contextual'].map(mode => jsx(Button, { type: 'button', size: 'sm', variant: draft.workflow === mode ? 'default' : 'outline', 'aria-pressed': draft.workflow === mode, disabled: !allowed || operationBusy, style: { whiteSpace: 'normal', height: 'auto', minHeight: 30 }, onClick: () => update('workflow', mode), children: t('workflow_' + mode) }, mode)) }),
      jsx('p', { style: { ...proseStyle, marginTop: 8 }, children: t('workflowHelp') }),
      draft.workflow === 'native' && jsx('p', { style: { ...proseStyle, marginTop: 8 }, children: t('nativeLimits') }),
      jsx('p', { style: { ...proseStyle, marginTop: 8 }, children: t('workflowSaveHelp') })
    ] }),
    jsx(ModelSettings, { capture }),
    showSetup && draft.workflow === 'native' && jsx(NativeStatus, { capture, backend: app.backend }),
    jsxs('details', { open: draft.workflow === 'contextual', children: [
    jsx('summary', { style: { fontSize: 13, cursor: 'pointer' }, children: t('contextPreferences') }),
    jsx('p', { style: { ...proseStyle, marginBlock: 8 }, children: t('contextPreferencesHelp') }),
    jsx(CheckRow, { id:'sd-start-on-click', title:t('startOnClick'), description:t('startOnClickHelp'), checked:draft.startOnClick, disabled:!allowed, onChange:v=>update('startOnClick',v) }),
    ...checks.map(([name, title, description]) => jsx(CheckRow, { id: `sd-${name}`, title, description, checked: draft[name], disabled: !allowed, onChange: v => update(name, v) }, name)),
    draft.includeInstructions && jsx(Textarea, { 'aria-label': t('contextInstructions'), value: draft.instructions, maxLength: 2000, disabled: !allowed, rows: 4, onChange: e => update('instructions', e.target.value), style: { width: '100%', minWidth: 0, resize: 'vertical', fontSize: 12, lineHeight: 1.6 } }),
    draft.includeHistory && jsxs('div', { style: { display: 'grid', gap: 6 }, children: [
      jsx('label', { htmlFor: 'sd-history-count', style: { fontSize: 12 }, children: t('historyCount') }),
      jsx(Input, { id: 'sd-history-count', type: 'number', min: 1, max: 5, value: draft.historyTurns, disabled: !allowed, onChange: e => update('historyTurns', e.target.value), style: { width: 100 } }),
      jsx('p', { style: proseStyle, children: t('historyCost') })
    ] }),
    jsx(CheckRow, { id: 'sd-auto', title: t('autoInsert'), description: t('autoInsertHelp'), checked: draft.autoInsert, disabled: !allowed, onChange: v => update('autoInsert', v) }),
    jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }, children: [jsx('label', { htmlFor: 'sd-timeout', style: { fontSize: 12 }, children: t('timeout') }), jsx(Input, { id: 'sd-timeout', type: 'number', min: 5, max: 60, value: draft.timeoutSeconds, disabled: !allowed, onChange: e => update('timeoutSeconds', e.target.value), style: { width: 85 } })] }),
    ] }),
    jsx(Notice, { children: t('modelDisclosure') }),
    jsxs('details', { children: [jsx('summary', { style: { fontSize: 12, cursor: 'pointer', color: muted }, children: t('requestDetails') }), jsx('p', { style: { ...proseStyle, marginTop: 8 }, children: t('requestHelp') })] }),
    jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }, children: [jsx(Button, { type: 'button', size: 'sm', disabled: !allowed || (draft.workflow !== configFor(owner).workflow && operationBusy), onClick: save, children: t('save') }), saved && jsx('span', { role: 'status', style: { fontSize: 12, color: muted }, children: t('saved') })] })
  ] })
}
export function ContextualPanel() {
  const t = usePluginI18n(ID)
  const state = useController()
  const owner = useValue(host.state.focusedSessionOwner)
  useValue(host.state.focusedSessionId); useValue(host.state.focusedStoredSessionId)
  useValue(host.state.connectionId); useValue(host.state.profile)
  const s = contextualView(state, app.controller.target, capture())
  const [showSettings, setShowSettings] = useState(false)
  const busy = active(s) || s.pending
  const targetSupported = validLocalTarget(capture())
  const run = fn => { void Promise.resolve().then(fn).catch(error => app?.controller.emit({ message: safeError(error) })) }
  return jsxs('div', { 'data-smart-dictation-panel': '', style: { ...sectionStyle, width: '100%' }, children: [
    jsxs('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }, children: [
      jsxs('div', { children: [jsx('h3', { style: { margin: 0, fontSize: 14, fontWeight: 600 }, children: t('title') }), jsx('p', { style: proseStyle, children: `${owner?.profile || t('unknownOwner')} · ${t('subtitle')}` })] }),
      jsx(Button, { type: 'button', variant: 'ghost', size: 'sm', 'aria-label': t('settings'), onClick: () => setShowSettings(v => !v), children: jsx(Codicon, { name: 'settings-gear', size: '1rem' }) })
    ] }),
    jsx(SetupGuide, { ctx: app.ctx, forceOpen: s.message === 'backend_unavailable' }),
    jsx('div', { role: 'status', 'aria-live': 'polite', style: { fontSize: 13, fontWeight: 500 }, children: t('phase_' + s.phase) }),
    jsxs('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' }, children: [
      jsx(Button, { type: 'button', size: 'sm', disabled: s.phase !== 'recording' && (busy || !targetSupported), onClick: () => s.phase === 'recording' ? app.recorder.stop(false) : run(startRecording), children: s.phase === 'recording' ? t('stop') : t('start') }),
      jsx(Button, { type: 'button', variant: 'outline', size: 'sm', disabled: busy || !targetSupported, onClick: () => run(() => app.controller.correctDraft(configFor(capture().owner))), children: t('correctDraft') }),
      busy && jsx(Button, { type: 'button', variant: 'ghost', size: 'sm', onClick: () => app.controller.cancel(), children: t('cancel') })
    ] }),
    !targetSupported && jsx(Notice, { children: t('localOnly') }),
    s.message && jsx(Notice, { children: t('error_' + s.message) }),
    ...s.warnings.map((w, i) => jsx('p', { style: proseStyle, children: t('warning_' + w) }, i)),
    s.pending && !active(s) && jsx('p', { style: proseStyle, children: t('pending') }),
    s.raw && jsxs('details', { open: ['raw', 'review', 'error'].includes(s.phase), children: [jsx('summary', { style: { fontSize: 12, cursor: 'pointer' }, children: t('rawLabel') }), jsx(Textarea, { 'aria-label': t('rawLabel'), readOnly: true, value: s.raw, rows: 3, style: { width: '100%', minWidth: 0, marginTop: 6, fontSize: 12 } })] }),
    s.corrected && jsxs('div', { style: { display: 'grid', gap: 6 }, children: [jsx('label', { htmlFor: 'sd-corrected', style: { fontSize: 12 }, children: t('correctedLabel') }), jsx(Textarea, { id: 'sd-corrected', readOnly: true, value: s.corrected, rows: 3, style: { width: '100%', minWidth: 0, fontSize: 12 } })] }),
    (s.raw || s.corrected || s.applied) && jsxs('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8 }, children: [
      s.corrected && !s.applied && jsx(Button, { type: 'button', variant: 'outline', size: 'sm', disabled: busy, onClick: () => run(() => app.controller.applyCorrected()), children: t('applyCorrected') }),
      s.raw && !s.applied && jsx(Button, { type: 'button', variant: 'ghost', size: 'sm', disabled: active(s), onClick: () => run(() => app.controller.applyRaw()), children: t('applyRaw') }),
      s.applied && jsx(Button, { type: 'button', variant: 'outline', size: 'sm', disabled: busy, onClick: () => run(() => app.controller.restore()), children: t('restore') })
    ] }),
    jsx('p', { style: proseStyle, children: t('footer') }),
    showSettings && jsxs('div', { style: { borderTop: `1px solid ${line}`, paddingTop: 14 }, children: [jsx('h4', { style: { margin: '0 0 12px', fontSize: 13, fontWeight: 600 }, children: t('contextTitle') }), jsx(SettingsForm, { showSetup: false })] })
  ] })
}
export function NativePanel() {
  const t = usePluginI18n(ID)
  const owner = useValue(host.state.focusedSessionOwner)
  const [showSettings, setShowSettings] = useState(false)
  return jsxs('div', { 'data-smart-dictation-panel': '', 'data-smart-dictation-native': '', style: sectionStyle, children: [
    jsxs('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }, children: [
      jsxs('div', { children: [jsx('h3', { style: { margin: 0, fontSize: 14, fontWeight: 600 }, children: t('title') }), jsx('p', { style: proseStyle, children: `${owner?.profile || t('unknownOwner')} · ${t('workflow_native')}` })] }),
      jsx(Button, { type: 'button', variant: 'ghost', size: 'sm', 'aria-label': t('settings'), onClick: () => setShowSettings(v => !v), children: jsx(Codicon, { name: 'settings-gear', size: '1rem' }) })
    ] }),
    jsx(Notice, { children: t('nativeMicHelp') }),
    jsx('p', { style: proseStyle, children: t('nativeLimits') }),
    jsx('p', { style: proseStyle, children: t('nativeFallback') }),
    jsx(SetupGuide, { ctx: app.ctx, native: true }),
    jsx(NativeStatus, { capture, backend: app.backend }),
    showSettings && jsx(SettingsForm, { showSetup: false })
  ] })
}
export function Panel() {
  const owner = useValue(host.state.focusedSessionOwner)
  useValue(preferencesVersion)
  const state = useController()
  const ownActive = active(state) && sameTarget(app.controller.target, capture())
  return configFor(owner).workflow === 'native' && !ownActive ? jsx(NativePanel, {}) : jsx(ContextualPanel, {})
}
export function Launcher() {
  const t = usePluginI18n(ID)
  const [id] = useState(() => Symbol('smart-dictation-launcher'))
  const ref = useRef(null)
  const runtime = app
  const isOpen = useValue(open) === id
  const owner = useValue(host.state.focusedSessionOwner)
  useValue(preferencesVersion)
  const state = useController()
  const cfg = configFor(owner)
  const contextual = cfg.workflow === 'contextual' || (active(state) && sameTarget(app.controller.target, capture()))
  const quick = contextual && cfg.startOnClick
  useEffect(() => {
    runtime.launchers.set(id, ref)
    return () => { runtime.launchers.delete(id); if (open.get() === id) open.set(null) }
  }, [runtime, id])
  const showPanel = () => { if(app!==runtime)return;runtime.lastLauncher = id; open.set(id) }
  const activate = event => {
    if (app !== runtime) { event.preventDefault(); return }
    runtime.lastLauncher = id
    // Only a main-button gesture starts media; never mount/onOpenChange/palette.
    const liveConfig = configFor(capture().owner)
    if (liveConfig.workflow !== 'contextual' || !liveConfig.startOnClick) return
    event.preventDefault()
    showPanel()
    const live = runtime.controller.state
    if (live.phase === 'recording') runtime.recorder.stop(false)
    else if (!active(live) && !live.pending) void startRecording().catch(error => runtime.controller.emit({message:safeError(error)}))
  }
  return jsxs(Popover, { open:isOpen, onOpenChange:v=>{if(v)showPanel();else if(open.get()===id)open.set(null)}, children: [
    jsxs('span', {style:{display:'inline-flex',alignItems:'center',gap:1},children:[
      jsx(PopoverTrigger, {asChild:true,children:jsxs(Button,{ref,type:'button',variant:'ghost',size:'sm',title:!contextual?t('nativeOptions'):quick?t(state.phase==='recording'?'stop':'start'):t('title'),'aria-label':t('title'),'data-smart-dictation-launcher':'','aria-busy':active(state)||state.pending||undefined,onClick:activate,style:{gap:5},children:[jsx(Codicon,{name:state.phase==='recording'?'debug-stop':'mic',size:'1rem'}),jsx('span',{style:{fontSize:11},children:t(!contextual?'nativeShort':quick?(state.phase==='recording'?'stopShort':'recordShort'):'shortLabel')})]})}),
      quick&&jsx(Button,{type:'button',variant:'ghost',size:'sm','aria-label':t('openPanel'),title:t('openPanel'),onClick:showPanel,style:{paddingInline:4},children:jsx(Codicon,{name:'chevron-down',size:'1rem'})})
    ]}),
    jsx(PopoverContent, { side: 'top', align: 'start', collisionPadding: 12, onCloseAutoFocus:event=>{const next=open.get();if(next!==null&&next!==id)event.preventDefault()}, 'aria-label': t('title'), style: { width: 'min(440px, calc(100vw - 28px))', maxHeight: 'min(740px, calc(100vh - 100px))', overflowY: 'auto', overflowX: 'hidden', padding: 16 }, children: jsx(Panel, {}) })
  ] })
}
export default {
  id: ID, name: 'Smart Dictation', description: 'Tool-free dictation proofreading with selected reference context.', defaultEnabled: true,
  register(ctx) {
    ctx.i18n.register(locales)
    const runtime = { ctx, recorder: null, controller: null, backend: null, launchers:new Map(), lastLauncher:null }; app = runtime
    const backend = new OwnerBackend(ctx, capture, queryClient)
    runtime.backend = backend
    const controller = new DictationController({
      capture, routes: () => host.profileRoutes(),
      status: target => backend.request(target, '/status', { timeoutMs: 12000 }),
      readSoul: target => backend.request(target, '/soul', { timeoutMs: 12000 }),
      rpc: (route, method, params, timeout) => host.requestProfile(route, method, params, timeout),
      getDraft: id => host.composer.getDraft(id),
      setDraft: (id, text) => host.composer.setDraft(id, text),

      transcribe: (blob, target, g) => backend.transcribe(blob, target, () => controller.assert(g), controller.backend),
      stopRecording: () => runtime.recorder?.cancel()
    }); runtime.controller = controller; runtime.recorder = new RecorderCoordinator(controller)
    for (const state of [host.state.focusedSessionOwner, host.state.focusedSessionId, host.state.focusedStoredSessionId, host.state.connectionId, host.state.profile]) if (state?.subscribe) ctx.onDispose(state.subscribe(() => controller.observeOwner()))
    ctx.register({ id: 'launcher', area: COMPOSER_AREAS.actions, order: 35, render: () => jsx(Launcher, {}) })
    ctx.register({ id: 'open', area: PALETTE_AREA, data: { id: 'smart-dictation.open', label: ctx.i18n.t('palette'), keywords: ['dictation', 'voice', '받아쓰기', '교정'], run: () => openExistingPanel(runtime) } })
    ctx.registerSettingsPage?.({ id: 'settings', title: ctx.i18n.t('title'), icon: 'mic', render: () => jsxs('section', { style: { ...sectionStyle, padding: 20, maxWidth: 720 }, children: [jsx('h2', { style: { fontSize: 18, margin: 0 }, children: ctx.i18n.t('title') + ' ' + VERSION }), jsx(SettingsForm, {})] }) })
    ctx.onDispose(() => { controller.dispose(); runtime.recorder.dispose(); runtime.launchers.clear(); open.set(null); if (app === runtime) app = null })
  }
}
