# Contributing

Use synthetic transcripts, audio and profile homes. Never commit credentials, personal context, operator config, full-app screenshots, audio caches or local managed environments.

Run `npm ci`, `npm test`, `npm run build`, and the Python test command in the README. Set `HERMES_NATIVE_SOURCE` to the documented compatible Hermes checkout for native integration fixtures; a skipped native fixture is not a passing native-runtime test. Built output in `desktop/plugin.js` must match the reviewed source.

Keep the connection/profile/session/generation and unchanged-draft guards. Context OFF must prevent context fetching and transmission. Do not introduce agent loops, tool schemas, skill discovery, automatic message submission, cloud-STT fallback, credential-store reads, silent model/account changes, or code self-updaters.

Use documented public plugin interfaces, not private imports, runtime rebinding, indirect import tricks or renderer internals. If an SDK capability is missing, describe the required public seam upstream rather than patching around it.

Model or effort changes must remain isolated from main chat settings and preserve host-managed billing/permission consent. Test old saved OFF preferences, absent preferences, owner switches across awaits, late results and cleanup.

Before a catalog update, validate the exact release with dependency installation in an isolated environment, run compatible-host checks and independent review, publish the immutable source commit, and submit a narrow catalog SHA-bump PR. Do not claim catalog listing until a maintainer merges it.
