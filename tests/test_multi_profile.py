import contextvars
import copy
import importlib.util
import sys
import threading
import time
import types
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('multi_profile_api', ROOT / 'dashboard/plugin_api.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
current = contextvars.ContextVar('test_profile', default='default')


@pytest.fixture
def profiles(monkeypatch, tmp_path):
    homes = {name: tmp_path / name for name in ('default', 'alpha', 'beta')}
    for name, home in homes.items():
        home.mkdir()
        (home / 'SOUL.md').write_text(name, encoding='utf8')
    constants = SimpleNamespace(get_hermes_home=lambda: homes[current.get()],
        profile_name_for_home=lambda home: next(n for n, p in homes.items() if p == home))
    monkeypatch.setitem(sys.modules, 'hermes_constants', constants)
    entered, release = threading.Event(), threading.Event()
    def decode(home, cfg, path):
        if cfg['name'] == 'alpha':
            entered.set()
            release.wait(5)
        assert Path(path).read_bytes() == cfg['name'].encode()
        return cfg['name']
    monkeypatch.setattr(api, '_stt', lambda: {'model': current.get(), 'language': 'ko', 'name': current.get()})
    monkeypatch.setattr(api, '_has_faster_whisper', lambda: True)
    monkeypatch.setattr(api, '_decode_local', decode)
    app = FastAPI()
    @app.middleware('http')
    async def scope(request: Request, call_next):
        token = current.set(request.headers.get('x-test-profile', 'default'))
        try:
            return await call_next(request)
        finally:
            current.reset(token)
    app.include_router(api.router)
    with TestClient(app) as client:
        yield client, homes, entered, release
    release.set()


def header(name):
    return {'x-test-profile': name}


def wait_done(client, name, job):
    for _ in range(400):
        result = client.get('/transcribe/jobs/' + job, headers=header(name)).json()
        if result['state'] != 'running':
            return result
        time.sleep(.01)
    raise AssertionError('job timeout')


def test_profile_identity_cfg_owner_jobs_and_busy(profiles):
    client, homes, entered, release = profiles
    for name in homes:
        status = client.get('/status?owner_profile=' + name, headers=header(name)).json()
        assert status['profile'] == status['stt']['model'] == name
        assert client.get('/soul', headers=header(name)).json()['soul'] == name
        assert client.get('/status?owner_profile=alpha&owner_profile=alpha', headers=header(name)).status_code == 403
    assert client.get('/status?owner_profile=beta', headers=header('alpha')).status_code == 403
    start = time.monotonic()
    response = client.post('/transcribe?owner_profile=alpha', headers=header('alpha'), files={'file': ('x', b'alpha', 'audio/wav')})
    assert response.status_code == 202 and time.monotonic() - start < 2
    assert entered.wait(2)
    job = response.json()['job_id']
    assert client.get('/status', headers=header('alpha')).json()['transcription_busy']
    assert client.post('/transcribe', headers=header('alpha'), files={'file': ('x', b'alpha', 'audio/wav')}).status_code == 429
    assert client.get('/transcribe/jobs/' + job, headers=header('beta')).status_code == 404
    beta = client.post('/transcribe', headers=header('beta'), files={'file': ('x', b'beta', 'audio/wav')})
    assert beta.status_code == 202
    assert wait_done(client, 'beta', beta.json()['job_id'])['raw_transcript'] == 'beta'
    release.set()
    assert wait_done(client, 'alpha', job)['raw_transcript'] == 'alpha'
    assert not list((homes['alpha'] / 'cache/scratch/smart-dictation').iterdir())
    assert not (homes['default'] / 'cache').exists()


def test_job_timer_expiry_and_bounded_retention(profiles, monkeypatch):
    client, homes, _, release = profiles
    monkeypatch.setattr(api, 'JOB_TTL', .15)
    ids = []
    for _ in range(3):
        r = client.post('/transcribe', headers=header('beta'), files={'file': ('x', b'beta', 'audio/wav')})
        ids.append(r.json()['job_id'])
        wait_done(client, 'beta', ids[-1])
    assert client.get('/transcribe/jobs/' + ids[0], headers=header('beta')).status_code == 404
    time.sleep(.3)
    assert all(job not in api._JOBS for job in ids)
    assert client.get('/transcribe/jobs/' + ids[-1], headers=header('beta')).status_code == 404


def test_removed_model_route_is_not_available(profiles):
    client, homes, _, _ = profiles
    for name in homes:
        assert client.get('/correction-model', headers=header(name)).status_code == 404
        assert client.post('/correction-model', headers=header(name), json={}).status_code == 404


def test_owned_delete_cleans_result_and_timer_without_unlocking_running_decode(profiles):
    client, homes, entered, release = profiles
    response = client.post('/transcribe', headers=header('alpha'), files={'file': ('x', b'alpha', 'audio/wav')})
    job = response.json()['job_id']
    assert entered.wait(2)
    assert client.delete('/transcribe/jobs/' + job, headers=header('beta')).status_code == 404
    assert client.delete('/transcribe/jobs/' + job, headers=header('alpha')).status_code == 200
    assert client.get('/status', headers=header('alpha')).json()['transcription_busy']
    release.set()
    for _ in range(200):
        if not client.get('/status', headers=header('alpha')).json()['transcription_busy']:
            break
        time.sleep(.01)
    assert client.get('/transcribe/jobs/' + job, headers=header('alpha')).status_code == 404
    assert job not in api._TIMERS
    completed = client.post('/transcribe', headers=header('beta'), files={'file': ('x', b'beta', 'audio/wav')}).json()['job_id']
    wait_done(client, 'beta', completed)
    assert completed in api._TIMERS
    assert client.delete('/transcribe/jobs/' + completed, headers=header('beta')).status_code == 200
    assert completed not in api._TIMERS


def test_completed_result_and_timer_counts_are_bounded(profiles):
    client, homes, _, _ = profiles
    jobs = []
    for _ in range(5):
        response = client.post('/transcribe', headers=header('beta'), files={'file': ('x', b'beta', 'audio/wav')})
        job = response.json()['job_id'];jobs.append(job)
        wait_done(client, 'beta', job)
    retained = [job for job in jobs if job in api._JOBS]
    timers = [job for job in jobs if job in api._TIMERS]
    assert len(retained) <= api.MAX_RETAINED and timers == retained
    for job in retained:
        client.delete('/transcribe/jobs/' + job, headers=header('beta'))
