"""Load plugin-owned modules by source path in either supported host loader."""
import hashlib
import importlib.util
from pathlib import Path
import sys
import threading

_LOCK = threading.RLock()

def load(name):
    path = Path(__file__).resolve().parent / (name + '.py')
    key = '_smart_dictation_050_' + hashlib.sha256(str(path).encode()).hexdigest()
    with _LOCK:
        if key not in sys.modules:
            spec = importlib.util.spec_from_file_location(key, path)
            module = importlib.util.module_from_spec(spec)
            sys.modules[key] = module
            try:
                spec.loader.exec_module(module)
            except BaseException:
                sys.modules.pop(key, None)
                raise
        return sys.modules[key]
