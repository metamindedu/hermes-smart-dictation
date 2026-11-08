# Catalog release evidence and gates

This file records the release design and required verification, not a maintainer approval badge. Exact commit IDs, completed checks and review outcomes belong to the immutable source commit's CI and the catalog PR. Publication, PR submission and actual catalog listing are separate outcomes.

## 0.4 public-surface design

- The embedded model/effort adapter was removed, not hidden behind dynamic imports, re-exports, a subprocess or an authenticated core-HTTP proxy. The user-approved replacement is public SDK navigation to the native Smart Dictation auxiliary-model row. The plugin performs no model/config writes; the user chooses the native settings profile/save targets with native account and cost controls.
- Only public owner-scoped config helpers and third-party faster-whisper APIs are used for local transcription. Model loading is cache-only. The plugin's config validation/confidence policy is independent of Hermes private decoder helpers; configuration supplies language/device, absent language means automatic detection, and legacy ambient language variables are not read.
- The correction route remains the released, owner/session-routed `llm.oneshot`; no new trust grants, tools, skill discovery or agent dispatcher are introduced. Current/future profiles are not auto-enrolled and remote routes are unsupported.
- Recording defaults ON only for absent preferences, preserves explicit OFF and fails closed on malformed preferences. Installing/mounting/opening/saving never captures audio.
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
- Native forwarding buffers uploads before plugin size validation; decoded duration and a pre-buffer ingress bound are not certified.
- Native recovery/fallback can cause further requests. Cancellation/client timeouts do not guarantee immediate native/provider interruption, billing limits or final payer attribution.
- Temporary-file cleanup can fail after OS errors/crashes. Text retained for display is volatile; native/provider logs have separate policies.
- Already-mounted in-process API routes can remain old until an approved idle owner restart. Source publication is not automatic application to existing local installations.

## Recorded local candidate checks

The 0.4.0 candidate passed 64 frontend/native-fixture tests with zero skips and 55 synthetic Python tests (one upstream Starlette deprecation warning). A source-owned Hermes v0.23.0 environment, with both logical and app-level homes asserted isolated, ran `plugins validate --install-deps --json`: all checks passed, scanner safe, public SDK surface valid, no private-import warnings. These results do not imply real provider or physical microphone execution. Exact-commit review and remote CI remain separate gates.

## Primary references

The source versions below define the tested public floor. Use current official submission rules again when preparing a later catalog update.

- [Official catalog policy](https://github.com/NousResearch/hermes-agent/blob/main/plugin-catalog/README.md)
- [Official submission guide](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins/catalog-submission)
- [Released public-import allowlist](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_cli/plugin_validate_private_imports.py)
- [Released Desktop SDK](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/apps/desktop/src/sdk/index.ts)
- [faster-whisper public API](https://github.com/SYSTRAN/faster-whisper)
