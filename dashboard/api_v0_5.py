"""Manifest entry for the 0.5 public-surface API generation."""
from pathlib import Path
import importlib.util

_spec = importlib.util.spec_from_file_location(
    'smart_dictation_api_v0_5_impl', Path(__file__).with_name('plugin_api.py'))
if _spec is None or _spec.loader is None:
    raise ImportError('Smart Dictation API entry unavailable')
_impl = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_impl)
router = _impl.router
