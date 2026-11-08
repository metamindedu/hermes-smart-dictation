# Smart Dictation

A community Hermes Desktop plugin for **local dictation → bounded proofreading → the original draft**. Messages are never automatically sent. Choose which reference context accompanies the transcript; keep the original and restore the previous draft when it is still unchanged.

![Smart Dictation recording panel](docs/images/smart-dictation.png)

## Requirements and installation

- Hermes **0.23.0 or newer**, with the Desktop app. The compatible-host fixtures pin released revision `2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19`; unreleased plugin-RPC APIs are not required.
- Hermes local STT explicitly configured with `stt.provider: local`, and an already-cached faster-whisper model. The normal plugin dependency admission installs the declared faster-whisper **library**, not model weights. Configure/cache the desired model through your normal local-STT setup first. The plugin never downloads a model, runs a dependency installer at runtime or substitutes cloud STT.
- A configured correction provider/account in Hermes. Choose a lightweight model for this auxiliary task; no vendor/model/language-specific default is shipped.
- Local faster-whisper support follows its native wheels: Windows x64, supported Linux architectures and Apple Silicon macOS. Windows ARM64, Intel macOS and Android are excluded by the dependency marker; no support is claimed for their local decoder.

Before catalog listing, install this public repository with an exact reviewed commit:

```sh
hermes plugins install https://github.com/metamindedu/hermes-smart-dictation --ref <full-reviewed-commit-sha> --enable
```

For a named local profile, use `hermes --profile <name> plugins install ... --ref <sha> --enable`. Follow Hermes' normal dependency/activation prompts. Python registration/backend activation is **per profile**; the Desktop JavaScript asset is **app-wide**. Other and future profiles are not automatically enrolled. A submitted catalog PR is not a listing until maintainers merge it.

## Use

Use **Record** beside the composer for one-click dictation, or its arrow to open the panel without recording. Click **Stop and proofread** to transcribe, correct and append to the original draft. **Proofread current draft** operates on text already in the input. A result applies only while its connection, profile, conversation, operation generation and original draft remain unchanged.

**Start recording from the toolbar** is ON for fresh/absent preferences. An explicit saved OFF is preserved; malformed values fail closed to OFF. Only the main recording-button gesture can start capture, after owner/context checks and microphone permission. Mounting, installing, opening settings, saving preferences, palette commands and the panel-only arrow never acquire the microphone. Each mounted composer has its own popup owner.

### Choose the correction model in Hermes

The plugin's **Open Hermes model settings** button opens the native model page at the **Smart Dictation correction** auxiliary row. Select the intended connection/profile and check the native save targets before applying. Select a lightweight correction model and the lowest suitable reasoning level offered by Hermes. Do not change the main-model row unless that is what you intend.

Hermes owns model/provider/account selection, supported effort choices, validation, cost confirmation and saving. This plugin neither writes model settings nor replaces credentials, endpoints or advanced overrides. Model settings are separate from the plugin's recording/context preferences. Unpinned auxiliary settings may inherit the main route; provider default is not necessarily reasoning OFF. Catalog availability is not proof of entitlement, speed or a successful request.

## Neutral defaults and optional reference context

Custom instructions start **empty and disabled**. SOUL, title and history are initially OFF. No language, product name, organization or personal style is baked into correction preferences. UI has English fallback and Korean localization; saved preferences are preserved.

Each source is independently selectable. OFF prevents its fetch and transmission:

- Additional correction instructions: up to 2,000 characters.
- The captured owner's saved SOUL.md: first 4,000 characters, as untrusted reference.
- The captured conversation title: up to 300 characters.
- Recent completed user/final-assistant turns: 1–5 turns, up to 6,000 characters. Tools, system/developer messages, hidden reasoning and incomplete turns are excluded. Native canonical display `text` is used, not private sidecars.

The fixed proofreader contract preserves meaning, language, negation, numbers, names and paths, and prohibits translation, answering or execution. Spoken text and reference fields are data, not permission to follow embedded commands. The history RPC reads the display transcript before filtering, so long conversations may take longer. A new conversation may have no title/history.

## Local transcription policy

Only the owner's explicitly configured local provider is used; a saved STT OFF is respected. The backend freezes a restricted copy of effective local settings before dispatch. Language follows Hermes' local/global configuration, including host defaults; clear both language hints for automatic detection. Legacy environment-only language overrides are not read. Device/compute settings are honored; unsupported runtime/device failures do not trigger another provider. This release uses public faster-whisper APIs, not Hermes' private decoder or error-string retry helpers. Its confidence filter drops a segment only when `no_speech_prob` is strictly above the configured threshold (default 0.6) AND `avg_logprob` is strictly below its threshold (default -1.0). VAD defaults ON with a 500 ms minimum silence; decoding uses beam size 5 without previous-text conditioning.

Decoding happens in an owner-bound worker; its lazy segment generator is consumed there. Cached models are partitioned by owner/effective settings. One decode per owner, bounded result retention and scheduled two-minute expiry limit background state. Cancellation discards a result but cannot necessarily interrupt a decoder already running.

The recorder stops at three minutes. Client/plugin uploads are limited to 12 MiB; decoded duration is not independently measured on the server. Native forwarding buffers a request before plugin validation, so this is not a pre-buffer Gateway ingress guarantee. There is no automatic sentence endpointing or continuous hands-free mode.

## Correction, cost and privacy

Correction uses the SDK's owner/session-routed **`llm.oneshot`** with bounded supplied instructions/input. The plugin supplies no tool schemas, constructs no agent and dispatches no tools or skills. An explicit auxiliary model can override the conversation's model while the session still supplies the selected context and ownership.

With a remote model, the transcript and selected context leave the device for that provider. Hermes may apply native recovery, credential rotation or fallback; one plugin invocation is not necessarily one network attempt, a frozen payer or a hard cost ceiling. The plugin does not automatically repeat uploads or correction calls. Polling retrieves the existing transcription job only.

Native 0.23's text-only one-shot envelope does not expose final-provider, tool-call/finish-reason provenance and may fall back to reasoning text when visible content is empty. The plugin cannot independently certify those missing metadata. Review every correction; failures/timeouts preserve the original instead of silently labeling it corrected. A client timeout invalidates late insertion, not necessarily server execution or billing.

Preferences alone are saved in plugin storage. Transcript, correction and restore snapshots stay in volatile app memory; job-query data is removed after use. Temporary audio uses the owner's scratch directory and is removed in cleanup on normal/error paths. A crash or OS cleanup failure can leave a temporary file. Server job text is scheduled to expire two minutes after completion. Hermes/provider logging and retention policies are separate.

**Use original text** and **Restore the previous draft** are owner/draft-fenced, not global undo. A late permission callback can release only its own media stream, never a newer attempt's stream. Remote connections, automatic future-profile activation and hidden account/provider substitution are unsupported.

## Upgrades and development

Backend registration, Python API adoption and app-level JavaScript loading have distinct lifecycles. Already-mounted in-process routes may require an **idle restart of their actual owner**; registry reload/file replacement alone is not proof. The manifest uses a versioned host API entry. Never restart a busy shared Gateway or hot-swap a recording/permission wait. Preserve explicit enable/disable choices and local edits. The plugin has no self-updater.

Development uses Node 26 and an isolated Python test environment:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build
uv run --isolated --with pytest --with fastapi --with httpx --with python-multipart python -m pytest -q --basetemp=<owned-scratch-directory> tests
```

Set `HERMES_NATIVE_SOURCE=/path/to/the-compatible-hermes-checkout` for real composer, Popover/Button, query-client and native-settings contract fixtures; otherwise native-only tests are explicitly skipped. Primitive fixtures are not installed-renderer/device certification. CI separates portable OS tests and compatible-host validation with dependency admission, without credentials, paid inference or real microphones.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [catalog evidence](docs/CATALOG_READINESS.md). Licensed under [MIT](LICENSE). This is a community project, not a Nous-maintained or automatically approved catalog entry.
