"""Readiness contract tests: all host APIs and profiles are synthetic."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

import jsonschema

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / 'contracts' / 'readiness-v1.json'
# An inert identity only; the test never creates this directory. A runner may
# explicitly bind it to its isolated home without embedding an operator's path.
HOME = (Path(os.environ['SMART_DICTATION_TEST_HOME']) if 'SMART_DICTATION_TEST_HOME' in os.environ
        else Path(os.environ.get('TMPDIR') or tempfile.gettempdir()) / 'smart-dictation-readiness-contract-home').resolve()


def load(name):
    spec = importlib.util.spec_from_file_location('test_sd_' + name, ROOT / (name + '.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class Failed(dict):
    pass


class Context:
    plugin_id = 'smart-dictation'
    def __init__(self):
        self.native = {}
    def get_config(self, key, default):
        assert key == 'native' and default == {}
        return self.native
    @property
    def llm(self):
        raise AssertionError('no model access')


class ReadinessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract = json.loads(CONTRACT.read_text(encoding='utf-8'))
        cls.validator = jsonschema.Draft202012Validator(cls.contract)
        cls.readiness = load('readiness')
        cls.policy = staticmethod(load('correction').policy)

    def setUp(self):
        self.home = HOME
        self.owner = 'default'
        self.root = {'stt': {'provider': 'local'}, 'auxiliary': {}}
        self.ctx = Context()
        self.config = types.ModuleType('hermes_cli.config')
        self.config.FailedConfigRead = Failed
        self.config.load_config_readonly = lambda: self.root
        constants = types.ModuleType('hermes_constants')
        constants.get_hermes_home = lambda: self.home
        constants.profile_name_for_home = lambda home: self.owner
        self.modules = patch.dict(sys.modules, {'hermes_constants': constants, 'hermes_cli.config': self.config})
        self.modules.start()
        self.addCleanup(self.modules.stop)
        self.handle = types.SimpleNamespace(kind='auxiliary_task', key='smart_dictation_correction', plugin_key='smart-dictation', active=True)
        self.bridge = self.readiness.ReadinessBridge(self.ctx, self.home, self.handle, self.policy)
        self.req = {'schema_version': 'smart-dictation.readiness.v1', 'request_id': 'a'*32, 'profile': 'default', 'owner_profile': 'default'}

    def check(self, value, definition):
        schema = {'$ref': '#/$defs/' + definition, '$defs': self.contract['$defs']}
        jsonschema.Draft202012Validator(schema).validate(value)
        return value

    def call(self, request=None, **kwargs):
        value = self.bridge(self.req if request is None else request, **kwargs)
        return self.check(value, 'ReadinessResult' if value['ok'] else 'ReadinessError')

    def test_basics_and_default_native_policy(self):
        out = self.call()
        self.assertEqual(out['local_stt']['configuration'], 'configured')
        self.assertEqual((out['correction']['native_requested'], out['correction']['native_consent'], out['correction']['native_policy']), ('on', 'missing', 'valid'))
        self.assertEqual(out['task']['handle_state'], 'active')
        self.assertEqual(out['correction']['configured_task_provider'], 'auto')
        self.assertTrue(set(self.contract['invariants']['mandatory_limitations']) <= set(out['limitations']))
        self.assertFalse(out['correction']['model_call_tested'])
        self.assertLess(len(json.dumps(out)), 4096)

    def test_request_closed_and_unicode(self):
        for change in ({'session_id':'x'}, {'unexpected': 1}, {'schema_version':'old'}, {'request_id':'a'*32+'\n'},
                       {'profile':'default\n'}, {'profile':'İ'}, {'owner_profile':1}, {'request_id':1}):
            with self.subTest(change=change):
                req = dict(self.req, **change)
                self.assertEqual(self.call(req)['error'], 'invalid_request')
        self.assertEqual(self.call(session_id='x')['error'], 'invalid_request')
        self.assertEqual(self.call(dict(self.req, profile='other'))['error'], 'invalid_owner')
        self.assertIsNone(self.call(dict(self.req, request_id='a'*32+'\n'))['request_id'])

    def test_owner_and_generation(self):
        self.owner = 'named'; self.home = HOME / 'profiles' / 'named'
        bridge = self.readiness.ReadinessBridge(self.ctx, self.home, self.handle, self.policy)
        self.bridge = bridge; self.req.update(profile='named', owner_profile='named')
        first = self.call()
        self.home = HOME
        self.assertEqual(self.call()['error'], 'owner_changed')
        self.home = HOME / 'profiles' / 'named'
        self.assertTrue(self.call()['ok'])
        bridge.close()
        self.assertEqual(self.call()['error'], 'owner_changed')
        self.bridge = self.readiness.ReadinessBridge(self.ctx, self.home, self.handle, self.policy)
        self.assertNotEqual(first['instance_id'], self.call()['instance_id'])
        self.ctx.get_config = lambda *a: (setattr(self, 'home', HOME) or {})
        self.assertEqual(self.call()['error'], 'owner_changed')

    def test_handle_states(self):
        for handle, expected, observed in ((self.handle, 'active', True),
            (types.SimpleNamespace(kind='auxiliary_task', key='smart_dictation_correction', plugin_key='smart-dictation', active=False), 'inactive', True),
            (None, 'unavailable', False), (types.SimpleNamespace(active=True), 'unavailable', False),
            (types.SimpleNamespace(kind='wrong', key='smart_dictation_correction', plugin_key='smart-dictation', active=True), 'unavailable', False)):
            self.bridge.handle = handle
            task = self.call()['task']
            self.assertEqual((task['handle_state'], task['registration_observed']), (expected, observed))

    def test_native_policy(self):
        cases = [({}, ('on','missing','valid')), ({'correction_enabled':False}, ('off','missing','valid')),
                 ({'correction_enabled':True}, ('on','missing','invalid')),
                 ({'correction_enabled':True,'consent_version':'native-v1'}, ('on','valid','valid')),
                 ({'correction_enabled':'no'}, ('invalid','missing','invalid'))]
        for native, expected in cases:
            self.ctx.native = native
            c = self.call()['correction']
            self.assertEqual((c['native_requested'],c['native_consent'],c['native_policy']), expected)

    def test_failed_config_and_stt(self):
        for value, expected in ((Failed(), 'failed'), (None,'failed')):
            self.root = value
            out = self.call()
            self.assertEqual(out['config']['read_state'], expected)
            self.assertEqual(out['local_stt']['configuration'], 'unverified')
        for stt, expected in (({'provider':'local'},'configured'), ({'provider':'other'},'inactive'),
                              ({'provider':'local','enabled':False},'inactive'), ({'provider':'local','local':None},'invalid'),
                              ({'provider':None},'invalid'), ({'provider':'local','enabled':0},'invalid')):
            self.root = {'stt':stt}
            self.assertEqual(self.call()['local_stt']['configuration'], expected)

    def test_body_recovery_limits_and_unchanged(self):
        task = {'extra_body': {'reasoning': {'effort':'high'}}, 'fallback_chain': ['x']}
        self.root['auxiliary']['smart_dictation_correction'] = task
        self.root['providers'] = {'one': {'extra_body': {'tools': [1]}, 'api_key': object()}}
        self.root['custom_providers'] = [{'extra_body': {}}]
        before = copy.deepcopy(self.root)
        # Identity sentinel itself is not traversed or modified.
        sentinel = self.root['providers']['one']['api_key']
        c = self.call()['correction']
        self.assertEqual((c['task_body'], c['destination_bodies'], c['recovery_declarations']), ('reasoning_only','unsupported_present','declared'))
        self.assertIs(self.root['providers']['one']['api_key'], sentinel)
        self.assertEqual(task, before['auxiliary']['smart_dictation_correction'])
        self.root['providers'] = {str(i): {} for i in range(65)}
        self.assertEqual(self.call()['correction']['destination_bodies'], 'unverified')
        self.root['providers'] = {1:{}}
        self.assertEqual(self.call()['correction']['destination_bodies'], 'unverified')
        cycle = {}; cycle['x'] = cycle
        task['extra_body'] = cycle
        self.assertEqual(self.call()['correction']['task_body'], 'unverified')
        task['extra_body'] = {'x': list(range(2050))}
        self.assertEqual(self.call()['correction']['task_body'], 'unverified')
        task['extra_body'] = {'x': {'x': {'x': {'x': {'x': {'x': {'x': {'x': {'x': 1}}}}}}}}}
        self.assertEqual(self.call()['correction']['task_body'], 'unverified')

    def test_config_failures_and_presence_do_not_call_models(self):
        def failed(): raise OSError('private-data-must-not-escape')
        self.config.load_config_readonly = failed
        with patch.object(self.readiness.importlib.util, 'find_spec', return_value=None) as lookup:
            result = self.call()
        self.assertEqual(result['config']['read_state'], 'failed')
        self.assertEqual(result['correction']['native_policy'], 'unverified')
        self.assertEqual(result['local_stt']['library_presence'], 'missing')
        self.assertEqual([c.args[0] for c in lookup.call_args_list], ['faster_whisper', 'av', 'numpy'])
        self.assertNotIn('private-data', json.dumps(result))
        with patch.object(self.readiness.importlib.util, 'find_spec', side_effect=RuntimeError('private')):
            self.assertEqual(self.call()['local_stt']['library_presence'], 'unverified')

    def test_malformed_declarations_never_become_empty(self):
        root = self.root
        root['providers'] = {'x': {'extra_body': None}}
        self.assertEqual(self.call()['correction']['destination_bodies'], 'invalid')
        root['providers'] = {}; root['custom_providers'] = [{'extra_body': {'reasoning': {'effort': 'high'}}}]
        self.assertEqual(self.call()['correction']['destination_bodies'], 'reasoning_only')
        root['custom_providers'] = [{} for _ in range(65)]
        self.assertEqual(self.call()['correction']['destination_bodies'], 'unverified')
        root['custom_providers'] = []
        root['fallback_providers'] = 'bad'
        self.assertEqual(self.call()['correction']['recovery_declarations'], 'invalid')
        root['fallback_providers'] = []
        root['fallback_model'] = 'some-declaration'
        self.assertEqual(self.call()['correction']['recovery_declarations'], 'declared')
        task = root['auxiliary']['smart_dictation_correction'] = {'extra_body': {1: 'x'}}
        self.assertEqual(self.call()['correction']['task_body'], 'unverified')
        self.assertEqual(task['extra_body'], {1:'x'})

    def test_request_and_result_are_exact_contract(self):
        self.check(self.req, 'ReadinessRequest')
        result = self.call()
        invalid = dict(result, ready=True)
        with self.assertRaises(jsonschema.ValidationError): self.check(invalid, 'ReadinessResult')
        with self.assertRaises(jsonschema.ValidationError): self.check(dict(self.req, session_id='x'), 'ReadinessRequest')
        with self.assertRaises(jsonschema.ValidationError): self.check(dict(self.req, request_id='a'*32+'\n'), 'ReadinessRequest')

    def test_registration_original_context_and_legacy(self):
        entry = load('__init__')
        class Provider:
            name = 'smart_dictation'
            def __init__(self, ctx, home, local, correction):
                self.ctx, self.home, self.closed = ctx, home, False
            def close(self):
                self.closed = True
        loader = types.SimpleNamespace(load=lambda name: {'local_stt': object(), 'correction': types.SimpleNamespace(policy=self.policy),
              'native_provider': types.SimpleNamespace(SmartDictationProvider=Provider), 'readiness': self.readiness}[name])
        entry._loader = lambda: loader
        class Legacy:
            def __init__(self): self.callbacks = []
            def register_auxiliary_task(self, key, **kw):
                self.task = (key, kw); return None
            def register_transcription_provider(self, provider): self.provider = provider
            def on_unload(self, callback): self.callbacks.append(callback)
        legacy = Legacy(); entry.register(legacy)
        self.assertEqual(legacy.task[1]['defaults'], {'provider':'auto','timeout':20})
        self.assertIs(legacy.provider.ctx, legacy)
        legacy.callbacks[0](); self.assertTrue(legacy.provider.closed)
        class Modern(Legacy):
            plugin_id = 'smart-dictation'
            def register_auxiliary_task(inner, key, **kw):
                super(Modern, inner).register_auxiliary_task(key, **kw)
                return self.handle
            def register_rpc(inner, name, handler): inner.rpc = (name, handler)
            def get_config(inner, key, default): return {}
        modern = Modern()
        with patch.object(self.readiness.importlib.util, 'find_spec', side_effect=AssertionError('registration lookup')):
            with patch.object(self.config, 'load_config_readonly', side_effect=AssertionError('registration config read')):
                entry.register(modern)
        self.assertEqual(modern.rpc[0], 'readiness')
        self.assertIs(modern.rpc[1].ctx, modern)
        self.assertTrue(modern.rpc[1](self.req)['ok'])
        for cb in modern.callbacks: cb()
        self.assertEqual(modern.rpc[1](self.req)['error'], 'owner_changed')
        class FailedRegistrar(Modern):
            def register_rpc(inner, name, handler): raise RuntimeError('registration failed')
        failed = FailedRegistrar()
        with self.assertRaises(RuntimeError): entry.register(failed)
        self.assertEqual(len(failed.callbacks), 2)

    def test_import_is_inert(self):
        with patch('importlib.util.find_spec', side_effect=AssertionError('lookup on import')):
            load('readiness')


if __name__ == '__main__':
    unittest.main()
