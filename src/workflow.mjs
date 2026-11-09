import { DEFAULTS, settings, sameTarget, validLocalTarget } from './core.mjs'

const record = value => value && typeof value === 'object' && !Array.isArray(value)
const own = value => record(value) ? Object.fromEntries(Object.entries(value)) : {}

// Read raw storage before normalization: absent and present-empty are different.
export function workflowPreferences(raw) {
  const data = own(raw)
  const knownLegacy = Object.keys(DEFAULTS).some(key => Object.hasOwn(data, key))
  const explicit = Object.hasOwn(data, 'workflow')
  const valid = explicit && ['native', 'contextual'].includes(data.workflow)
  const workflow = raw === undefined ? 'native' : valid ? data.workflow : 'contextual'
  const cfg = settings(raw === undefined ? {} : record(raw) ? data : raw)
  if (raw !== undefined && (!record(raw) || (!explicit && !knownLegacy) || (explicit && !valid))) cfg.startOnClick = false
  return { ...cfg, workflow }
}

export function saveWorkflowPreferences(raw, draft) {
  const workflow = ['native', 'contextual'].includes(draft?.workflow) ? draft.workflow : 'contextual'
  const normalized = workflowPreferences({ ...settings(draft), workflow })
  return { ...own(raw), ...normalized }
}

export function contextualView(state, target, live) {
  if (!target || (validLocalTarget(live) && sameTarget(target, live))) return state
  return { ...state, raw: '', corrected: '', applied: null, warnings: [], message: '', phase: state.pending ? 'cancelled' : 'idle' }
}
