import importlib.util
from pathlib import Path
import threading
import time
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('smart_dictation_api', ROOT / 'dashboard' / 'plugin_api.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


@pytest.fixture
def fixture(monkeypatch, tmp_path):
    seen = []
    def transcribe(path, cfg):
        p = Path(path)
        seen.append((p, p.read_bytes(), cfg))
        return '안녕하세요'
    stt = SimpleNamespace(available=True, decode=transcribe)
    monkeypatch.setattr(api, '_home', lambda: tmp_path)
    monkeypatch.setattr(api, '_profile', lambda: 'default')
    monkeypatch.setattr(api, '_stt', lambda: {'model': 'base', 'language': 'ko', 'provider': 'local'})
    monkeypatch.setattr(api, '_has_faster_whisper', lambda: stt.available)
    monkeypatch.setattr(api, '_decode_local', lambda home, c, p: stt.decode(p, c))
    app = FastAPI()
    app.include_router(api.router)
    with TestClient(app) as client:
        yield client, stt, seen, tmp_path


def poll(client, response):
    assert response.status_code == 202
    job_id = response.json()['job_id']
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        result = client.get('/transcribe/jobs/' + job_id).json()
        if result['state'] != 'running':
            return result
        time.sleep(.01)
    raise AssertionError('job did not finish')


def test_success_status_and_cleanup(fixture):
    client, _, seen, home = fixture
    assert client.get('/status').json() == {'ok': True, 'version': api.VERSION, 'transcription_busy': False, 'capabilities': ['async-transcription-v1'], 'profile': 'default', 'stt': {'provider': 'local', 'model': 'base', 'language': 'ko', 'available': True, 'cache_verified': False}, 'max_audio_bytes': api.MAX_AUDIO_BYTES}
    r = client.post('/transcribe', files={'file': ('../../secret.exe', b'voice', 'audio/webm')})
    assert poll(client, r)['raw_transcript'] == '안녕하세요'
    path, data, cfg = seen[0]
    assert data == b'voice' and cfg == {'model': 'base', 'language': 'ko', 'provider': 'local'}
    assert path.suffix == '.webm' and path.parent == home / 'cache' / 'scratch' / 'smart-dictation'
    assert not path.exists()


@pytest.mark.parametrize('url', ['/transcribe?owner_profile=other', '/transcribe?owner_profile=default&owner_profile=other', '/transcribe?foo=bar'])
def test_owner_fail_closed(fixture, url):
    client, _, seen, _ = fixture
    assert client.post(url, files={'file': ('a', b'v', 'audio/webm')}).status_code == 403
    assert not seen


def test_invalid_uploads_and_limit(fixture, monkeypatch):
    client, _, seen, _ = fixture
    monkeypatch.setattr(api, 'MAX_AUDIO_BYTES', 3)
    assert client.post('/transcribe', files={'file': ('a', b'abcd', 'audio/webm')}).status_code == 413
    assert client.post('/transcribe', files={'file': ('a', b'', 'audio/webm')}).status_code == 400
    assert client.post('/transcribe', files={'file': ('a', b'a', 'text/plain')}).status_code == 415
    assert client.post('/transcribe', files={'other': ('a', b'a', 'audio/webm')}).status_code == 400
    assert client.post('/transcribe', files={'file': ('a', b'a', 'audio/webm')}, data={'owner_profile': 'other'}).status_code == 400
    assert client.post('/transcribe', content=b'x', headers={'content-type': 'application/octet-stream'}).status_code == 415
    assert not seen


def test_failure_redacted_and_cleanup(fixture):
    client, stt, _, home = fixture
    def fail(path, cfg):
        raise ValueError('SECRET transcript')
    stt.decode = fail
    r = client.post('/transcribe', files={'file': ('a', b'a', 'audio/wav')})
    result = poll(client, r)
    assert result['state'] == 'error' and result['error'] == 'transcription_failed'
    assert list((home / 'cache' / 'scratch' / 'smart-dictation').iterdir()) == []


def test_status_is_metadata_only(fixture, monkeypatch):
    client, _, _, _ = fixture
    def forbidden(*args, **kwargs):
        raise AssertionError('status must not load a model')
    monkeypatch.setattr(api, '_load_model', forbidden)
    result = client.get('/status').json()['stt']
    assert result['available'] is True and result['cache_verified'] is False


def test_no_lazy_install(fixture):
    client, stt, seen, _ = fixture
    stt.available = False
    assert client.post('/transcribe', files={'file': ('a', b'a', 'audio/wav')}).status_code == 503
    assert not seen


def test_busy(fixture):
    client, stt, _, _ = fixture
    entered, release = threading.Event(), threading.Event()
    def wait(path, cfg):
        entered.set(); release.wait(5)
        return 'ok'
    stt.decode = wait
    responses = []
    worker = threading.Thread(target=lambda: responses.append(client.post('/transcribe', files={'file': ('a', b'a', 'audio/wav')})))
    worker.start()
    try:
        assert entered.wait(5)
        assert client.post('/transcribe', files={'file': ('a', b'a', 'audio/wav')}).status_code == 429
    finally:
        release.set(); worker.join(5)
    assert responses[0].status_code == 202
    assert poll(client, responses[0])['state'] == 'done'


def test_actual_home_guard(monkeypatch, tmp_path):
    import sys
    default = tmp_path / 'default'
    constants = SimpleNamespace(get_hermes_home=lambda: default / 'profiles' / 'secondary',
        profile_name_for_home=lambda home: 'secondary' if home.name == 'secondary' else 'default')
    monkeypatch.setitem(sys.modules, 'hermes_constants', constants)
    assert api._home() == (default / 'profiles' / 'secondary').resolve()
    assert api._profile() == 'secondary'
    constants.get_hermes_home = lambda: default
    assert api._profile() == 'default'


def test_unapproved_stt_provider_never_resolved(monkeypatch):
    import sys
    config = SimpleNamespace(load_config_readonly=lambda: {'stt': {'provider': 'third-party'}})
    monkeypatch.setitem(sys.modules, 'hermes_cli.config', config)
    assert api._stt() is None
