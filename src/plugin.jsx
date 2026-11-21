import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { host, atom, queryClient, useValue, usePluginI18n, Button, Checkbox, Input, Textarea, Codicon, Popover, PopoverTrigger, PopoverContent, COMPOSER_AREAS, PALETTE_AREA, pluginSettingsHref } from '@hermes/plugin-sdk'
import { ID, VERSION, ownerKey, sameTarget, validLocalTarget, DictationController, safeError } from './core.mjs'
import { RecorderCoordinator } from './media.mjs'
import { locales } from './locales.mjs'
import { ModelSettings } from './model-settings.jsx'
import { OwnerBackend } from './backend.mjs'
import { SetupGuide } from './setup-guide.jsx'
import { NativeStatus } from './native-ui.jsx'
import { contextualView } from './workflow.mjs'
import { preferenceState, persistPreferences, preferenceEventRelevant } from './preferences.mjs'
import { PreferenceModes } from './preference-settings.jsx'
import { ProfilePreparation } from './profile-preparation.jsx'
import { ReadinessProbe } from './readiness.mjs'
import { ReadinessStatus } from './readiness-ui.jsx'
import { compactMicStyle, compactArrowStyle } from './compact-launcher.mjs'
import { ContextualProfiles } from './contextual-profiles.jsx'

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

function configFor(owner) { return preferenceState(app.ctx.storage, owner).cfg }
function startRecording() { return app.recorder.start(configFor(capture().owner)) }
function openSettings(runtime, advanced = false) {
  if (app !== runtime) return
  host.navigate(pluginSettingsHref(ID + ':settings', advanced ? 'advanced' : undefined))
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
  useValue(preferencesVersion)
  const operation = useController()
  const owner = useValue(host.state.focusedSessionOwner)
  useValue(host.state.connectionId); useValue(host.state.profile)
  const key = ownerKey(owner)
  const stored = preferenceState(app.ctx.storage, owner)
  const [draft, setDraft] = useState(() => configFor(owner))
  const [selection, setSelection] = useState(stored.selection)
  const intent = useRef('keep'), baseline = useRef(stored.raw)
  const [loadedKey, setLoadedKey] = useState(key)
  const [saved, setSaved] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  useEffect(() => { const state=preferenceState(app.ctx.storage,owner);setDraft(state.cfg);setSelection(state.selection);baseline.current=state.raw;intent.current='keep';setLoadedKey(key);setSaved(false);setSaveFailed(false) }, [key])
  useEffect(()=>{if(selection==='inherit')setDraft(value=>value.workflow===stored.common.workflow?value:{...value,workflow:stored.common.workflow})},[stored.common.workflow,selection,key])
  const allowed = loadedKey === key && validLocalTarget(capture()) && stored.editable
  const operationBusy = active(operation) || operation.pending
  const update = (name, value) => { setDraft(s => ({ ...s, [name]: value })); setSaved(false);setSaveFailed(false) }
  const selectMode = value => {intent.current=value;setSelection(value);update('workflow',value==='inherit'?preferenceState(app.ctx.storage,capture().owner).common.workflow:value)}
  const reload = () => {const state=preferenceState(app.ctx.storage,capture().owner);baseline.current=state.raw;intent.current='keep';setDraft(state.cfg);setSelection(state.selection);setSaved(false);setSaveFailed(false)}
  const save = () => {
    if (!allowed || loadedKey !== key || !validLocalTarget(capture()) || key !== ownerKey(capture().owner)) return
    const live = app.controller.state
    if (draft.workflow !== configFor(capture().owner).workflow && (active(live) || live.pending)) return
    try {
      const next=persistPreferences(app.ctx.storage,capture().owner,baseline.current,draft,intent.current,()=>loadedKey===key&&key===ownerKey(capture().owner)&&validLocalTarget(capture()))
      baseline.current=next;intent.current='keep';preferencesVersion.set(preferencesVersion.get()+1);setSaved(true);setSaveFailed(false)
    } catch {setSaved(false);setSaveFailed(true)}
  }
  const modeBatchChanged = (rows, current) => {
    preferencesVersion.set(preferencesVersion.get()+1)
    if (!current || !rows.some(row=>row.enabled===true&&row.profile===capture().owner?.profile)) return
    // The batch owns only workflow. Rebase only that authorized field on our
    // original baseline; do not bless newer references/shortcuts under an old
    // full draft. Any unrelated external edit must still conflict on Save.
    baseline.current={...(baseline.current||{}),workflow:'contextual'}
    setSelection('contextual');intent.current='keep';setDraft(value=>({...value,workflow:'contextual'}));setSaved(false)
  }
  const checks = [
    ['includeInstructions', t('contextInstructions'), t('contextInstructionsHelp')],
    ['includeSoul', t('contextSoul'), t('contextSoulHelp')],
    ['includeTitle', t('contextTitleLabel'), t('contextTitleHelp')],
    ['includeHistory', t('contextHistory'), t('contextHistoryHelp')]
  ]
  return jsxs('div', { className: 'smart-dictation-settings', style: sectionStyle, children: [
    jsx(PreferenceModes,{ctx:app.ctx,capture,selection,onSelectionChange:selectMode,disabled:operationBusy,selectionDisabled:!allowed,canApply:()=>!active(app.controller.state)&&!app.controller.state.pending,onCommonChanged:()=>{preferencesVersion.set(preferencesVersion.get()+1);if(selection==='inherit')setDraft(value=>({...value,workflow:preferenceState(app.ctx.storage,capture().owner).common.workflow}))}}),
    showSetup && jsxs('section', { 'data-smart-dictation-core-voice': '', style: { ...sectionStyle, padding: 12, border: `1px solid ${line}`, borderRadius: 8 }, children: [
      jsx('h3', { style: { margin: 0, fontSize: 15 }, children: t(configFor(owner).workflow === 'contextual' ? 'contextVoiceHeading' : 'coreVoiceHeading') }),
      jsx('p', { style: proseStyle, children: t(configFor(owner).workflow === 'contextual' ? 'contextVoiceUsage' : 'coreVoiceUsage') }),
      jsx('p', { style: proseStyle, children: t('coreVoiceConversation') }),
      jsx('p', { style: proseStyle, children: t('coreVoiceScope', owner?.profile || t('unknownOwner')) }),
      jsx(ReadinessStatus, { probe: app.readiness }),
      jsxs('details', { children: [jsx('summary', { style: { fontSize: 12, cursor: 'pointer' }, children: t('readinessLegacyDetails') }), jsx(NativeStatus, { capture, backend: app.backend })] }),
      jsx('p', { style: proseStyle, children: t('coreVoiceConsent') })
    ] }),
    showSetup && jsx(ProfilePreparation, { capture }),
    showSetup && jsxs('details',{children:[jsx('summary',{style:{fontSize:12,cursor:'pointer'},children:t('existingWorkflowOverrides')}),jsx(ContextualProfiles, {ctx:app.ctx,capture,canApply:()=>!active(app.controller.state)&&!app.controller.state.pending,onChanged:modeBatchChanged})]}),
    showSetup && jsxs('details', { children: [jsx('summary', { style: { fontSize: 13, cursor: 'pointer' }, children: t('setupMore') }), jsx(SetupGuide, { ctx: app.ctx, settingsPage: true, native: true })] }),
    jsx('p', { style: proseStyle, children: t('scope', owner?.profile || t('unknownOwner')) }),
    !allowed && jsx(Notice, { children: t('localOnly') }),
    draft.workflow==='native'&&jsx('p',{style:proseStyle,children:t('nativeLimits')}),
    jsx(ModelSettings, { capture }),
    showSetup && jsx(Button, { type: 'button', size: 'sm', variant: 'outline', onClick: () => openSettings(app, true), children: t('openAdvanced') }),
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
    jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }, children: [jsx(Button, { type: 'button', size: 'sm', disabled: !allowed || (draft.workflow !== configFor(owner).workflow && operationBusy), onClick: save, children: t('save') }), saved && jsx('span', { role: 'status', style: { fontSize: 12, color: muted }, children: t('saved') }),saveFailed&&jsx(Button,{type:'button',size:'sm',variant:'ghost',onClick:reload,children:t('reloadPreferences')})] }),
    (saveFailed||!stored.editable)&&jsx('p',{role:'status',style:proseStyle,children:t('preferenceSaveFailed')})
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
    jsx('div', { role: 'status', 'aria-live': 'polite', style: { fontSize: 13, fontWeight: 500 }, children: t('phase_' + s.phase) }),
    jsxs('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' }, children: [
      jsx(Button, { type: 'button', size: 'sm', disabled: s.phase !== 'recording' && (busy || !targetSupported), onClick: () => s.phase === 'recording' ? app.recorder.stop(false) : run(startRecording), children: s.phase === 'recording' ? t('stop') : t('start') }),
      jsx(Button, { type: 'button', variant: 'outline', size: 'sm', disabled: busy || !targetSupported, onClick: () => run(() => app.controller.correctDraft(configFor(capture().owner))), children: t('correctDraft') }),
      busy && jsx(Button, { type: 'button', variant: 'ghost', size: 'sm', onClick: () => app.controller.cancel(), children: t('cancel') })
    ] }),
    jsx(ReadinessStatus, { probe: app.readiness }),
    jsx(SetupGuide, { ctx: app.ctx, forceOpen: s.message === 'backend_unavailable' }),
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
  return jsx(ContextualPanel, {})
}
export function Launcher() {
  const t = usePluginI18n(ID)
  useValue(host.state.connectionId); useValue(host.state.profile)
  useValue(host.state.focusedSessionId); useValue(host.state.focusedStoredSessionId)
  const [id] = useState(() => Symbol('smart-dictation-launcher'))
  const ref = useRef(null)
  const runtime = app
  const isOpen = useValue(open) === id
  const owner = useValue(host.state.focusedSessionOwner)
  useValue(preferencesVersion)
  const state = useController()
  const cfg = configFor(owner)
  const contextual = cfg.workflow === 'contextual' || ((active(state) || state.pending) && sameTarget(app.controller.target, capture()))
  const quick = contextual && cfg.startOnClick
  // Actions slots provide no per-composer owner. Global focus/controller state
  // cannot prove which mounted composer owns work, even after a launcher click.
  // Fail open: never inject a Core-mic hiding marker or rule from this renderer.
  const mainLabel = quick ? t(state.phase === 'recording' ? 'stop' : 'start') : t('advancedTitle')
  useEffect(() => {
    if (!contextual) return
    runtime.launchers.set(id, ref)
    return () => { runtime.launchers.delete(id); if (open.get() === id) open.set(null) }
  }, [runtime, id, contextual])
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
  if (!contextual) return null
  return jsxs(Popover, { open:isOpen, onOpenChange:v=>{if(v)showPanel();else if(open.get()===id)open.set(null)}, children: [
    jsxs('span', {style:{display:'inline-flex',alignItems:'center',gap:1,flexShrink:0},children:[
      jsx(PopoverTrigger, {asChild:true,children:jsx(Button,{ref,type:'button',variant:'ghost',size:'sm',title:mainLabel,'aria-label':mainLabel,'data-smart-dictation-launcher':'','aria-busy':active(state)||state.pending||undefined,onClick:activate,style:compactMicStyle,children:jsx(Codicon,{name:state.phase==='recording'?'debug-stop':'mic',size:'1rem'})})}),
      quick&&jsx(Button,{type:'button',variant:'ghost',size:'sm','aria-label':t('openPanel'),title:t('openPanel'),onClick:showPanel,style:compactArrowStyle,children:jsx(Codicon,{name:'chevron-down',size:'1rem'})})
    ]}),
    jsx(PopoverContent, { side: 'top', align: 'start', collisionPadding: 12, onCloseAutoFocus:event=>{const next=open.get();if(next!==null&&next!==id)event.preventDefault()}, 'aria-label': t('title'), style: { width: 'min(440px, calc(100vw - 28px))', maxHeight: 'min(740px, calc(100vh - 100px), var(--radix-popover-content-available-height, 740px))', overflowY: 'auto', overflowX: 'hidden', padding: 16 }, children: jsx(Panel, {}) })
  ] })
}
export default {
  id: ID, name: 'Smart Dictation', description: 'Dictation proofreading with selected reference context.', defaultEnabled: true,
  register(ctx) {
    ctx.i18n.register(locales)
    const runtime = { ctx, recorder: null, controller: null, backend: null, launchers:new Map(), lastLauncher:null,readiness:null }; app = runtime
    runtime.readiness = new ReadinessProbe({ capture, routes: () => host.profileRoutes(), request: (route, method, params, timeout) => host.requestProfile(route, method, params, timeout), queryClient })
    // Other native windows share this client-local namespace. A settings write
    // only rerenders controls; it never starts media or applies a draft.
    ctx.addEventListener?.(window,'storage',event=>{if(preferenceEventRelevant(event.key,capture().owner?.connectionId))preferencesVersion.set(preferencesVersion.get()+1)})
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
    for (const state of [host.state.focusedSessionOwner, host.state.focusedSessionId, host.state.focusedStoredSessionId, host.state.connectionId, host.state.profile]) if (state?.subscribe) ctx.onDispose(state.subscribe(() => {controller.observeOwner();runtime.readiness.observeOwner()}))
    ctx.register({ id: 'launcher', area: COMPOSER_AREAS.actions, order: 35, render: () => jsx(Launcher, {}) })
    ctx.register({ id: 'open', area: PALETTE_AREA, data: { id: 'smart-dictation.open', label: ctx.i18n.t('palette'), keywords: ['dictation', 'voice', '받아쓰기', '교정'], run: () => openSettings(runtime) } })
    ctx.register({ id: 'advanced', area: PALETTE_AREA, data: { id: 'smart-dictation.advanced', label: ctx.i18n.t('paletteAdvanced'), keywords: ['context', 'review', '문맥', '고급'], run: () => openSettings(runtime, true) } })
    ctx.registerSettingsPage?.({ id: 'settings', title: ctx.i18n.t('title'), icon: 'mic', render: () => jsxs('section', { style: { ...sectionStyle, padding: 20, maxWidth: 720 }, children: [jsx('h2', { style: { fontSize: 18, margin: 0 }, children: ctx.i18n.t('title') + ' ' + VERSION }), jsx(SettingsForm, {})] }), children: [{ id: 'advanced', title: ctx.i18n.t('advancedTitle'), render: () => jsx(ContextualPanel, {}) }] })
    ctx.onDispose(() => { runtime.readiness.dispose(); controller.dispose(); runtime.recorder.dispose(); runtime.launchers.clear(); open.set(null); if (app === runtime) app = null })
  }
}
