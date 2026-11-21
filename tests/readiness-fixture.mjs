// Synthetic, credential-free protocol fixture. Never a live readiness receipt.
const BASE = {
  "schema_version": "smart-dictation.readiness.v1",
  "request_id": "00000000000000000000000000000000",
  "ok": true,
  "profile": "default",
  "instance_id": "11111111111111111111111111111111",
  "backend_version": "0.5.2",
  "capabilities": [
    "readiness-v1"
  ],
  "config": {
    "read_state": "observed",
    "source": "effective-readonly",
    "freshness": "observation-not-atomic"
  },
  "local_stt": {
    "enabled": "on",
    "selected_provider": "smart_dictation",
    "configuration": "configured",
    "validation_scope": "structural-only",
    "library_presence": "present",
    "cache_files": "not_checked",
    "model_load_tested": false,
    "transcription_tested": false
  },
  "task": {
    "key": "smart_dictation_correction",
    "registration_observed": true,
    "handle_state": "active",
    "current_registry_state": "unverified"
  },
  "correction": {
    "existing_execution": "unchanged",
    "native_requested": "on",
    "native_consent": "valid",
    "native_policy": "valid",
    "contextual_policy": "client-managed-not-observed",
    "configured_task_provider": "auto",
    "configured_task_model": "absent",
    "configured_task_effort": "absent",
    "task_body": "empty",
    "destination_bodies": "empty",
    "recovery_declarations": "not_declared",
    "resolved_destination": "unverified",
    "recovery_coverage": "unverified",
    "configuration_frozen_through_dispatch": false,
    "final_request_enforcement": "unavailable",
    "original_tool_metadata": "unavailable",
    "strict_bridge": "not_exposed",
    "model_call_tested": false,
    "payer_verified": false
  },
  "limitations": [
    "cache_not_checked",
    "task_registry_unverified",
    "recovery_not_resolved",
    "final_request_not_enforceable",
    "tool_metadata_unavailable"
  ]
}
export const readinessFixture = (profile = 'default', requestId = '0'.repeat(32)) => ({ ...structuredClone(BASE), profile, request_id: requestId })
