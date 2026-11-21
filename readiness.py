"""Read-only, bounded observations for the original plugin registration context."""
import importlib.util
import re
import secrets
from pathlib import Path

_VERSION = 'smart-dictation.readiness.v1'
_TASK = 'smart_dictation_correction'
_ID = re.compile(r'[a-f0-9]{32}', re.ASCII)
_PROFILE = re.compile(r'[a-z0-9][a-z0-9_-]{0,63}', re.ASCII)
_MISSING = object()


def _matches(pattern, value):
    return type(value) is str and pattern.fullmatch(value) is not None


def _error(code, request_id=None):
    return {'schema_version': _VERSION, 'request_id': request_id, 'ok': False, 'error': code}


class _ScanError(Exception):
    pass


class _Budget:
    def __init__(self):
        self.count = 0

    def walk(self, value, depth=0, ancestors=None):
        self.count += 1
        if self.count > 2048 or depth > 8:
            raise _ScanError()
        if type(value) not in (dict, list):
            return
        ancestors = set() if ancestors is None else ancestors
        identity = id(value)
        if identity in ancestors:
            raise _ScanError()
        ancestors.add(identity)
        try:
            if type(value) is dict:
                for key in value:
                    if type(key) is not str:
                        raise _ScanError()
                    # Never obtain credential, endpoint or header values, even in an
                    # unsupported advanced body. Key presence is sufficient here.
                    if key.lower() in ('api_key', 'key_env', 'api_key_env', 'token', 'secret',
                                       'authorization', 'credential', 'password', 'headers', 'base_url'):
                        self.count += 1
                        if self.count > 2048:
                            raise _ScanError()
                    else:
                        self.walk(value[key], depth + 1, ancestors)
            else:
                for item in value:
                    self.walk(item, depth + 1, ancestors)
        finally:
            ancestors.remove(identity)


def _body(value, budget):
    if value is _MISSING:
        return 'empty'
    if type(value) is not dict:
        return 'invalid'
    try:
        budget.walk(value)
    except _ScanError:
        return 'unverified'
    if not value:
        return 'empty'
    if set(value) == {'reasoning'}:
        reasoning = value['reasoning']
        if (type(reasoning) is dict and set(reasoning) == {'effort'}
                and type(reasoning['effort']) is str
                and reasoning['effort'] in ('none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max')):
            return 'reasoning_only'
    return 'unsupported_present'


def _destinations(root, budget):
    modern = root.get('providers', {})
    legacy = root.get('custom_providers', [])
    if type(modern) is not dict or type(legacy) is not list:
        return 'invalid'
    if len(modern) + len(legacy) > 64:
        return 'unverified'
    states = []
    for name in modern:
        if type(name) is not str:
            return 'unverified'
        declaration = modern[name]
        if type(declaration) is not dict:
            return 'invalid'
        states.append(_body(declaration.get('extra_body', _MISSING), budget))
    for declaration in legacy:
        if type(declaration) is not dict:
            return 'invalid'
        states.append(_body(declaration.get('extra_body', _MISSING), budget))
    for state in ('unverified', 'invalid', 'unsupported_present', 'reasoning_only'):
        if state in states:
            return state
    return 'empty'


def _recovery(root, task, budget):
    declared = False
    for obj, key, allowed in ((task, 'fallback_chain', (list,)),
                              (root, 'fallback_providers', (list,)),
                              (root, 'fallback_model', (str, dict))):
        value = obj.get(key, _MISSING)
        if value is _MISSING:
            continue
        if type(value) not in allowed:
            return 'invalid'
        # Recovery is presence/shape only; never traverse possible credential-bearing records.
        budget.count += 1
        if budget.count > 2048 or (type(value) in (list, dict) and len(value) > 2048):
            return 'unverified'
        if value:
            declared = True
    return 'declared' if declared else 'not_declared'


def _libraries():
    try:
        present = [importlib.util.find_spec(name) is not None for name in ('faster_whisper', 'av', 'numpy')]
        return 'present' if all(present) else 'missing'
    except Exception:
        return 'unverified'


def _stt(root):
    result = {'enabled': 'unverified', 'selected_provider': 'unverified', 'configuration': 'unverified',
              'validation_scope': 'structural-only', 'library_presence': _libraries(), 'cache_files': 'not_checked',
              'model_load_tested': False, 'transcription_tested': False}
    if root is None:
        return result
    stt = root.get('stt', _MISSING)
    if type(stt) is not dict:
        result['configuration'] = 'invalid'
        return result
    enabled = stt.get('enabled', True)
    provider = stt.get('provider', _MISSING)
    local = stt.get('local', {})
    if type(enabled) is bool:
        result['enabled'] = 'on' if enabled else 'off'
    if type(provider) is str:
        result['selected_provider'] = provider if provider in ('local', 'smart_dictation') else 'other'
    if type(enabled) is not bool or type(provider) is not str or type(local) is not dict:
        result['configuration'] = 'invalid'
    elif not enabled or provider not in ('local', 'smart_dictation'):
        result['configuration'] = 'inactive'
    else:
        result['configuration'] = 'configured'
    return result


def _native(ctx, policy):
    try:
        value = ctx.get_config('native', {})
    except Exception:
        return 'unverified', 'unverified', 'unverified'
    if type(value) is not dict:
        return 'invalid', 'invalid', 'invalid'
    requested = value.get('correction_enabled', True)
    requested = ('on' if requested else 'off') if type(requested) is bool else 'invalid'
    consent = value.get('consent_version', _MISSING)
    consent = 'missing' if consent is _MISSING else ('valid' if type(consent) is str and consent == 'native-v1' else 'invalid')
    try:
        policy(value)
        validity = 'valid'
    except Exception:
        validity = 'invalid'
    return requested, consent, validity


def _task_data(root):
    result = {'configured_task_provider': 'unverified', 'configured_task_model': 'unverified',
              'configured_task_effort': 'unverified', 'task_body': 'unverified',
              'destination_bodies': 'unverified', 'recovery_declarations': 'unverified'}
    if root is None:
        return result
    aux = root.get('auxiliary', {})
    if type(aux) is not dict:
        return result
    task = aux.get(_TASK, {})
    if type(task) is not dict:
        return result
    provider = task.get('provider', 'auto')
    result['configured_task_provider'] = (provider if provider in ('auto', 'main') else 'explicit') if type(provider) is str and provider else 'invalid'
    for source, dest in (('model', 'configured_task_model'), ('reasoning_effort', 'configured_task_effort')):
        value = task.get(source, _MISSING)
        result[dest] = ('absent' if value is _MISSING or (type(value) is str and not value)
                        else ('present' if type(value) is str else 'unverified'))
    budget = _Budget()
    result['task_body'] = _body(task.get('extra_body', _MISSING), budget)
    result['destination_bodies'] = _destinations(root, budget)
    result['recovery_declarations'] = _recovery(root, task, budget)
    return result


def _handle(handle):
    try:
        if (handle.kind != 'auxiliary_task' or handle.key != _TASK or handle.plugin_key != 'smart-dictation'):
            return False, 'unavailable'
        active = handle.active
        if type(active) is not bool:
            return False, 'unavailable'
        return True, 'active' if active else 'inactive'
    except Exception:
        return False, 'unavailable'


class ReadinessBridge:
    def __init__(self, ctx, home, handle, policy):
        from hermes_constants import profile_name_for_home
        self.ctx, self.home, self.handle, self.policy = ctx, Path(home).resolve(), handle, policy
        self.instance_id = secrets.token_hex(16)
        self.closed = False
        try:
            owner = profile_name_for_home(self.home)
            self.owner = owner if _matches(_PROFILE, owner) and ctx.plugin_id == 'smart-dictation' else None
        except Exception:
            self.owner = None

    def close(self):
        self.closed = True

    def _current(self):
        from hermes_constants import get_hermes_home, profile_name_for_home
        try:
            current = Path(get_hermes_home()).resolve()
            return (not self.closed and self.ctx.plugin_id == 'smart-dictation' and current == self.home
                    and profile_name_for_home(current) == self.owner and self.owner is not None)
        except Exception:
            return False

    def __call__(self, params, *, session_id=None, **kwargs):
        request_id = None
        try:
            if type(params) is dict and _matches(_ID, params.get('request_id')):
                request_id = params['request_id']
            if (type(params) is not dict or set(params) != {'schema_version', 'request_id', 'profile', 'owner_profile'}
                    or params.get('schema_version') != _VERSION or request_id is None
                    or not _matches(_PROFILE, params.get('profile')) or not _matches(_PROFILE, params.get('owner_profile'))
                    or session_id is not None or kwargs):
                return _error('invalid_request', request_id)
            if self.owner is None or params['profile'] != self.owner or params['owner_profile'] != self.owner:
                return _error('invalid_owner', request_id)
            if not self._current():
                return _error('owner_changed', request_id)
            try:
                from hermes_cli.config import load_config_readonly, FailedConfigRead
                try:
                    root = load_config_readonly()
                    if isinstance(root, FailedConfigRead):
                        root, state = None, 'failed'
                    elif type(root) is not dict:
                        root, state = None, 'failed'
                    else:
                        state = 'observed'
                except Exception:
                    root, state = None, 'failed'
            except ImportError:
                root, state = None, 'unavailable'
            stt = _stt(root)
            observed, handle_state = _handle(self.handle)
            requested, consent, policy = (_native(self.ctx, self.policy) if state == 'observed'
                                          else ('unverified', 'unverified', 'unverified'))
            task_data = _task_data(root)
            correction = {'existing_execution': 'unchanged', 'native_requested': requested, 'native_consent': consent,
                          'native_policy': policy, 'contextual_policy': 'client-managed-not-observed', **task_data,
                          'resolved_destination': 'unverified', 'recovery_coverage': 'unverified',
                          'configuration_frozen_through_dispatch': False, 'final_request_enforcement': 'unavailable',
                          'original_tool_metadata': 'unavailable', 'strict_bridge': 'not_exposed',
                          'model_call_tested': False, 'payer_verified': False}
            limitations = ['cache_not_checked', 'task_registry_unverified', 'recovery_not_resolved',
                           'final_request_not_enforceable', 'tool_metadata_unavailable']
            for condition, label in ((state != 'observed', 'config_unverified'), (stt['configuration'] == 'inactive', 'stt_inactive'),
                (stt['configuration'] == 'invalid', 'stt_configuration_invalid'), (stt['library_presence'] == 'missing', 'library_missing'),
                (not observed, 'task_registration_unobserved'), (handle_state == 'inactive', 'task_handle_inactive'),
                (policy == 'invalid', 'native_policy_invalid'), (consent == 'missing', 'native_consent_missing'),
                (consent == 'invalid', 'native_consent_invalid'), (task_data['task_body'] != 'empty', 'advanced_task_config'),
                (task_data['destination_bodies'] != 'empty', 'advanced_destination_config')):
                if condition:
                    limitations.append(label)
            result = {'schema_version': _VERSION, 'request_id': request_id, 'ok': True, 'profile': self.owner,
                      'instance_id': self.instance_id, 'backend_version': '0.5.2', 'capabilities': ['readiness-v1'],
                      'config': {'read_state': state, 'source': 'effective-readonly', 'freshness': 'observation-not-atomic'},
                      'local_stt': stt, 'task': {'key': _TASK, 'registration_observed': observed, 'handle_state': handle_state,
                                                'current_registry_state': 'unverified'},
                      'correction': correction, 'limitations': limitations}
            if not self._current():
                return _error('owner_changed', request_id)
            return result
        except Exception:
            return _error('backend_unavailable', request_id)
