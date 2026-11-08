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
    assert made[0] == ('base', {'device': 'auto', 'compute_type': 'auto', 'local_files_only': True})
    api._MODELS.clear()


def test_directory_and_explicit_device_forwarded(config, monkeypatch, tmp_path):
    config['stt']['local'].update(model=str(tmp_path), device='cpu', compute_type='int8')
    calls = []
    monkeypatch.setitem(sys.modules, 'faster_whisper', SimpleNamespace(WhisperModel=lambda *a, **kw: calls.append((a, kw)) or object()))
    api._MODELS.clear()
    api._load_model(tmp_path, api._stt())
    assert calls[0][1] == {'device': 'cpu', 'compute_type': 'int8', 'local_files_only': True}
    api._MODELS.clear()


def seg(text, silence=.5, prob=-.5):
    return SimpleNamespace(text=text, no_speech_prob=silence, avg_logprob=prob)


def test_lazy_segments_and_metric_boundaries(config, monkeypatch, tmp_path):
    consumed, kwargs = [], {}
    class Model:
        def transcribe(self, path, **kw):
            kwargs.update(kw)
            def lazy():
                for segment in [seg('keep1', .6, -2), seg('drop', .7, -1.1), seg('keep2', .7, -1)]:
                    consumed.append(segment.text)
                    yield segment
            return lazy(), None
    monkeypatch.setattr(api, '_load_model', lambda home, cfg: Model())
    config['stt']['local'].update(vad=False, vad_min_silence_ms=800, initial_prompt='hint')
    assert api._decode_local(tmp_path, api._stt(), 'audio') == 'keep1 keep2'
    assert consumed == ['keep1', 'drop', 'keep2']
    assert kwargs['beam_size'] == 5 and kwargs['vad_filter'] is False
    assert kwargs['vad_parameters'] == {'min_silence_duration_ms': 800} and kwargs['initial_prompt'] == 'hint'
    assert kwargs['language'] is None and kwargs['no_speech_threshold'] == .6 and kwargs['log_prob_threshold'] == -1


@pytest.mark.parametrize('segment', [seg('x', float('nan')), seg('x', .5, float('inf')), seg('x', True), SimpleNamespace(text='x')])
def test_malformed_metrics_fail_closed(config, monkeypatch, tmp_path, segment):
    monkeypatch.setattr(api, '_load_model', lambda *a: SimpleNamespace(transcribe=lambda *a, **kw: (iter([segment]), None)))
    with pytest.raises((ValueError, AttributeError)):
        api._decode_local(tmp_path, api._stt(), 'audio')


def test_raw_bound_and_lazy_failure_cleanup(config, monkeypatch, tmp_path):
    def decode(path, **kw):
        def lazy():
            assert Path(path).exists()
            yield seg('x' * 16001)
        return lazy(), None
    monkeypatch.setattr(api, '_load_model', lambda *a: SimpleNamespace(transcribe=decode))
    result = api._run_audio(tmp_path, b'voice', '.wav', api._stt())
    assert result.status_code == 502
    assert list((tmp_path / 'cache/scratch/smart-dictation').iterdir()) == []


def test_missing_model_is_unavailable_and_cleans(config, monkeypatch, tmp_path):
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
