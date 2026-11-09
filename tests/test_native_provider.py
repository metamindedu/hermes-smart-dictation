import importlib.util
import sys
import threading
from pathlib import Path
from types import SimpleNamespace
import pytest

ROOT=Path(__file__).resolve().parents[1]
def module(name, file):
    spec=importlib.util.spec_from_file_location(name,ROOT/file)
    result=importlib.util.module_from_spec(spec); spec.loader.exec_module(result); return result

@pytest.fixture
def fixture(monkeypatch,tmp_path):
    state={'home':tmp_path,'policy':{},'root':{'stt':{'provider':'smart_dictation'}},'raw':'raw words','calls':[]}
    monkeypatch.setitem(sys.modules,'agent.transcription_provider',SimpleNamespace(TranscriptionProvider=object))
    monkeypatch.setitem(sys.modules,'hermes_constants',SimpleNamespace(get_hermes_home=lambda:state['home']))
    monkeypatch.setitem(sys.modules,'hermes_cli.config',SimpleNamespace(load_config_readonly=lambda:state['root']))
    provider=module('provider_unit','native_provider.py'); correction=module('correction_unit','correction.py')
    class Unavailable(Exception): pass
    local=SimpleNamespace(SLOT=threading.Lock(), STTUnavailable=Unavailable, settings=lambda *a,**k:{}, library_available=lambda:True, clear_models=lambda:None,
        decode_local=lambda *a,**kw:state['raw'])
    def complete(messages,**kwargs):
        state['calls'].append((messages,kwargs)); return SimpleNamespace(text='{"transcript":"corrected"}')
    ctx=SimpleNamespace(get_config=lambda key,default:state['policy'], llm=SimpleNamespace(complete=complete))
    return provider.SmartDictationProvider(ctx,tmp_path,local,correction),state,local,correction

def test_default_disabled_and_no_speech(fixture):
    p,s,_,_=fixture
    assert p.transcribe('file')['transcript']=='raw words' and not s['calls']
    s['policy']={'correction_enabled':True,'consent_version':'native-v1'}; s['raw']=''
    assert p.transcribe('file')['transcript']=='' and not s['calls']

def test_enabled_single_original_facade_and_revocation(fixture):
    p,s,local,c=fixture
    s['policy']={'correction_enabled':True,'consent_version':'native-v1'}
    assert p.transcribe('file')['transcript']=='corrected' and len(s['calls'])==1
    def revoke(*a,**k): s['policy']={'correction_enabled':False}; return 'raw words'
    local.decode_local=revoke
    assert p.transcribe('file')['transcript']==c.WARNING+'raw words' and len(s['calls'])==1

def test_owner_change_never_transmits(fixture,tmp_path):
    p,s,local,_=fixture
    s['policy']={'correction_enabled':True,'consent_version':'native-v1'}
    def changed(*a,**kw): s['home']=tmp_path/'different'; return 'raw'
    local.decode_local=changed
    result=p.transcribe('file'); assert result['error']=='invalid_owner' and not s['calls']

def test_invalid_policy_and_unsafe_task_and_busy(fixture):
    p,s,local,c=fixture
    s['policy']={'correction_enabled':True}
    assert not p.transcribe('file')['success'] and not s['calls']
    s['policy']={'correction_enabled':True,'consent_version':'native-v1'}
    s['root']['auxiliary']={'smart_dictation_correction':{'extra_body':{'tools':[]}}}
    assert p.transcribe('file')['transcript']==c.WARNING+'raw words' and not s['calls']
    local.SLOT.acquire()
    try: assert p.transcribe('file')['error']=='busy'
    finally: local.SLOT.release()
    p.close(); assert p.transcribe('file')['error']=='invalid_owner'
