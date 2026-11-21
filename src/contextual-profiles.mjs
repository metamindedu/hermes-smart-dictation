import {ownerKey} from './core.mjs'

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const encoded = value => JSON.stringify(value)
export function contextualPlan(storage, connectionId, profiles) {
  if (typeof connectionId !== 'string' || !connectionId || !Array.isArray(profiles) || !profiles.length || new Set(profiles).size !== profiles.length) throw new Error('invalid_targets')
  return profiles.map(profile => {
    if (typeof profile !== 'string' || !profile || profile.length > 160 || /[\u0000-\u001f\u007f]/u.test(profile)) throw new Error('invalid_targets')
    const key = 'settings:' + ownerKey({connectionId,profile})
    const raw = storage.get(key,undefined)
    if (raw !== undefined && !record(raw)) throw new Error('invalid_preferences')
    // Change only the explicitly requested workflow. Never copy another
    // profile's references, instructions, shortcut or model choices.
    return {profile,key,before:encoded(raw),next:{...(raw || {}),workflow:'contextual'}}
  })
}
export function applyContextualPlan(storage, plan, valid) {
  const result=[]
  const check = () => {if (!valid()) throw new Error('source_changed')}
  const unchanged = row => encoded(storage.get(row.key,undefined)) === row.before
  check()
  // Refuse an already-stale plan before any write, including later rows.
  if (plan.some(row => !unchanged(row))) throw new Error('preferences_changed')
  try {
    for (const row of plan) {
      check()
      if (!unchanged(row)) throw new Error('preferences_changed')
      const already = row.before === encoded(row.next)
      if (!already) storage.set(row.key,row.next)
      const saved = storage.get(row.key,undefined)
      if (encoded(saved) !== encoded(row.next)) throw new Error('save_failed')
      result.push({profile:row.profile,enabled:saved.workflow==='contextual',preserved:true,changed:!already})
    }
    return result
  } catch (error) {
    // No automatic rollback over another window's newer preferences.
    error.completed=result
    throw error
  }
}
