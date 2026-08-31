import logging
import os
from app.core.logging_config import SensitiveDataFilter

def test_sensitive_data_filter_redacts_fake_nvidia_key():
    filt = SensitiveDataFilter()
    fake_nv_key = "nvapi-FAKEKEY1234567890abcdef123456"
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="test.py",
        lineno=1,
        msg=f"Calling NVIDIA with key {fake_nv_key}",
        args=(),
        exc_info=None,
    )
    filt.filter(record)
    assert fake_nv_key not in record.msg
    assert "[REDACTED_NVIDIA_KEY]" in record.msg

def test_sensitive_data_filter_redacts_fake_openrouter_key():
    filt = SensitiveDataFilter()
    fake_or_key = "sk-or-v1-FAKEKEY1234567890abcdef123456"
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="test.py",
        lineno=1,
        msg=f"OpenRouter token: {fake_or_key}",
        args=(),
        exc_info=None,
    )
    filt.filter(record)
    assert fake_or_key not in record.msg
    assert "[REDACTED_OPENROUTER_KEY]" in record.msg

def test_sensitive_data_filter_redacts_fake_openai_keys():
    filt = SensitiveDataFilter()
    fake_proj_key = "sk-proj-FAKEKEY1234567890abcdef123456"
    fake_std_key = "sk-FAKESTANDARDKEY1234567890abcdef"

    record1 = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="test.py",
        lineno=1,
        msg=f"OpenAI project key: {fake_proj_key}",
        args=(),
        exc_info=None,
    )
    filt.filter(record1)
    assert fake_proj_key not in record1.msg
    assert "[REDACTED_OPENAI_KEY]" in record1.msg

    record2 = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="test.py",
        lineno=1,
        msg=f"OpenAI standard key: {fake_std_key}",
        args=(),
        exc_info=None,
    )
    filt.filter(record2)
    assert fake_std_key not in record2.msg
    assert "[REDACTED_OPENAI_KEY]" in record2.msg

def test_sensitive_data_filter_redacts_fake_google_key():
    filt = SensitiveDataFilter()
    fake_google_key = "AIzaSyD-FAKEKEY123456789012345678901"
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="test.py",
        lineno=1,
        msg=f"Google API Key: {fake_google_key}",
        args=(),
        exc_info=None,
    )
    filt.filter(record)
    assert fake_google_key not in record.msg
    assert "[REDACTED_API_KEY]" in record.msg

def test_sensitive_data_filter_redacts_args_tuple_and_dict():
    filt = SensitiveDataFilter()
    fake_key = "nvapi-FAKEARGKEY1234567890123456"

    # Test tuple args
    record_tuple = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="test.py",
        lineno=1,
        msg="Request payload: %s",
        args=(fake_key,),
        exc_info=None,
    )
    filt.filter(record_tuple)
    assert fake_key not in record_tuple.args[0]
    assert "[REDACTED_NVIDIA_KEY]" in record_tuple.args[0]

    # Test dict args inside tuple
    record_dict = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="test.py",
        lineno=1,
        msg="Request payload: %(key)s",
        args=({"key": fake_key},),
        exc_info=None,
    )
    filt.filter(record_dict)
    assert fake_key not in record_dict.args["key"]
    assert "[REDACTED_NVIDIA_KEY]" in record_dict.args["key"]
