import contract from '../contracts/readiness-v1.json' with { type: 'json' }
import { ID, ownerKey, pickRoute, validLocalTarget } from './core.mjs'

export const READINESS_VERSION = 'smart-dictation.readiness.v1'
export const READINESS_METHOD = contract.method
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))
const fail = () => { throw new Error('readiness_unverified') }

// This validator intentionally supports only the pinned, closed v1 schema.
// It is not a general JSON Schema engine or a native execution-safety test.
export function matchesReadinessSchema(value, name) {
  const budget = { nodes: 0 }, seen = new Set()
  const check = (v, schema, depth = 0) => {
    if (++budget.nodes > 2048 || depth > 12 || !schema) return false
    if (schema.oneOf) return schema.oneOf.filter(s => check(v, s, depth + 1)).length === 1
    if (Object.hasOwn(schema, 'const')) return v === schema.const
    if (schema.enum) return schema.enum.includes(v)
    if (schema.type === 'null') return v === null
    if (schema.type === 'boolean') return typeof v === 'boolean'
    if (schema.type === 'string') return typeof v === 'string' && (schema.minLength === undefined || [...v].length >= schema.minLength) && (schema.maxLength === undefined || [...v].length <= schema.maxLength) && (!schema.pattern || new RegExp(schema.pattern).test(v))
    if (schema.type === 'array') {
      if (!Array.isArray(v) || seen.has(v) || v.length < (schema.minItems ?? 0) || v.length > (schema.maxItems ?? 64)) return false
      if (Reflect.ownKeys(v).some(k => k !== 'length' && (typeof k !== 'string' || !/^(0|[1-9][0-9]*)$/.test(k) || Number(k) >= v.length))) return false
      for (let i = 0; i < v.length; i++) if (!Object.hasOwn(v, i) || !Object.hasOwn(Object.getOwnPropertyDescriptor(v, String(i)), 'value')) return false
      if (schema.uniqueItems && new Set(v).size !== v.length) return false
      seen.add(v)
      const ok = v.every((item, i) => schema.prefixItems?.[i] ? check(item, schema.prefixItems[i], depth + 1) : schema.items === false ? false : check(item, schema.items, depth + 1))
      seen.delete(v); return ok
    }
    if (schema.type === 'object') {
      if (!object(v) || seen.has(v)) return false
      const keys = Reflect.ownKeys(v), properties = schema.properties || {}
      if (keys.length > 64 || keys.some(k => typeof k !== 'string' || !Object.hasOwn(properties, k) || !Object.hasOwn(Object.getOwnPropertyDescriptor(v, k), 'value')) || (schema.required || []).some(k => !Object.hasOwn(v, k))) return false
      seen.add(v)
      const ok = keys.every(k => check(v[k], properties[k], depth + 1))
      seen.delete(v); return ok
    }
    return false
  }
  try { return check(value, contract.$defs[name]) } catch { return false }
}
function freezeTree(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freezeTree(child); Object.freeze(value) }
  return value
}
export function readinessRequest(profile, requestId) {
  const value = { schema_version: READINESS_VERSION, request_id: requestId, profile, owner_profile: profile }
  if (!matchesReadinessSchema(value, 'ReadinessRequest')) fail()
  return Object.freeze(value)
}
export function parseReadiness(value, request) {
  if (matchesReadinessSchema(value, 'ReadinessError')) fail()
  if (!matchesReadinessSchema(value, 'ReadinessResult') || value.request_id !== request.request_id || value.profile !== request.owner_profile) fail()
  if (contract.invariants.mandatory_limitations.some(k => !value.limitations.includes(k))) fail()
  const stt = value.local_stt
  if (stt.configuration === 'configured' && (value.config.read_state !== 'observed' || stt.enabled !== 'on' || !['local', 'smart_dictation'].includes(stt.selected_provider))) fail()
  if (value.config.read_state !== 'observed' && stt.configuration !== 'unverified') fail()
  // Copy only after exact closed-schema validation; no response mutation can
  // subsequently turn this non-atomic observation into an execution receipt.
  return freezeTree(JSON.parse(JSON.stringify(value)))
}
const scopeOf = target => JSON.stringify([ownerKey(target?.owner), target?.activeConnectionId ?? null, target?.activeProfile ?? null])
const nonce = () => {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

// A manual, sessionless metadata read. Nothing is fetched on construction,
// mount, preference saving, focus changes or palette navigation.
export class ReadinessProbe {
  constructor(deps) {
    this.d = deps; this.epoch = 0; this.disposed = false; this.listeners = new Set()
    this.scope = scopeOf(deps.capture()); this.queryKey = null
    this.state = this.snapshot('idle')
  }
  snapshot(phase, value = null) {
    const target = this.d.capture()
    return Object.freeze({ phase, value, profile: target?.owner?.profile || '', allowed: validLocalTarget(target) })
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn) }
  emit(phase, value = null) {
    if (this.disposed) return
    this.state = this.snapshot(phase, value)
    for (const fn of this.listeners) fn()
  }
  observeOwner() {
    const next = scopeOf(this.d.capture())
    if (this.disposed || next === this.scope) return
    this.scope = next; this.epoch++; this.emit('idle')
  }
  current(epoch, scope) { return !this.disposed && epoch === this.epoch && scope === this.scope && scope === scopeOf(this.d.capture()) && validLocalTarget(this.d.capture()) }
  assert(epoch, scope) { if (!this.current(epoch, scope)) fail() }
  async check() {
    this.observeOwner()
    if (this.disposed || !validLocalTarget(this.d.capture()) || this.state.phase === 'checking') return false
    const target = this.d.capture(), scope = this.scope, epoch = ++this.epoch
    this.emit('checking')
    let key
    try {
      const route = pickRoute(await this.d.routes(), target); this.assert(epoch, scope)
      const request = readinessRequest(target.owner.profile, (this.d.nonce || nonce)())
      // The request nonce also makes an explicit Check a fresh observation.
      // The public query client owns retention; there is no custom polling loop.
      key = [ID, 'readiness-v1', scope, epoch, request.request_id]; this.queryKey = key
      const value = await this.d.queryClient.fetchQuery({
        queryKey: key, staleTime: 10000, gcTime: 10000, retry: false,
        queryFn: async () => {
          this.assert(epoch, scope)
          const result = await this.d.request(route, READINESS_METHOD, request, 5000)
          this.assert(epoch, scope)
          return parseReadiness(result, request)
        }
      })
      this.assert(epoch, scope); this.emit('observed', parseReadiness(value, request)); return true
    } catch {
      if (this.current(epoch, scope)) this.emit('unverified')
      return false
    } finally {
      // No transcript, provider credentials or config is in this cache. Remove
      // this exact observation nonetheless; later checks always use a new nonce.
      if (key) try { this.d.queryClient.removeQueries({ queryKey: key, exact: true }) } catch {}
      if (this.queryKey === key) this.queryKey = null
    }
  }
  dispose() {
    this.disposed = true; this.epoch++; this.listeners.clear()
    if (this.queryKey) try { this.d.queryClient.removeQueries({ queryKey: this.queryKey, exact: true }) } catch {}
    this.state = Object.freeze({ phase: 'idle', value: null, profile: '', allowed: false })
  }
}

// Presentation only. No row, successful probe or configured preference produces
// a ready/safe flag or permission to hide the Core microphone.
export function readinessRows(value) {
  const s = value.local_stt, c = value.correction, t = value.task
  return [
    s.configuration === 'invalid' || s.configuration === 'unverified' ? 'readinessSpeechUnknown' : s.enabled === 'off' ? 'readinessSpeechOff' : s.selected_provider === 'smart_dictation' ? 'readinessSpeechSmart' : s.selected_provider === 'local' ? 'readinessSpeechLocal' : 'readinessSpeechOther',
    s.library_presence === 'present' ? 'readinessLibraryPresent' : s.library_presence === 'missing' ? 'readinessLibraryMissing' : 'readinessLibraryUnknown',
    t.registration_observed && t.handle_state === 'active' ? 'readinessTaskObserved' : 'readinessTaskUnknown',
    c.configured_task_provider === 'invalid' || c.configured_task_provider === 'unverified' || c.configured_task_model === 'unverified' ? 'readinessModelUnknown' : c.configured_task_model === 'present' ? 'readinessModelDeclared' : 'readinessModelNotDeclared',
    c.native_policy !== 'valid' ? 'readinessNativeReview' : c.native_requested === 'off' ? 'readinessNativeOff' : c.native_consent === 'valid' ? 'readinessNativeOptedIn' : 'readinessNativeReview',
    'readinessExecutionUntested'
  ]
}
