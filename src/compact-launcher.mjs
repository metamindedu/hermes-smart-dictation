// Presentation-only compatibility rule for the installed Desktop composer.
// Unknown markup/locale fails open (the Core control remains visible).
// Historical selector helper only. The current renderer has no public per-slot
// owner proof, never calls this helper and never emits its marker or hide rule.
export function contextualMicRule(label) {
  if (typeof label !== 'string' || !label.trim() || /[\n\r\f\u0000]/u.test(label)) return ''
  const quoted = JSON.stringify(label).replace(/</gu, '\\3c ').replace(/>/gu, '\\3e ')
  return `[data-slot="composer-root"]:has([data-smart-dictation-control="contextual"]) [data-slot="fan-menu-anchor"]:has(> button[aria-label=${quoted}][aria-pressed="false"]) { display: none; }`
}

export const compactMicStyle = { width: 28, minWidth: 28, height: 28, padding: 0, flexShrink: 0 }
export const compactArrowStyle = { width: 20, minWidth: 20, height: 28, padding: 0, flexShrink: 0 }
