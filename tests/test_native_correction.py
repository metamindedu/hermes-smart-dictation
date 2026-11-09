import importlib.util
from pathlib import Path
from types import SimpleNamespace
import json
import pytest

spec = importlib.util.spec_from_file_location('correction_test', Path(__file__).resolve().parents[1] / 'correction.py')
c = importlib.util.module_from_spec(spec); spec.loader.exec_module(c)

def test_valid_transform_is_one_facade_call_with_no_overrides():
    calls = []
    def complete(messages, **kw):
        calls.append((messages, kw)); return SimpleNamespace(text='{"transcript":"한글 42 not /x"}')
    assert c.correct('한글 42 not /x', complete) == '한글 42 not /x'
    messages, kw = calls[0]
    assert len(calls) == 1
    assert 'original language(s)' in messages[0]['content']
    assert 'Never translate' in messages[0]['content']
    assert json.loads(messages[1]['content']) == {'transcript':'한글 42 not /x'}
    assert kw == {'task':'smart_dictation_correction','purpose':'smart-dictation.native','temperature':0,'max_tokens':4096,'timeout':20}

@pytest.mark.parametrize('response', ['', '{}', '{"transcript":""}', '{"transcript":"a", "extra":1}', '{"transcript":"a","transcript":"b"}', 'before {"transcript":"a"}', '{"transcript":', 'x'*65537])
def test_bad_response_preserves_all_raw(response):
    raw='원문 /tmp 42 not'
    assert c.correct(raw, lambda *a, **k: SimpleNamespace(text=response)) == c.WARNING + raw

def test_over_budget_and_exception_preserve_raw():
    def forbidden(*a, **k): raise AssertionError('must not call')
    raw='x'*4001
    assert c.correct(raw, forbidden) == c.WARNING+raw
    assert c.correct('raw', forbidden) == c.WARNING+'raw'

@pytest.mark.parametrize('value', [None, [], {'correction_enabled':1}, {'correction_enabled':True}, {'correction_enabled':True,'consent_version':'other'}])
def test_invalid_policy_refuses(value):
    with pytest.raises(ValueError): c.policy(value)

def test_unsafe_task_overrides_rejected():
    assert c.safe_task({'auxiliary':{'smart_dictation_correction':{'extra_body':{'reasoning':{'effort':'low'}}}}})
    for key in c.FORBIDDEN:
        assert not c.safe_task({'auxiliary':{'smart_dictation_correction':{'extra_body':{key:'x'}}}})
