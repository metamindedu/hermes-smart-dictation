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

_root_spec = importlib.util.spec_from_file_location('smart_dictation_root_loader', Path(__file__).resolve().parents[1] / '__init__.py')
_root = importlib.util.module_from_spec(_root_spec)
_root_spec.loader.exec_module(_root)
_shared = _root._loader()
_local = _shared.load('local_stt')
_correction = _shared.load('correction')

router = APIRouter()
VERSION = "0.5.0"
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
    from hermes_cli.config import load_config_readonly
    return _local.settings(load_config_readonly())


def _has_faster_whisper():
    return _local.library_available()


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


STTUnavailable = _local.STTUnavailable
_MODELS = _local._MODELS

def _load_model(home, cfg):
    return _local.load_model(home, cfg)

# Recording stops nominally at 180 s; retain a bounded 5 s scheduling/encoding
# grace without trimming speech. Beyond this hard ceiling the file is refused.
CONTEXTUAL_MAX_SECONDS = 185

def _decode_local(home, cfg, path):
    return _local.decode_local(path, owner_home=home, settings=cfg, max_seconds=CONTEXTUAL_MAX_SECONDS)


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
        from hermes_cli.config import load_config_readonly
        configured = load_config_readonly().get('stt', {}).get('provider')
        return {"ok": True, "transcription_busy": busy, "capabilities": ["async-transcription-v1"], "version": VERSION, "profile": _profile(), "configured_stt_provider": configured, "stt": {"provider": 'local' if cfg else None, "model": cfg['model'] if cfg else None, "language": cfg['language'] if cfg else None, "available": bool(cfg and _has_faster_whisper()), "cache_verified": False}, "max_audio_bytes": MAX_AUDIO_BYTES}
    except Exception:
        return _error(503, "status_unavailable")


@router.get('/native-status')
async def native_status(request: Request):
    if not _owner_ok(request):
        return _error(403, 'invalid_owner')
    try:
        from hermes_cli.config import load_config_readonly
        root = load_config_readonly()
        source = root.get('stt', {})
        if not isinstance(source, dict):
            raise ValueError('invalid stt')
        selected = source.get('enabled', True) is True and source.get('provider') == 'smart_dictation'
        enabled = consent = False
        valid = False
        cfg = None
        try:
            entries = root.get('plugins', {}).get('entries', {})
            entry = entries.get('smart-dictation', {})
            settings = entry.get('settings', {})
            native = settings.get('native', entry.get('config', {}).get('native', {}))
            if not isinstance(native, dict):
                raise ValueError('invalid policy')
            enabled = native.get('correction_enabled', False) is True
            consent = native.get('consent_version') == 'native-v1'
            _correction.policy(native)
            if type(source.get('enabled', True)) is not bool:
                raise ValueError('invalid enabled')
            cfg = _local.settings({**root, 'stt': {**source, 'enabled': True, 'provider': 'smart_dictation'}})
            valid = cfg is not None
        except Exception:
            pass
        available = _has_faster_whisper()
        return {'ok': True, 'profile': _profile(), 'version': VERSION, 'native': {
            'selected': selected, 'correction_enabled': enabled, 'consent_valid': consent,
            'config_valid': valid, 'library_available': available,
            'cache_available': bool(valid and available and _local.cache_available(cfg)), 'model_load_tested': False}}
    except Exception:
        return _error(503, 'status_unavailable')


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
        if identity in _BUSY or not _local.SLOT.acquire(blocking=False):
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
                _local.SLOT.release()


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
        _local.SLOT.release()
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
