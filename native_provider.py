"""Public Hermes transcription-provider adapter."""
from agent.transcription_provider import TranscriptionProvider
from hermes_constants import get_hermes_home
from hermes_cli.config import load_config_readonly

class SmartDictationProvider(TranscriptionProvider):
    def __init__(self, ctx, owner_home, local, correction):
        self.ctx, self.home, self.local, self.correction = ctx, owner_home.resolve(), local, correction
        self.closed = False

    @property
    def name(self):
        return 'smart_dictation'

    @property
    def display_name(self):
        return 'Smart Dictation (local)'

    def owner_ok(self):
        return not self.closed and get_hermes_home().resolve() == self.home

    def is_available(self):
        try:
            return self.owner_ok() and self.local.library_available() and self.local.settings(load_config_readonly()) is not None
        except Exception:
            return False

    def transcribe(self, file_path, *, model=None, language=None, **extra):
        def fail(code):
            return {'success':False, 'transcript':'', 'provider':self.name, 'error':code}
        if not self.local.SLOT.acquire(blocking=False):
            return fail('busy')
        try:
            if not self.owner_ok():
                return fail('invalid_owner')
            root = load_config_readonly()
            if not isinstance(root, dict) or root.get('stt', {}).get('provider') != self.name:
                return fail('stt_unavailable')
            cfg = self.local.settings(root, model=model, language=language, prompt=extra.get('prompt'), prompt_present='prompt' in extra and isinstance(extra['prompt'], str))
            if cfg is None:
                return fail('stt_unavailable')
            if not self.owner_ok():
                return fail('invalid_owner')
            enabled, _ = self.correction.policy(self.ctx.get_config('native', {}))
            raw = self.local.decode_local(file_path, owner_home=self.home, settings=cfg, max_seconds=600)
            if not self.owner_ok():
                return fail('invalid_owner')
            if not raw or not enabled:
                text = raw
            else:
                try:
                    current_enabled, consent = self.correction.policy(self.ctx.get_config('native', {}))
                    if not self.owner_ok():
                        return fail('invalid_owner')
                    current_root = load_config_readonly()
                    allowed = current_enabled and consent and self.correction.safe_task(current_root)
                except Exception:
                    allowed = False
                if not self.owner_ok():
                    return fail('invalid_owner')
                text = self.correction.correct(raw, self.ctx.llm.complete) if allowed else self.correction.WARNING + raw
            return {'success':True, 'transcript':text, 'provider':self.name}
        except self.local.STTUnavailable:
            return fail('stt_unavailable')
        except Exception:
            return fail('transcription_failed')
        finally:
            self.local.SLOT.release()

    def close(self):
        self.closed = True
        self.local.clear_models()
