"""Tests for the webhook endpoint."""

import hashlib
import hmac
import json

import pytest


def _sign(payload: bytes, secret: str) -> str:
    sig = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return f"sha256={sig}"


SAMPLE_ISSUE_PAYLOAD = {
    "action": "opened",
    "issue": {
        "number": 1,
        "title": "Test issue",
        "user": {"login": "testuser"},
        "state": "open",
    },
    "repository": {
        "full_name": "org/repo",
        "clone_url": "https://github.com/org/repo.git",
    },
}

SECRET = "test-webhook-secret"


@pytest.fixture(autouse=True)
def _set_webhook_secret(monkeypatch):
    monkeypatch.setattr("gateway.config.settings.github_webhook_secret", SECRET)


@pytest.mark.asyncio
async def test_valid_webhook_returns_200(client):
    payload = json.dumps(SAMPLE_ISSUE_PAYLOAD).encode()
    response = await client.post(
        "/webhooks/github",
        content=payload,
        headers={
            "X-GitHub-Event": "issues",
            "X-Hub-Signature-256": _sign(payload, SECRET),
            "Content-Type": "application/json",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["received"] is True
    assert data["event_type"] == "issues"
    assert data["action"] == "opened"
    assert data["repo"] == "org/repo"


@pytest.mark.asyncio
async def test_invalid_signature_returns_403(client):
    payload = json.dumps(SAMPLE_ISSUE_PAYLOAD).encode()
    response = await client.post(
        "/webhooks/github",
        content=payload,
        headers={
            "X-GitHub-Event": "issues",
            "X-Hub-Signature-256": "sha256=invalid",
            "Content-Type": "application/json",
        },
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_missing_signature_header_returns_422(client):
    payload = json.dumps(SAMPLE_ISSUE_PAYLOAD).encode()
    response = await client.post(
        "/webhooks/github",
        content=payload,
        headers={
            "X-GitHub-Event": "issues",
            "Content-Type": "application/json",
        },
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_pull_request_event(client):
    pr_payload = {
        "action": "opened",
        "pull_request": {
            "number": 5,
            "title": "Fix bug",
            "user": {"login": "dev"},
            "head": {"ref": "fix"},
            "base": {"ref": "main"},
            "state": "open",
        },
        "repository": {
            "full_name": "org/repo",
            "clone_url": "https://github.com/org/repo.git",
        },
    }
    payload = json.dumps(pr_payload).encode()
    response = await client.post(
        "/webhooks/github",
        content=payload,
        headers={
            "X-GitHub-Event": "pull_request",
            "X-Hub-Signature-256": _sign(payload, SECRET),
            "Content-Type": "application/json",
        },
    )
    assert response.status_code == 200
    assert response.json()["event_type"] == "pull_request"
