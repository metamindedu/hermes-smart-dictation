"""Versioned manifest entry: let the native host load this API generation."""
from pathlib import Path
import importlib.util

_spec = importlib.util.spec_from_file_location('smart_dictation_api_v0_3_impl', Path(__file__).with_name('plugin_api.py'))
_impl = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_impl)
router = _impl.router
