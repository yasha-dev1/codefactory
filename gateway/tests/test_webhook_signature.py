"""Tests for GitHub webhook signature verification."""

import hashlib
import hmac

from gateway.webhooks.signature import verify_github_signature


def _make_signature(payload: bytes, secret: str) -> str:
    sig = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return f"sha256={sig}"


def test_valid_signature_passes():
    payload = b'{"action": "opened"}'
    secret = "test-secret"
    signature = _make_signature(payload, secret)
    assert verify_github_signature(payload, signature, secret) is True


def test_invalid_signature_fails():
    payload = b'{"action": "opened"}'
    secret = "test-secret"
    assert verify_github_signature(payload, "sha256=invalid", secret) is False


def test_missing_prefix_fails():
    payload = b'{"action": "opened"}'
    secret = "test-secret"
    sig = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    assert verify_github_signature(payload, sig, secret) is False


def test_wrong_secret_fails():
    payload = b'{"action": "opened"}'
    signature = _make_signature(payload, "correct-secret")
    assert verify_github_signature(payload, signature, "wrong-secret") is False
