import { DEFAULTS, ownerKey, settings } from './core.mjs'
import { workflowPreferences } from './workflow.mjs'

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const own = (value, key) => record(value) && Object.hasOwn(value, key)
const mode = value => value === 'native' || value === 'contextual'
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[\u0000-\u001f\u007f]/u.test(value)
const encode = value => JSON.stringify(value)
export const FACTORY_WORKFLOW = 'contextual'
export const commonWorkflowKey = connectionId => id(connectionId) ? 'workflow-default:' + JSON.stringify(connectionId) : ''
export const profilePreferenceKey = owner => id(owner?.connectionId) && id(owner?.profile) ? 'settings:' + ownerKey(owner) : ''

export function workflowSelection(raw) {
  if (raw === undefined) return { selection: 'inherit', source: 'unset', editable: true }
  if (!record(raw)) return { selection: 'contextual', source: 'invalid', editable: false }
  if (own(raw, 'workflow') && mode(raw.workflow)) return { selection: raw.workflow, source: 'profile', editable: true }
  if (own(raw, 'workflow') && raw.workflow === 'inherit' && own(raw, 'workflowSchema') && raw.workflowSchema === 1) return { selection: 'inherit', source: 'inherit', editable: true }
  if (!own(raw, 'workflow') && Object.keys(DEFAULTS).some(key => own(raw, key))) return { selection: 'contextual', source: 'legacy', editable: true }
  return { selection: 'contextual', source: 'invalid', editable: false }
}

export function commonWorkflow(raw, connectionId) {
  if (raw === undefined) return { workflow: FACTORY_WORKFLOW, source: 'factory', editable: true }
  const valid = record(raw) && own(raw, 'schema') && raw.schema === 1 && own(raw, 'connectionId') && raw.connectionId === connectionId && own(raw, 'workflow') && mode(raw.workflow) && Object.keys(raw).every(key => ['schema', 'connectionId', 'workflow'].includes(key))
  return valid ? { workflow: raw.workflow, source: 'common', editable: true } : { workflow: 'native', source: 'invalid', editable: false }
}

// Public SDK reads conflate absent and corrupt serialized JSON. This is a
// presentation preference, never a recording, transmission or readiness grant.
export function preferenceState(storage, owner) {
  const key = profilePreferenceKey(owner), commonKey = commonWorkflowKey(owner?.connectionId)
  if (!key || !commonKey) return { cfg: { ...workflowPreferences(undefined), startOnClick: false }, selection: 'inherit', source: 'invalid', editable: false, raw: undefined, commonRaw: undefined, common: { workflow: 'native', source: 'invalid', editable: false } }
  const raw = storage.get(key, undefined), commonRaw = storage.get(commonKey, undefined)
  const selection = workflowSelection(raw), common = commonWorkflow(commonRaw, owner.connectionId)
  if (selection.selection !== 'inherit' || !selection.editable) return { raw, commonRaw, common, ...selection, cfg: workflowPreferences(raw) }
  const cfg = { ...settings(raw === undefined ? {} : raw), workflow: common.workflow }
  if (!common.editable) cfg.startOnClick = false
  return { raw, commonRaw, common, ...selection, source: common.source, cfg }
}

// Preserve this owner's fields. `keep` does not pin a currently inherited mode;
// legacy records stay legacy. A first Save of an unset record records inheritance.
export function savePreferenceRecord(raw, draft, intent = 'keep') {
  const before = workflowSelection(raw)
  if (!before.editable || !record(draft) || !['keep', 'inherit', 'native', 'contextual'].includes(intent)) throw new Error('invalid_preferences')
  const next = { ...(raw || {}), ...settings(draft) }
  const selected = intent === 'keep' ? before.selection : intent
  if (selected === 'inherit') { next.workflow = 'inherit'; next.workflowSchema = 1 }
  else if (intent !== 'keep') {
    next.workflow = selected
    if (next.workflowSchema === 1) delete next.workflowSchema
  }
  return next
}

export function persistPreferences(storage, owner, before, draft, intent, valid = () => true) {
  const key = profilePreferenceKey(owner)
  if (!key || !valid()) throw new Error('source_changed')
  const next = savePreferenceRecord(before, draft, intent)
  if (encode(storage.get(key, undefined)) !== encode(before)) throw new Error('preferences_changed')
  if (!valid()) throw new Error('source_changed')
  storage.set(key, next)
  if (encode(storage.get(key, undefined)) !== encode(next)) throw new Error('save_failed')
  return next
}

// One common-mode write only. Callers must verify an exact local route before
// dispatch and retain their owner/generation fence through asynchronous work.
export function persistCommonWorkflow(storage, connectionId, before, workflow, valid = () => true) {
  const key = commonWorkflowKey(connectionId)
  if (!key || !mode(workflow) || !commonWorkflow(before, connectionId).editable) throw new Error('invalid_preferences')
  if (!valid()) throw new Error('source_changed')
  if (encode(storage.get(key, undefined)) !== encode(before)) throw new Error('preferences_changed')
  const next = { schema: 1, connectionId, workflow }
  if (!valid()) throw new Error('source_changed')
  storage.set(key, next)
  if (encode(storage.get(key, undefined)) !== encode(next)) throw new Error('save_failed')
  return next
}

export function preferenceEventRelevant(key, connectionId) {
  return key === null || (typeof key === 'string' && (key.startsWith('hermes.plugin.smart-dictation.settings:') || key === 'hermes.plugin.smart-dictation.' + commonWorkflowKey(connectionId)))
}
