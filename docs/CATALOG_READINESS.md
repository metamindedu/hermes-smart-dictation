# Catalog release evidence and gates

This file records the release design and required verification, not a maintainer approval badge. Exact commit IDs, completed checks and review outcomes belong to the immutable source commit's CI and the catalog PR. Publication, PR submission and actual catalog listing are separate outcomes.

## 0.5 Native-first public-surface design

- The embedded model/effort adapter was removed, not hidden behind dynamic imports, re-exports, a subprocess or an authenticated core-HTTP proxy. The user-approved replacement is public SDK navigation to the native Smart Dictation auxiliary-model row. The plugin performs no model/config writes; the user chooses the native settings profile/save targets with native account and cost controls.
- Only public owner-scoped config helpers and third-party faster-whisper APIs are used for local transcription. Model loading is cache-only. The plugin's config validation/confidence policy is independent of Hermes private decoder helpers; configuration supplies language/device, absent language means automatic detection, and legacy ambient language variables are not read.
- Native registers `smart_dictation` through the released provider ABC and invokes the original context's public `ctx.llm.complete` on its owned correction task. Contextual keeps owner/session-routed `llm.oneshot`. No new override grants, tools, skill discovery or agent dispatcher are introduced. Provider choice is profile-wide; UI mode, provider selection and optional correction/transmission consent are separate. Current/future profiles are not auto-enrolled.
- Fresh UI preferences use Native; existing saved contextual choices remain Contextual until explicitly changed. Native uses the core microphone, not another recording/job service. Its accepted contract inherits stock insertion/undo and, on enabled-correction failure, inserts a fixed warning plus the complete original transcript. Full context/review/restore and strict draft/session fences remain Contextual. Native correction defaults OFF until exact profile-wide consent.
- The copy-only first-use guide works with no backend or focused conversation. It preserves target subsets/empty selection and invalidates stale scope/late replies. Selection/copying never activates profiles or sends a message. Native read-only setup checks inspect metadata, not model execution. Installing/mounting/opening/saving never captures audio.
- Root manifest, JavaScript bundle, versioned Python API entry, declared dependencies and catalog entry must agree on the actual released artifact. The compatibility fixture is Hermes v0.23.0 (`2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19`), not development main or a locally patched core.

## Required exact-release gates

1. `npm ci`, frontend tests, a deterministic bundle rebuild and the Python owner/job/STT/media/public-surface tests. Native-only fixtures require the explicit compatible source path; skips are disclosed rather than counted as native passes.
2. Native `hermes plugins validate <source> --install-deps --json` in an isolated environment/home, with no private-core-import warning and no runtime rebind/SDK violation. Dependency admission must not install weights or alter the operator's live environment.
3. Source-secret/privacy audit and independent semantic release review covering local-only audio, owner/session/draft generations, OFF context sources, unsupported routes, native model-settings delegation and exact public imports. Review the committed canonical tree, not just a working-directory bundle.
4. A real cropped screenshot with no chat, avatar, identifier, transcript or credential. `images/smart-dictation.png` shows the unchanged recording panel from the installed local build; it does not certify the new native-settings path or a physical microphone. The settings handoff has separate tests.
5. Public owner/repository verification; anonymous exact-SHA reads of the manifest, bundle and screenshot must match the reviewed bytes. The source repository uses MIT, a lockfile, pinned CI actions, narrow permissions and private vulnerability reporting.
6. A dedicated branch based on current upstream, changing only `plugin-catalog/smart-dictation.yaml`. Compare its capabilities, dependency/environment disclosures, version and compatibility floor to the exact package. Use a full 40-character source SHA and SHA-pinned gallery image; tier is community.
7. Read back the pushed source/catalog refs and submitted PR head/base/file set. Inspect exact-commit CI. A fork workflow waiting for maintainer approval is neither a pass nor a failure; only maintainer merge/publication establishes catalog availability.

## Limits that remain disclosed

- Synthetic audio, fake-media fixtures, real SDK fixtures, native host checks, actual model-provider inference and physical microphone tests are different acceptance levels. Offline tests do not establish provider entitlement or real device behavior.
- Native one-shot returns text without full final-provider/tool/finish metadata and may use a reasoning fallback when visible content is empty. The plugin executes no tools but cannot reconstruct missing native provenance.
- Native forwarding can buffer before plugin validation. Retained PCM/file/duration bounds are not a pre-buffer ingress guarantee, adversarial codec peak-allocation bound, OS sandbox or hard C++ runtime limit.
- Native recovery/fallback can cause further requests. Cancellation/client timeouts do not guarantee immediate native/provider interruption, billing limits or final payer attribution.
- Temporary-file cleanup can fail after OS errors/crashes. Text retained for display is volatile; native/provider logs have separate policies.
- Already-mounted in-process API routes can remain old until an approved idle owner restart. Source publication is not automatic application to existing local installations.

## Recorded local candidate checks

The earlier 0.4.0 candidate passed 64 frontend/native-fixture tests and 55 synthetic Python tests. The 0.5 integration work passed 93 frontend/native-contract tests with no skips and 88 Python tests (one upstream Starlette deprecation warning). A source-owned v0.23.0 environment with isolated logical/app homes ran `plugins validate --install-deps --json`: OK with zero warnings and no private-import warning.

The actual faster-whisper 1.2.1/CTranslate2 files-map constructor decoded a known offline synthetic speech WAV using an already-cached public base model, CPU/int8, with network blocked. The complete expected sentence was recognized. A separate actual released PluginManager/original PluginContext/facade gate test exercised real cached ASR, correction consent OFF/ON/OFF, a synthetic successful LLM transport, and a synthetic transport failure returning the warning plus all raw text. No override grants, network, paid completion, physical microphone or live-profile write were used. The substituted LLM transport is not real provider/account/billing acceptance.

Isolated browser fixtures exercised real native Button/Checkbox/Input/Textarea/CopyButton/Codicon controls and matching compiled CSS with synthetic profiles, mocked host/transport/clipboard services and an explicit fixture theme. Native selection/copy/status interactions and Korean mode switching/saving retained inactive context choices without recording/model calls. Mobile/tablet/desktop geometry was measured; these fixtures are not live installed-owner certification. Exact-commit review, CI, stock source installation and operator adoption remain separate release gates.

## Primary references

The source versions below define the tested public floor. Use current official submission rules again when preparing a later catalog update.

- [Official catalog policy](https://github.com/NousResearch/hermes-agent/blob/main/plugin-catalog/README.md)
- [Official submission guide](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins/catalog-submission)
- [Released public-import allowlist](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_cli/plugin_validate_private_imports.py)
- [Released Desktop SDK](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/apps/desktop/src/sdk/index.ts)
- [faster-whisper public API](https://github.com/SYSTRAN/faster-whisper)
