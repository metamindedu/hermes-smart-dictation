# Security policy

Please use this repository's **Security → Report a vulnerability** form for sensitive reports. Do not post credentials, private dictation, SOUL files, conversation histories, or account payloads in public issues.

Include the plugin version/commit, Hermes version, operating system, a synthetic reproduction, and the expected ownership or permission boundary. Screenshots must be cropped and scrubbed of personal data. Do not attach real microphone recordings when a synthetic sample reproduces the issue.

Smart Dictation is a community plugin, not a Nous-maintained product. No response-time SLA is promised. Compatibility and security fixes are shipped as reviewed source changes; the plugin never downloads or replaces its own code. Catalog updates use a new exact-SHA submission.

## Boundaries

- Correction is a bounded text transformation, not an agent/tool dispatcher.
- Optional context must be selected explicitly and treated as reference data.
- Work belongs to the captured connection/profile/session and unchanged draft.
- Credentials and provider recovery remain host-managed; this plugin must not read credential stores or invent consent.
- Cancellation does not guarantee interruption of native decoding or a provider request already in progress.
- A local installation or passing test is not a public multi-user security certification. See the README and current compatibility disclosures.
