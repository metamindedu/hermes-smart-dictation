"""Real PyAV/NumPy duration admission; ASR is explicitly a stub, not inference."""
import importlib.util
import io
from pathlib import Path
from types import SimpleNamespace
import wave

import pytest

spec = importlib.util.spec_from_file_location(
    'duration_api', Path(__file__).resolve().parents[1] / 'dashboard/plugin_api.py')
assert spec is not None and spec.loader is not None
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


@pytest.mark.parametrize('milliseconds,accepted', [
    (180000, True),       # nominal auto-stop
    (180001, True),       # actual reviewed delayed-stop counterexample
    (185000, True),       # inclusive bounded grace ceiling
    (185001, False),      # never silently trim speech beyond the hard limit
])
def test_contextual_real_pcm_boundary_and_temp_cleanup(monkeypatch, tmp_path, milliseconds, accepted):
    frames = milliseconds * 16  # 16 kHz, exact whole samples
    out = io.BytesIO()
    with wave.open(out, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(b'\0\0' * frames)
    audio = out.getvalue()
    assert len(audio) < api.MAX_AUDIO_BYTES
    calls = []

    class StubASR:
        def transcribe(self, samples, **kwargs):
            calls.append(samples.size)
            return iter([SimpleNamespace(
                text='explicit ASR stub', no_speech_prob=0.0, avg_logprob=0.0)]), None

    monkeypatch.setattr(api._local, 'load_model', lambda *args: StubASR())
    cfg = api._local.settings({'stt': {'provider': 'local', 'local': {}}})
    result = api._run_audio(tmp_path, audio, '.wav', cfg)
    if accepted:
        assert result == {'ok': True, 'raw_transcript': 'explicit ASR stub', 'provider': 'local'}
        assert calls == [frames], 'all in-grace PCM must reach ASR without truncation'
    else:
        assert result.status_code == 502 and b'transcription_failed' in result.body
        assert calls == [], 'over-ceiling input must fail before model execution'
    assert list((tmp_path / 'cache/scratch/smart-dictation').iterdir()) == []
