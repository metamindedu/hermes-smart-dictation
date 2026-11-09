"""Smart Dictation agent-side registration; importing performs no I/O."""

def _loader():
    import _imp
    import hashlib
    import importlib.util
    from pathlib import Path
    import sys
    path = Path(__file__).resolve().with_name('shared_loader.py')
    key = '_smart_dictation_loader_' + hashlib.sha256(str(path).encode()).hexdigest()
    _imp.acquire_lock()
    try:
        if key not in sys.modules:
            spec = importlib.util.spec_from_file_location(key, path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            sys.modules[key] = module
        return sys.modules[key]
    finally:
        _imp.release_lock()

def register(ctx):
    from hermes_constants import get_hermes_home
    loader = _loader()
    local = loader.load('local_stt')
    correction = loader.load('correction')
    provider = loader.load('native_provider').SmartDictationProvider(ctx, get_hermes_home(), local, correction)
    ctx.register_auxiliary_task(
        'smart_dictation_correction',
        display_name='Smart Dictation correction',
        description='Correct a dictated transcript without tools.',
        defaults={'provider': 'auto', 'timeout': 20},
    )
    ctx.register_transcription_provider(provider)
    ctx.on_unload(provider.close)