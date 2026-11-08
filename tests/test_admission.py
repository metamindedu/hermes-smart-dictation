import importlib.util
from pathlib import Path
from types import SimpleNamespace
import sys
import time

from fastapi import FastAPI
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('smart_dictation_admission', ROOT / 'dashboard/plugin_api.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)

def client_for(monkeypatch, home):
    monkeypatch.setattr(api, '_home', lambda: home)
    monkeypatch.setattr(api, '_profile', lambda: 'default')
    app = FastAPI(); app.include_router(api.router)
    return TestClient(app)

def test_soul_is_fixed_bounded_and_owner_guarded(monkeypatch, tmp_path):
    with client_for(monkeypatch, tmp_path) as client:
        assert client.get('/soul').json()['soul'] == ''
        (tmp_path / 'SOUL.md').write_text('s' * 70000, encoding='utf-8')
        result = client.get('/soul?owner_profile=default&profile=default').json()
        assert result['truncated'] and len(result['soul']) == 4000
        assert client.get('/soul?owner_profile=claire').status_code == 403
        assert client.get('/soul?path=../../secret').status_code == 403
        assert client.get('/soul?profile=claire').status_code == 403

def settings():
    return {'model':'base','device':'cpu','compute_type':'int8','language':'ko',
            'initial_prompt':None,'vad':True,'vad_min_silence_ms':500,
            'no_speech_prob_threshold':.6,'logprob_threshold':-1.0}


def test_model_loader_never_enables_downloads(monkeypatch, tmp_path):
    calls = []
    def model(name, **kwargs):
        calls.append(kwargs)
        raise OSError('cache miss')
    monkeypatch.setitem(sys.modules, 'faster_whisper', SimpleNamespace(WhisperModel=model))
    api._MODELS.clear()
    try:
        api._load_model(tmp_path, settings())
    except api.STTUnavailable:
        pass
    assert len(calls) == 1 and calls[0]['local_files_only'] is True


def test_decoder_uses_snapshot_language_and_no_dispatcher(monkeypatch, tmp_path):
    seen = []
    def transcribe(path, **kwargs):
        seen.append(kwargs)
        return [SimpleNamespace(text='synthetic sentence', no_speech_prob=0.0, avg_logprob=0.0)], None
    monkeypatch.setattr(api, '_load_model', lambda *a, **k: SimpleNamespace(transcribe=transcribe))
    assert api._decode_local(tmp_path, settings(), 'fixture.wav') == 'synthetic sentence'
    assert seen[0]['language'] == 'ko'
    assert seen[0]['task'] == 'transcribe' and seen[0]['condition_on_previous_text'] is False


def test_worker_never_reresolves_provider_or_reads_mutated_config(monkeypatch, tmp_path):
    original = settings()
    seen = []
    def get_stt():
        seen.append('resolution')
        return dict(original)
    def decode(home, cfg, path):
        original['language'] = 'en'
        assert cfg['language'] == 'ko' and home == tmp_path
        return 'synthetic local result'
    monkeypatch.setattr(api, '_stt', get_stt)
    monkeypatch.setattr(api, '_has_faster_whisper', lambda: True)
    monkeypatch.setattr(api, '_decode_local', decode)
    with client_for(monkeypatch, tmp_path) as client:
        response = client.post('/transcribe', files={'file':('a',b'voice','audio/wav')})
        assert response.status_code == 202
        job = response.json()['job_id']
        result = {}
        for _ in range(500):
            result = client.get('/transcribe/jobs/' + job).json()
            if result['state'] != 'running': break
            time.sleep(.01)
        assert result['raw_transcript'] == 'synthetic local result'
        client.delete('/transcribe/jobs/' + job)
    assert seen == ['resolution']
    assert not any((tmp_path/'cache/scratch/smart-dictation').iterdir())


def test_nonlocal_provider_is_refused_before_receiving_audio(monkeypatch, tmp_path):
    monkeypatch.setattr(api, '_stt', lambda: None)
    monkeypatch.setattr(api, '_has_faster_whisper', lambda: True)
    with client_for(monkeypatch, tmp_path) as client:
        assert client.post('/transcribe', files={'file':('a',b'voice','audio/wav')}).status_code == 503
    assert not (tmp_path/'cache').exists()
