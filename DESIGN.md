# Smart Dictation — UX and acceptance

## User goal

A Hermes Desktop plugin that records a dictation, runs a tool-free correction pass, and inserts the corrected text into its original composer without sending the chat. User settings choose which context accompanies the transcript: optional custom correction instructions, the recording owner's SOUL.md, session title, and a bounded number of previous completed user/assistant conversation turns. No Decisions API.

## Main-owned interface

- Add a clearly named Smart Dictation control with localized labels beside the composer; leave native microphone/send/model controls unchanged.
- A compact popover shows owner profile and selected conversation, record/stop/cancel, state, latest raw transcript, corrected result, and a settings disclosure.
- Statuses distinguish recording, transcribing, correcting, applied, raw-only fallback, discarded because owner/draft changed, and failure.
- One-click recording defaults ON only for fresh/absent preferences, preserving saved OFF and failing closed for malformed values. Only the main recording-button gesture starts media; never mount, settings save, refresh, palette, panel arrow or registration. Stop tracks and cancel pending application on unload.
- Settings are scoped to the connection/profile owner, not a shared global text blob. Show that scope in the UI.
- Context toggles are independent: custom correction instructions, profile SOUL, session title, previous turns. Non-transcript reference context is opt-in. A fixed transcript-only safety contract remains mandatory even when custom instructions are excluded.
- History limits use completed user/assistant text only, never tool outputs, system messages, hidden analysis, other chats or other profiles. Offer a small recent-turn count and bounded content budget.
- Show what leaves the machine: STT uses the owner's cached local model only; transcript and selected context go to the correction model. Do not expose credentials.
- Model/effort selection is delegated to the native Hermes model settings auxiliary row. The plugin only navigates after confirming its local owner; it does not read credentials or persist model assignments. The user selects the native profile/save targets, with native cost and permission controls. No paid tests or other providers silently substituted.
- A normal successful correction automatically applies only when the original owner/session is still selected and the original draft snapshot has not changed. Otherwise keep the result for explicit review; never redirect into the newly focused chat.
- Keep original transcript and pre-insertion draft in volatile memory only; `원문 사용` and `삽입 전으로 복원` must check the same draft ownership/snapshot fences. Do not promise global undo.
- No auto-send. If STT succeeds but correction fails or times out, preserve the raw transcript and show that correction was skipped. Avoid silent network retries for speed unless the supported host facade requires them and this is disclosed.
- Theme-native controls and variables, wrapping labels, responsive max-width and bounded scroll. No hardcoded application colors or injected app-wide CSS.

## Acceptance

1. No Hermes core/DB patch or unrelated profile setting mutation. Explicitly authorized per-profile plugin placement and native activation are separate from model/STT/credential changes.
2. Native supported API discovery and Heavy architecture plan precede dependent implementation.
3. Offline tests cover context OFF means no access, history filtering/budgets, owner/late-result fences, draft conflicts, cancellation, malformed STT/LLM output, rejection of tool-call fields when present, timeout and raw fallback; the native text-only envelope cannot expose every provider-side provenance field, restore fences and cleanup.
4. API requests provide no tools, agent dispatch, skill execution, or transcript-triggered file reads. Treat selected reference material and spoken text as untrusted data.
5. Verify actual app-level JS load and settings rendering after installation. Keep isolated fixtures, native backend smoke, real provider completion and physical microphone tests clearly separate.
6. For the user's explicit all-profile request, enumerate and verify every current local profile through its own native host. Never treat root dashboard discovery as Python task registration, run named work as default, auto-enroll future profiles or grant built-in tool override. Preserve explicit recording OFF preferences.
7. No commit, push, publication, app restart, shared gateway restart or hidden permission expansion without additional authority.
## Catalog 0.4 approval and boundaries

The release moves the embedded selector to native Hermes settings by explicit product approval. STT uses public owner-scoped config and faster-whisper only, with config-based language/autodetection and explicit device behavior. The old private model adapter is removed rather than hidden or proxied. Existing operator installations are not silently upgraded by source publication. Public release requires dependency validation, exact-source tests, independent semantic review and an immutable source pin; listing requires maintainer merge.
