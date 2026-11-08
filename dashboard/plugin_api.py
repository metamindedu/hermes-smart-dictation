"""Profile-scoped, bounded file transcription. No network or config writes at import.

Local STT uses only faster-whisper's cached public API. Language comes from the
owner-scoped Hermes config projection; blank hints mean autodetection. Device and
compute settings are passed through without CUDA retry. A segment is dropped
only when both configured silence and low-logprob tests are strictly exceeded.
Status availability reports library presence, not model-cache verification.
"""
import contextvars
import importlib.util
import math
import secrets
import os
from pathlib import Path
import tempfile
import threading

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.datastructures import UploadFile

router = APIRouter()
VERSION = "0.4.0"
MAX_AUDIO_BYTES = 12 * 1024 * 1024
MAX_BODY_BYTES = MAX_AUDIO_BYTES + 64 * 1024
MIMES = {"audio/webm": ".webm", "video/webm": ".webm", "audio/ogg": ".ogg", "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/mp4": ".mp4", "video/mp4": ".mp4"}
_GUARD = threading.Lock()
_BUSY = set()
_JOBS = {}
_TIMERS = {}
JOB_TTL = 120
MAX_RETAINED = 2
_MODEL_LOCK = threading.Lock()
_MODELS = {}


def _error(status, code):
    return JSONResponse(status_code=status, content={"ok": False, "error": code})


def _home():
    from hermes_constants import get_hermes_home
    return get_hermes_home().resolve()


def _profile():
    from hermes_constants import profile_name_for_home
    name = profile_name_for_home(_home())
    if not name:
        raise ValueError('unrecognized profile home')
    return name


def _identity():
    return (str(_home()), _profile())


def _stt():
    """Freeze only nonsecret local settings in the current native owner scope."""
    from hermes_cli.config import load_config_readonly
    root = load_config_readonly()
    if not isinstance(root, dict) or not isinstance(root.get('stt', {}), dict):
        raise ValueError('invalid STT configuration')
    source = root.get('stt', {})
    if source.get('enabled', True) is not True or source.get('provider') != 'local':
        return None
    local = source.get('local', {})
    if not isinstance(local, dict):
        raise ValueError('invalid local STT configuration')

    def text(value, limit):
        if not isinstance(value, str) or len(value) > limit:
            raise ValueError('invalid local STT text')
        return value.strip()

    def number(value, low, high, integer=False):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high or (integer and not isinstance(value, int)):
            raise ValueError('invalid local STT number')
        return value

    model = text(local.get('model', 'base'), 1024) or 'base'
    # Faster-whisper only accepts built-in aliases or existing model directories.
    aliases = {'tiny', 'tiny.en', 'base', 'base.en', 'small', 'small.en', 'medium', 'medium.en', 'large-v1', 'large-v2', 'large-v3', 'large', 'distil-large-v2', 'distil-medium.en', 'distil-small.en', 'distil-large-v3', 'large-v3-turbo', 'turbo', 'distil-large-v3.5'}
    if model not in aliases and not Path(model).is_dir():
        raise ValueError('invalid local model')
    device = text(local.get('device', 'auto'), 20)
    if device not in {'auto', 'cpu', 'cuda'}:
        raise ValueError('unsupported local device')
    compute = text(local.get('compute_type', 'auto'), 40)
    if compute not in {'auto', 'default', 'int8', 'int8_float16', 'int8_float32', 'int8_bfloat16', 'int16', 'float16', 'float32', 'bfloat16'}:
        raise ValueError('unsupported compute type')
    language = text(local.get('language', ''), 32) or text(source.get('language', ''), 32) or None
    prompt = text(local.get('initial_prompt', ''), 4000) or text(source.get('prompt', ''), 4000) or None
    vad = local.get('vad', True)
    if not isinstance(vad, bool):
        raise ValueError('invalid VAD')
    return {'model': model, 'device': device, 'compute_type': compute, 'language': language,
            'initial_prompt': prompt, 'vad': vad,
            'vad_min_silence_ms': number(local.get('vad_min_silence_ms', 500), 0, 60000, True),
            'no_speech_prob_threshold': number(local.get('no_speech_prob_threshold', .6), 0, 1),
            'logprob_threshold': number(local.get('logprob_threshold', -1.0), -100, 0)}


def _has_faster_whisper():
    try:
        return importlib.util.find_spec('faster_whisper') is not None
    except (ImportError, ValueError):
        return False


def _owner_ok(request):
    q = request.query_params
    try:
        profile = _profile()
        return not (set(q.keys()) - {"owner_profile", "profile"}) and all(q.getlist(k) in ([], [profile]) for k in ("owner_profile", "profile"))
    except Exception:
        return False


@router.get('/soul')
async def soul(request: Request):
    if not _owner_ok(request):
        return _error(403, 'invalid_owner')
    try:
        home = _home()
        if home is None:
            return _error(403, 'invalid_owner')
        path = home / 'SOUL.md'
        if path.is_symlink():
            return _error(403, 'invalid_soul_path')
        if not path.exists():
            return {"ok": True, "profile": _profile(), "soul": "", "truncated": False}
        if path.is_symlink() or path.resolve().parent != home.resolve():
            return _error(403, 'invalid_soul_path')
        with path.open('rb') as handle:
            data = handle.read(65537)
        text = data[:65536].decode('utf-8-sig', errors='replace')
        return {"ok": True, "profile": _profile(), "soul": text[:4000], "truncated": len(data) > 65536 or len(text) > 4000}
    except Exception:
        return _error(503, 'soul_unavailable')


class STTUnavailable(Exception):
    pass


def _load_model(home, cfg):
    # Partition on the captured owner and entire effective settings projection.
    key = (str(home), tuple(sorted(cfg.items())))
    with _MODEL_LOCK:
        if key not in _MODELS:
            try:
                from faster_whisper import WhisperModel
                model = WhisperModel(cfg['model'], device=cfg['device'],
                                     compute_type=cfg['compute_type'], local_files_only=True)
            except Exception as exc:
                raise STTUnavailable() from exc
            if len(_MODELS) >= 2:
                _MODELS.pop(next(iter(_MODELS)))
            _MODELS[key] = model
        return _MODELS[key]


def _decode_local(home, cfg, path):
    model = _load_model(home, cfg)
    segments, _ = model.transcribe(path, language=cfg['language'], task='transcribe',
        beam_size=5, condition_on_previous_text=False, initial_prompt=cfg['initial_prompt'],
        vad_filter=cfg['vad'], vad_parameters={'min_silence_duration_ms': cfg['vad_min_silence_ms']},
        no_speech_threshold=cfg['no_speech_prob_threshold'], log_prob_threshold=cfg['logprob_threshold'])
    pieces, length = [], 0
    # The iterable is lazy: decode and enforce bounds inside the owner worker.
    for segment in segments:
        silence = segment.no_speech_prob
        logprob = segment.avg_logprob
        if (isinstance(silence, bool) or not isinstance(silence, (int, float)) or not math.isfinite(silence) or not 0 <= silence <= 1 or
            isinstance(logprob, bool) or not isinstance(logprob, (int, float)) or not math.isfinite(logprob)):
            raise ValueError('invalid segment metrics')
        if silence > cfg['no_speech_prob_threshold'] and logprob < cfg['logprob_threshold']:
            continue
        if not isinstance(segment.text, str):
            raise ValueError('invalid segment text')
        piece = segment.text.strip()
        if piece:
            length += len(piece) + bool(pieces)
            if length > 16000:
                raise ValueError('transcript too large')
            pieces.append(piece)
    return ' '.join(pieces)


@router.get('/status')
async def status(request: Request):
    if not _owner_ok(request):
        return _error(403, "invalid_owner")
    try:
        if _home() is None:
            return _error(403, "invalid_owner")
        cfg = _stt()
        with _GUARD:
            busy = _identity() in _BUSY
        return {"ok": True, "transcription_busy": busy, "capabilities": ["async-transcription-v1"], "version": VERSION, "profile": _profile(), "stt": {"provider": 'local' if cfg else None, "model": cfg['model'] if cfg else None, "language": cfg['language'] if cfg else None, "available": bool(cfg and _has_faster_whisper()), "cache_verified": False}, "max_audio_bytes": MAX_AUDIO_BYTES}
    except Exception:
        return _error(503, "status_unavailable")


def _run_audio(home, audio, suffix, cfg):
    path = None
    try:
        scratch = home
        for part in ('cache', 'scratch', 'smart-dictation'):
            scratch = scratch / part
            if scratch.is_symlink():
                raise ValueError('unsafe scratch path')
            scratch.mkdir(exist_ok=True)
            if scratch.is_symlink() or scratch.resolve() != scratch.absolute():
                raise ValueError('unsafe scratch path')
        with tempfile.NamedTemporaryFile(dir=scratch, suffix=suffix, prefix="audio-", delete=False) as f:
            path = f.name
            f.write(audio)
        raw = _decode_local(home, cfg, path)
        if not isinstance(raw, str) or len(raw) > 16000:
            return _error(502, "transcription_failed")
        return {"ok": True, "raw_transcript": raw, "provider": "local"}
    except STTUnavailable:
        return _error(503, "stt_unavailable")
    except Exception:
        return _error(502, "transcription_failed")
    finally:
        if path:
            try:
                os.unlink(path)
            except OSError:
                pass


@router.post('/transcribe')
async def transcribe(request: Request):
    if not _owner_ok(request):
        return _error(403, "invalid_owner")
    try:
        home = _home()
        if home is None:
            return _error(403, "invalid_owner")
        cfg = _stt()
        if cfg is None or not _has_faster_whisper():
            return _error(503, "stt_unavailable")
    except Exception:
        return _error(503, "stt_unavailable")
    identity = _identity()
    with _GUARD:
        if identity in _BUSY:
            return _error(429, "busy")
        _BUSY.add(identity)
    handed_off = False
    try:
        content_type = request.headers.get("content-type", "")
        if not content_type.lower().startswith("multipart/form-data;"):
            return _error(415, "invalid_content_type")
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > MAX_BODY_BYTES:
                return _error(413, "audio_too_large")
        # Keep Starlette's multipart spool in memory: only our own worker creates
        # an on-disk file, in the profile-specific scratch directory.
        from starlette.formparsers import MultiPartParser
        class MemoryParser(MultiPartParser):
            spool_max_size = MAX_BODY_BYTES + 1
        async def body_stream():
            yield bytes(body)
        form = None
        try:
            form = await MemoryParser(request.headers, body_stream(), max_files=1, max_fields=0).parse()
            items = list(form.multi_items())
            if len(items) != 1 or items[0][0] != "file" or not isinstance(items[0][1], UploadFile):
                return _error(400, "invalid_upload")
            upload = items[0][1]
            suffix = MIMES.get((upload.content_type or "").lower())
            if not suffix:
                return _error(415, "unsupported_audio_type")
            audio = await upload.read(MAX_AUDIO_BYTES + 1)
        except Exception:
            return _error(400, "invalid_upload")
        finally:
            if form is not None:
                await form.close()
        if len(audio) > MAX_AUDIO_BYTES:
            return _error(413, "audio_too_large")
        if not audio:
            return _error(400, "empty_audio")
        job_id = secrets.token_hex(16)
        context = contextvars.copy_context()
        with _GUARD:
            _JOBS[job_id] = {'owner': identity, 'state': 'running'}
        worker = threading.Thread(target=lambda: context.run(_job_worker, identity, job_id, home, audio, suffix, cfg), daemon=True)
        try:
            worker.start()
        except Exception:
            with _GUARD:
                _JOBS.pop(job_id, None)
            raise
        handed_off = True
        return JSONResponse(status_code=202, content={'ok': True, 'profile': identity[1], 'job_id': job_id, 'state': 'running'})
    finally:
        if not handed_off:
            with _GUARD:
                _BUSY.discard(identity)


def _expire(job_id):
    with _GUARD:
        _JOBS.pop(job_id, None)
        _TIMERS.pop(job_id, None)


def _job_worker(identity, job_id, home, audio, suffix, cfg):
    try:
        result = _run_audio(home, audio, suffix, cfg)
        if isinstance(result, dict) and result.get('ok'):
            outcome = {'state': 'done', 'raw_transcript': result['raw_transcript']}
        else:
            outcome = {'state': 'error', 'error': 'stt_unavailable' if isinstance(result, JSONResponse) and result.status_code == 503 else 'transcription_failed'}
    except Exception:
        outcome = {'state': 'error', 'error': 'transcription_failed'}
    finally:
        audio = None
    with _GUARD:
        _BUSY.discard(identity)
        job = _JOBS.get(job_id)
        if job is None:
            return
        job.update(outcome)
        completed = [key for key, value in _JOBS.items() if value['owner'] == identity and value['state'] != 'running']
        for old in completed[:-MAX_RETAINED]:
            _JOBS.pop(old, None)
            old_timer = _TIMERS.pop(old, None)
            if old_timer:
                old_timer.cancel()
        timer = threading.Timer(JOB_TTL, _expire, args=(job_id,))
        timer.daemon = True
        _TIMERS[job_id] = timer
        try:
            timer.start()
        except Exception:
            _JOBS.pop(job_id, None)
            _TIMERS.pop(job_id, None)


@router.get('/transcribe/jobs/{job_id}')
async def transcribe_job(job_id: str, request: Request):
    if not _owner_ok(request):
        return _error(403, 'invalid_owner')
    identity = _identity()
    with _GUARD:
        job = _JOBS.get(job_id)
        if not job or job['owner'] != identity:
            return _error(404, 'job_not_found')
        result = {k: v for k, v in job.items() if k != 'owner'}
    return {'ok': True, 'profile': identity[1], 'job_id': job_id, **result}


@router.delete('/transcribe/jobs/{job_id}')
async def delete_transcribe_job(job_id: str, request: Request):
    if not _owner_ok(request):
        return _error(403, 'invalid_owner')
    identity = _identity()
    with _GUARD:
        job = _JOBS.get(job_id)
        if not job or job['owner'] != identity:
            return _error(404, 'job_not_found')
        _JOBS.pop(job_id, None)
        timer = _TIMERS.pop(job_id, None)
        if timer:
            timer.cancel()
        # An in-flight native decoder cannot be killed safely. Keep the owner
        # busy until its worker exits, but discard its result on completion.
    return {'ok': True, 'profile': identity[1], 'job_id': job_id, 'state': 'cancelled'}
