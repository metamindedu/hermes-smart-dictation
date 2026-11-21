# Native-first redesign: acceptance criteria

This is the product acceptance baseline, not a claim that implementation or deployment is complete. The released-host public-API architecture was independently reviewed before dependent implementation. The Native-first defaults below are historical; the approved 2026-11-12 phase-1 amendment supersedes them without declaring the original all-profile first-install outcome complete.

## Phase-1 amendment: common UI modes, not backend enrollment

- Fresh absent client preferences inherit a common Contextual presentation mode. Existing explicit Native/Contextual and legacy choices remain unchanged. Explicit inheritance survives unrelated saves; common saves do not create profile overrides or grant backend/correction consent.
- Native fresh policy requests correction ON but does not execute without recorded profile-wide transmission consent. Explicit saved OFF remains OFF; this is separate from the UI mode.
- The optional original-context readiness RPC reports only non-atomic declarations and registration-handle observations. Cache/model/ASR/correction execution, registry identity, resolved account/recovery and strict final-wire tool prevention remain unverified. No aggregate ready/safe flag or strict correction endpoint is exposed. Missing/older endpoints do not disable existing execution or invoke a looser fallback.
- Core idle microphones and stop controls remain reachable during every phase. The current public actions slot supplies no per-composer owner, so global focus/active work is insufficient to target a hiding rule. Fail open for every mounted launcher, including an operation started from Advanced settings; do not modify Core or infer ownership from a DOM position.
- New profiles inherit only a UI default and still need normal profile-scoped backend preparation. No shared engine or shared correction payer is approved. Cold installation, all-profile setup, actual device/provider execution, deployment and publication remain separate unmet gates unless independently verified.

## Approved Native policy

- Fresh installations use the Native workflow. Existing saved contextual preferences remain in Contextual until explicitly changed, preserving prior shortcuts and context choices.
- Native inherits stock Hermes insertion/undo behavior; it is not advertised as having Advanced's session/unchanged-draft guarantees. The user explicitly accepted this default after the limitation was disclosed.
- If enabled Native correction fails or is skipped after successful ASR, insert a fixed warning line and the complete original transcript. No raw speech is hidden inside an HTTP error or an ignored response extra. Blank/no-speech remains blank. Successful Native correction has no original/corrected comparison or plugin restore; Advanced retains them.
- Optional Native correction remains OFF until exact profile-wide transcript/cost consent. Choosing Native as the UI default is not paid-call consent, provider selection or permission to overwrite existing voice/model/account settings.

## Intended outcome

Make ordinary dictation use Hermes' existing microphone, recording transport and composer through a registered Smart Dictation transcription provider. Keep the existing explicit context/review workflow available as Advanced contextual dictation; do not silently remove selected SOUL/title/history, raw-text recovery, unchanged-draft fencing or restore.

## Boundaries

- Use released Hermes 0.23.0 public APIs, including the provider registrar and host-owned `ctx.llm` facade. Never copy another plugin's private decoder/LLM imports merely because its catalog pin is admitted.
- Registering, mounting, installing, discovering profiles and opening settings do not capture audio, run inference, transmit context, download weights or modify another profile.
- Local decoding remains local. No automatic cloud STT fallback or model download. Correction uses a bounded completion, never a new agent turn. The plugin supplies no tool dispatcher, but native task/destination/recovery extensions and text-only metadata projection prevent certification of strict tool-free final requests. Preserve existing execution; do not claim that this requirement was proved. Native account, cost, override and recovery policy stays in force.
- A selected native provider is not all-profile enrollment. Exact local targets are reviewed by the user; explicit OFF, other providers, models, accounts and unrelated settings are preserved unless the relevant change is separately authorized.
- Do not infer session identity from the newest conversation or a process-global active profile. Native provider context contains no session identity unless proved end to end. Session-aware features remain in the supported Advanced path if native transport cannot provide that identity.
- Trace native correction failure and result projection. Do not promise visible raw/corrected comparison, failure notices or restore in native mode when core ignores extra fields. Define an honest no-data-loss behavior before claiming native-mode parity.

## UI and migration

- Fresh installation exposes the native workflow first; Advanced contextual dictation is named explicitly, not confused with the built-in microphone.
- Preserve existing explicitly saved preferences, especially microphone shortcut OFF, selected context, instructions, model/account configuration and plugin disable choices. Distinguish absent preferences from existing saved settings during migration.
- First-use and settings guidance works even with no enabled Python backend or focused conversation. It explains which profile is being prepared and the remaining prerequisites.
- Profile checkboxes compose a setup request; they do not represent enabled/disabled status. Copying is never activation or chat submission.
- Read profile inventory only on an explicit gesture; filter to unique local routes on the exact connection. Preserve a manual subset and empty selection on refresh. Invalidate stale source, late response and unmounted callbacks.
- Provide a generic request that asks the agent to list/confirm targets if inventory is unavailable. Do not pretend every profile is prepared or future profiles auto-enroll.
- Cover English and Korean, long names, desktop/tablet/narrow geometry, warning-free render and visible clipboard success/failure semantics.

## Evidence required before publication

1. Focused unit/integration regressions, then exact committed source tests and reproducible bundle.
2. Real released-host provider registration/dispatch and public-import/dependency validation in isolated homes; no user config writes, credentials, paid calls or microphones.
3. Native consumer projection/owner contracts and explicitly disclosed fixture boundaries.
4. Fresh default/named profiles, explicit disabled choices, partial setup failure and later-created profiles; source/package presence is not runtime readiness.
5. Independent Heavy acceptance on the frozen candidate, with findings fixed and affected evidence repeated.
6. Exact remote release readback, CI, anonymous source bytes, truthful one-entry catalog update. Source release, operator installation, catalog PR submission and maintainer merge are separate statuses.

No live shared Gateway restart, core patch or broad profile deployment is implied by this document. Use supported, authorized deployment and verify actual adoption separately.
