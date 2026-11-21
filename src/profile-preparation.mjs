import { pickRoute, validLocalTarget } from './core.mjs'
import { READINESS_METHOD, readinessRequest, parseReadiness } from './readiness.mjs'

// Use the host's exact route objects. Never retarget a source descriptor or
// infer a local route from a profile name. The status probe cannot distinguish
// a missing package from a disabled package, old host or unavailable owner.
export const PLUGINS_PAGE = '/capabilities?tab=plugins'
export const MAX_PREPARATION_PROFILES = 32
const profileId = /^[a-z0-9][a-z0-9_-]{0,63}$/u

export function preparationRoutes(routes, target) {
  pickRoute(routes, target) // the settings owner must itself be an exact local route
  const connection = target.owner.connectionId
  const byName = new Map()
  for (const route of routes) {
    if (route?.connectionId !== connection || typeof route.profile !== 'string' || !profileId.test(route.profile)) continue
    const entry = byName.get(route.profile) || []
    entry.push(route)
    byName.set(route.profile, entry)
  }
  const eligible = [...byName.values()].filter(rows => rows.length === 1 && rows[0].mode === 'local' && rows[0].profile === rows[0].targetProfile)
    .map(rows => rows[0]).sort((a, b) => a.profile.localeCompare(b.profile))
  if (eligible.length > MAX_PREPARATION_PROFILES) throw new Error('preparation_roster_limit')
  if (!eligible.some(route => route.profile === target.owner.profile)) throw new Error('preparation_owner_unavailable')
  return eligible
}

function nonce() {
  return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
}

// Only a user-started, sessionless read. No retries and no looser transport.
// A target added after the selection is never implicitly considered selected.
export async function checkPreparation({ routes, request, selected, target, current, progress, makeNonce = nonce }) {
  if (!validLocalTarget(target) || !Array.isArray(selected) || !selected.length || selected.length > MAX_PREPARATION_PROFILES || new Set(selected).size !== selected.length || !Array.from(selected).every(name => typeof name === 'string' && profileId.test(name))) throw new Error('invalid_preparation_selection')
  for (const profile of selected.slice()) {
    if (!current()) return
    let status = 'unverified'
    try {
      // Each RPC may let the owner registry change while it awaits its reply.
      // Refresh before the next dispatch without expanding the frozen selection.
      const roster = await routes()
      if (!current()) return
      const route = preparationRoutes(roster, target).find(candidate => candidate.profile === profile)
      if (route) {
        const payload = readinessRequest(profile, makeNonce())
        const reply = parseReadiness(await request(route, READINESS_METHOD, payload, 5000), payload)
        status = reply.task.registration_observed && reply.task.handle_state === 'active' ? 'observed' : 'registrationUnverified'
      }
    } catch { /* A missing route, timeout or refusal does not identify install/enable state. */ }
    if (!current()) return
    progress(profile, status)
  }
}
