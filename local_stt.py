"""Offline-only shared local ASR. Never downloads weights or falls back to cloud."""
from contextlib import ExitStack
import importlib.util
import math
from pathlib import Path
import re
import stat
import threading

MAX_BYTES = 12 * 1024 * 1024
SLOT = threading.Lock()
_LOCK = threading.Lock()
_MODELS = {}

class STTUnavailable(Exception):
    pass

def settings(root, model=None, language=None, prompt=None, prompt_present=False):
    if not isinstance(root, dict) or not isinstance(root.get('stt', {}), dict):
        raise ValueError('invalid stt')
    s = root.get('stt', {})
    if s.get('enabled', True) is not True or s.get('provider') not in ('local', 'smart_dictation'):
        return None
    local = s.get('local', {})
    if not isinstance(local, dict):
        raise ValueError('invalid local')
    def text(v, n):
        if not isinstance(v, str) or len(v) > n:
            raise ValueError('invalid text')
        return v.strip()
    def number(v, lo, hi, integer=False):
        if isinstance(v, bool) or not isinstance(v, (float, int)) or not math.isfinite(v) or not lo <= v <= hi or (integer and not isinstance(v, int)):
            raise ValueError('invalid number')
        return v
    chosen = text(model if model is not None else local.get('model', 'base'), 1024)
    if not chosen:
        raise ValueError('empty model')
    # Public available_models is authoritative. Missing dependency means unavailability,
    # not permission to accept an arbitrary alias.
    if not Path(chosen).is_dir():
        try:
            from faster_whisper import available_models
            aliases = available_models()
        except ImportError:
            aliases = ('tiny','tiny.en','base','base.en','small','small.en','medium','medium.en','large-v1','large-v2','large-v3','large','distil-large-v2','distil-medium.en','distil-small.en','distil-large-v3','large-v3-turbo','turbo','distil-large-v3.5')
        if chosen not in aliases:
            raise ValueError('invalid model')
    device = text(local.get('device', 'auto'), 20)
    compute = text(local.get('compute_type', 'auto'), 40)
    if device not in ('auto','cpu','cuda') or compute not in ('auto','default','int8','int8_float16','int8_float32','int8_bfloat16','int16','float16','float32','bfloat16'):
        raise ValueError('invalid device')
    lang = text(language, 32) if language is not None else (text(local.get('language', ''), 32) or text(s.get('language', ''), 32))
    if lang and not re.fullmatch(r'[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*', lang):
        raise ValueError('invalid language')
    hint = text(prompt, 4000) if prompt_present else (text(local.get('initial_prompt', ''), 4000) or text(s.get('prompt', ''), 4000))
    vad = local.get('vad', True)
    if type(vad) is not bool:
        raise ValueError('invalid vad')
    return {'model':chosen,'device':device,'compute_type':compute,'language':lang or None,'initial_prompt':hint[-896:] or None,'vad':vad,
            'vad_min_silence_ms':number(local.get('vad_min_silence_ms',500),0,60000,True),
            'no_speech_prob_threshold':number(local.get('no_speech_prob_threshold',.6),0,1),
            'logprob_threshold':number(local.get('logprob_threshold',-1.0),-100,0)}

def library_available():
    try:
        return all(importlib.util.find_spec(x) is not None for x in ('faster_whisper','av','numpy'))
    except (ImportError, ValueError):
        return False

def resolve(cfg):
    p = Path(cfg['model'])
    if not p.is_dir():
        from faster_whisper.utils import download_model
        p = Path(download_model(cfg['model'], local_files_only=True, use_auth_token=False))
    return p

def cache_available(cfg):
    try:
        p = resolve(cfg)
        return all((p / n).is_file() and (p / n).stat().st_size > 0 for n in ('model.bin','config.json','tokenizer.json')) and any((p / n).is_file() and (p / n).stat().st_size > 0 for n in ('vocabulary.json','vocabulary.txt'))
    except Exception:
        return False

def load_model(home, cfg):
    key = (str(Path(home).resolve()), tuple(sorted(cfg.items())))
    with _LOCK:
        if key in _MODELS:
            return _MODELS[key]
        try:
            from faster_whisper import WhisperModel
            p = resolve(cfg)
            with ExitStack() as stack:
                files = {}
                for name in ('model.bin','config.json'):
                    f = stack.enter_context((p / name).open('rb'))
                    if not f.seek(0, 2):
                        raise ValueError('empty model file')
                    f.seek(0)
                    files[name] = f
                vocab = next(n for n in ('vocabulary.json','vocabulary.txt') if (p / n).is_file())
                f = stack.enter_context((p / vocab).open('rb'))
                if not f.seek(0, 2):
                    raise ValueError('empty vocabulary')
                f.seek(0)
                files[vocab] = f
                for name in ('tokenizer.json','preprocessor_config.json'):
                    if name == 'preprocessor_config.json' and not (p / name).exists():
                        continue
                    with (p / name).open('rb') as f:
                        data = f.read(16 * 1024 * 1024 + 1)
                    if not data or len(data) > 16 * 1024 * 1024:
                        raise ValueError('invalid tokenizer or preprocessor')
                    files[name] = data
                result = WhisperModel(str(p), files=files, device=cfg['device'], compute_type=cfg['compute_type'], local_files_only=True, use_auth_token=False)
        except Exception as exc:
            raise STTUnavailable() from exc
        if len(_MODELS) >= 2:
            _MODELS.pop(next(iter(_MODELS)))
        _MODELS[key] = result
        return result

def clear_models():
    with _LOCK:
        _MODELS.clear()

def pcm(path, max_seconds):
    import av
    import numpy as np
    p = Path(path)
    if not stat.S_ISREG(p.stat().st_mode) or p.stat().st_size > MAX_BYTES or p.stat().st_size == 0:
        raise ValueError('invalid audio')
    blocks = []
    samples = 0
    resampler = av.AudioResampler(format='s16', layout='mono', rate=16000)
    def retain(frame):
        nonlocal samples
        if frame.samples < 0 or samples + frame.samples > max_seconds * 16000:
            raise ValueError('audio too long')
        a = frame.to_ndarray()
        if a.size != frame.samples:
            raise ValueError('invalid channels')
        samples += frame.samples
        blocks.append(a.reshape(-1))
    with av.open(str(p), mode='r', options={'protocol_whitelist':'file,pipe'}) as container:
        for frame in container.decode(audio=0):
            for converted in resampler.resample(frame):
                retain(converted)
        for converted in resampler.resample(None):
            retain(converted)
    if not blocks:
        return np.empty(0, dtype=np.float32)
    return np.concatenate(blocks).astype(np.float32) / 32768.0

def decode_local(path, *, owner_home, settings, max_seconds=600):
    audio = pcm(path, max_seconds)
    if not audio.size:
        return ''
    model = load_model(owner_home, settings)
    segments, _ = model.transcribe(audio, language=settings['language'], task='transcribe', temperature=0.0,
        beam_size=5, condition_on_previous_text=False, initial_prompt=settings['initial_prompt'], vad_filter=settings['vad'],
        vad_parameters={'min_silence_duration_ms':settings['vad_min_silence_ms']},
        no_speech_threshold=settings['no_speech_prob_threshold'], log_prob_threshold=settings['logprob_threshold'])
    pieces, length = [], 0
    for segment in segments:
        silence, prob = segment.no_speech_prob, segment.avg_logprob
        if any(isinstance(v, bool) or not isinstance(v, (float,int)) or not math.isfinite(v) for v in (silence,prob)) or not 0 <= silence <= 1:
            raise ValueError('invalid segment')
        if silence > settings['no_speech_prob_threshold'] and prob < settings['logprob_threshold']:
            continue
        if not isinstance(segment.text, str):
            raise ValueError('invalid text')
        piece = segment.text.strip()
        if piece:
            length += len(piece) + bool(pieces)
            if length > 16000:
                raise ValueError('transcript too large')
            pieces.append(piece)
    return ' '.join(pieces)
