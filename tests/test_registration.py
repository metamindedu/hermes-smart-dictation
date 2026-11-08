import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_registration_is_one_aux_task():
    spec = importlib.util.spec_from_file_location('smart_dictation', ROOT / '__init__.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    calls = []
    class Context:
        def register_auxiliary_task(self, *args, **kwargs):
            calls.append((args, kwargs))
    module.register(Context())
    assert len(calls) == 1
    args, options = calls[0]
    assert args == ('smart_dictation_correction',)
    assert options['defaults'] == {'provider': 'auto', 'timeout': 20}
    assert json.loads((ROOT / 'dashboard' / 'manifest.json').read_text())['api'] == 'api_v0_4.py'
    assert 'name: smart-dictation' in (ROOT / 'plugin.yaml').read_text()


def test_versioned_entry_exposes_the_canonical_routes_without_import_io():
    entry = ROOT / 'dashboard' / json.loads((ROOT / 'dashboard' / 'manifest.json').read_text())['api']
    spec = importlib.util.spec_from_file_location('smart_dictation_versioned_entry_test', entry)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(module.router)
    paths = set(app.openapi()['paths'])
    assert {'/status', '/soul', '/transcribe', '/transcribe/jobs/{job_id}'} <= paths
    assert '/correction-model' not in paths
    assert module._impl.VERSION == '0.4.0'


def test_entry_import_does_not_touch_profile_or_config(monkeypatch):
    import sys
    import types
    def forbidden(*args, **kwargs):
        raise AssertionError('import must not read profile state')
    monkeypatch.setitem(sys.modules, 'hermes_constants', types.SimpleNamespace(get_hermes_home=forbidden, profile_name_for_home=forbidden))
    entry = ROOT / 'dashboard' / 'api_v0_4.py'
    spec = importlib.util.spec_from_file_location('no_profile_io_entry', entry)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.router
