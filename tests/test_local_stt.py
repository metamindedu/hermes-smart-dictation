import importlib.util
import math
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

spec = importlib.util.spec_from_file_location('local_stt_api', Path(__file__).resolve().parents[1] / 'dashboard/plugin_api.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


@pytest.fixture
def config(monkeypatch):
    state = {'stt': {'provider': 'local', 'local': {}}}
    monkeypatch.setitem(sys.modules, 'hermes_cli.config', SimpleNamespace(load_config_readonly=lambda: state))
    return state


def test_language_config_only_and_frozen_projection(config, monkeypatch):
    monkeypatch.setenv('HERMES_LOCAL_STT_LANGUAGE', 'fr')
    config['stt']['api_key'] = 'secret'
    cfg = api._stt()
    assert cfg['language'] is None and 'api_key' not in cfg and 'secret' not in repr(cfg)
    config['stt']['language'] = 'ko'
    config['stt']['local']['language'] = 'ja'
    assert api._stt()['language'] == 'ja'
    config['stt']['local']['language'] = ''
    assert api._stt()['language'] == 'ko'
    assert cfg['language'] is None


@pytest.mark.parametrize('key,value', [
    ('vad', 1), ('vad_min_silence_ms', True), ('vad_min_silence_ms', -1),
    ('no_speech_prob_threshold', float('nan')), ('no_speech_prob_threshold', 1.1),
    ('logprob_threshold', float('inf')), ('logprob_threshold', True),
    ('logprob_threshold', 1), ('device', 'mps'), ('compute_type', 'unknown'),
    ('model', '../missing'), ('language', 1), ('initial_prompt', []),
])
def test_invalid_values_are_rejected(config, key, value):
    config['stt']['local'][key] = value
    with pytest.raises(ValueError):
        api._stt()


@pytest.mark.parametrize('stt', [[], {'provider': 'local', 'local': []}])
def test_invalid_section_shape(config, stt):
    config['stt'] = stt
    with pytest.raises(ValueError):
        api._stt()


def test_cache_owner_settings_and_local_files_only(config, monkeypatch, tmp_path):
    made = []
    for name in ('model.bin', 'config.json', 'tokenizer.json', 'vocabulary.json'):
        (tmp_path / name).write_bytes(b'fixture')
    monkeypatch.setattr(api._local, 'resolve', lambda cfg: tmp_path)
    class Model:
        def __init__(self, name, **kwargs):
            made.append((name, kwargs))
    monkeypatch.setitem(sys.modules, 'faster_whisper', SimpleNamespace(WhisperModel=Model))
    api._MODELS.clear()
    cfg = api._stt()
    a, b = tmp_path / 'a', tmp_path / 'b'
    first = api._load_model(a, cfg)
    assert first is api._load_model(a, cfg)
    assert first is not api._load_model(b, cfg)
    changed = {**cfg, 'language': 'ko'}
    assert first is not api._load_model(a, changed)
    assert len(api._MODELS) == 2 and len(made) == 3
    assert all(k['local_files_only'] is True for _, k in made)
    assert made[0][1]['use_auth_token'] is False
    assert made[0][1]['files']['tokenizer.json'] == b'fixture'
    api._MODELS.clear()


def test_directory_and_explicit_device_forwarded(config, monkeypatch, tmp_path):
    for name in ('model.bin', 'config.json', 'tokenizer.json', 'vocabulary.json'):
        (tmp_path / name).write_bytes(b'fixture')
    config['stt']['local'].update(model=str(tmp_path), device='cpu', compute_type='int8')
    calls = []
    monkeypatch.setitem(sys.modules, 'faster_whisper', SimpleNamespace(WhisperModel=lambda *a, **kw: calls.append((a, kw)) or object()))
    api._MODELS.clear()
    api._load_model(tmp_path, api._stt())
    assert {k: v for k, v in calls[0][1].items() if k != 'files'} == {'device': 'cpu', 'compute_type': 'int8', 'local_files_only': True, 'use_auth_token': False}
    api._MODELS.clear()


def test_missing_tokenizer_refuses_before_constructor(config, monkeypatch, tmp_path):
    for name in ('model.bin', 'config.json', 'vocabulary.json'):
        (tmp_path / name).write_bytes(b'fixture')
    config['stt']['local']['model'] = str(tmp_path)
    calls = []
    monkeypatch.setitem(sys.modules, 'faster_whisper', SimpleNamespace(WhisperModel=lambda *a, **k: calls.append(k)))
    api._MODELS.clear()
    with pytest.raises(api.STTUnavailable):
        api._load_model(tmp_path, api._stt())
    assert calls == []


def test_alias_resolution_is_local_and_token_free(config, monkeypatch, tmp_path):
    calls = []
    monkeypatch.setitem(sys.modules, 'faster_whisper.utils', SimpleNamespace(download_model=lambda name, **kw: calls.append((name, kw)) or str(tmp_path)))
    assert api._local.resolve(api._stt()) == tmp_path
    assert calls == [('base', {'local_files_only': True, 'use_auth_token': False})]


def test_prompt_and_provider_overrides(config):
    config['stt'].update(provider='smart_dictation', language='ko')
    config['stt']['local']['initial_prompt'] = 'x' * 1000
    cfg = api._stt()
    assert cfg['language'] == 'ko' and len(cfg['initial_prompt']) == 896
    cfg = api._local.settings(config, language='ja', prompt='', prompt_present=True)
    assert cfg['language'] == 'ja' and cfg['initial_prompt'] is None


def seg(text, silence=.5, prob=-.5):
    return SimpleNamespace(text=text, no_speech_prob=silence, avg_logprob=prob)


def test_lazy_segments_and_metric_boundaries(config, monkeypatch, tmp_path):
    monkeypatch.setattr(api._local, 'pcm', lambda *a: SimpleNamespace(size=1))
    consumed, kwargs = [], {}
    class Model:
        def transcribe(self, path, **kw):
            kwargs.update(kw)
            def lazy():
                for segment in [seg('keep1', .6, -2), seg('drop', .7, -1.1), seg('keep2', .7, -1)]:
                    consumed.append(segment.text)
                    yield segment
            return lazy(), None
    monkeypatch.setattr(api._local, 'load_model', lambda home, cfg: Model())
    config['stt']['local'].update(vad=False, vad_min_silence_ms=800, initial_prompt='hint')
    assert api._decode_local(tmp_path, api._stt(), 'audio') == 'keep1 keep2'
    assert consumed == ['keep1', 'drop', 'keep2']
    assert kwargs['beam_size'] == 5 and kwargs['vad_filter'] is False
    assert kwargs['vad_parameters'] == {'min_silence_duration_ms': 800} and kwargs['initial_prompt'] == 'hint'
    assert kwargs['language'] is None and kwargs['no_speech_threshold'] == .6 and kwargs['log_prob_threshold'] == -1


@pytest.mark.parametrize('segment', [seg('x', float('nan')), seg('x', .5, float('inf')), seg('x', True), SimpleNamespace(text='x')])
def test_malformed_metrics_fail_closed(config, monkeypatch, tmp_path, segment):
    monkeypatch.setattr(api._local, 'pcm', lambda *a: SimpleNamespace(size=1))
    monkeypatch.setattr(api._local, 'load_model', lambda *a: SimpleNamespace(transcribe=lambda *a, **kw: (iter([segment]), None)))
    with pytest.raises((ValueError, AttributeError)):
        api._decode_local(tmp_path, api._stt(), 'audio')


def test_raw_bound_and_lazy_failure_cleanup(config, monkeypatch, tmp_path):
    monkeypatch.setattr(api._local, 'pcm', lambda path, *a: SimpleNamespace(size=1))
    def decode(path, **kw):
        def lazy():
            yield seg('x' * 16001)
        return lazy(), None
    monkeypatch.setattr(api._local, 'load_model', lambda *a: SimpleNamespace(transcribe=decode))
    result = api._run_audio(tmp_path, b'voice', '.wav', api._stt())
    assert result.status_code == 502
    assert list((tmp_path / 'cache/scratch/smart-dictation').iterdir()) == []


def test_missing_model_is_unavailable_and_cleans(config, monkeypatch, tmp_path):
    monkeypatch.setattr(api._local, 'pcm', lambda *a: SimpleNamespace(size=1))
    monkeypatch.setattr(api._local, 'resolve', lambda cfg: (_ for _ in ()).throw(FileNotFoundError('private cache detail')))
    def fail(*args, **kwargs):
        assert kwargs['local_files_only'] is True
        raise FileNotFoundError('private cache detail')
    monkeypatch.setitem(sys.modules, 'faster_whisper', SimpleNamespace(WhisperModel=fail))
    api._MODELS.clear()
    result = api._run_audio(tmp_path, b'voice', '.wav', api._stt())
    assert result.status_code == 503 and b'stt_unavailable' in result.body and b'private' not in result.body
    assert list((tmp_path / 'cache/scratch/smart-dictation').iterdir()) == []

@pytest.mark.parametrize('enabled', [False, None, 'true', 1])
def test_explicit_disabled_or_malformed_enabled_is_unavailable(config, enabled):
    config['stt']['enabled'] = enabled
    assert api._stt() is None
