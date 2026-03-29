"""Tests for worker registration API."""

from datetime import datetime, timedelta, timezone

import pytest

from gateway.workers import service
from gateway.workers.models import WorkerRegisterRequest

SECRET = "test-registration-secret"


@pytest.fixture(autouse=True)
def _clear_workers(monkeypatch):
    service.clear_workers()
    monkeypatch.setattr("gateway.config.settings.registration_secret", SECRET)
    yield
    service.clear_workers()


# --- Service tests ---


def test_register_worker():
    req = WorkerRegisterRequest(hostname="worker-1", capabilities=["claude"])
    worker, token = service.register_worker(req)
    assert worker.hostname == "worker-1"
    assert worker.status == "online"
    assert len(token) > 0


def test_list_workers():
    service.register_worker(WorkerRegisterRequest(hostname="w1"))
    service.register_worker(WorkerRegisterRequest(hostname="w2"))
    result = service.list_workers()
    assert result.count == 2


def test_heartbeat():
    req = WorkerRegisterRequest(hostname="w1")
    worker, _ = service.register_worker(req)
    updated = service.heartbeat(worker.id)
    assert updated is not None
    assert updated.status == "online"


def test_deregister():
    worker, _ = service.register_worker(WorkerRegisterRequest(hostname="w1"))
    assert service.deregister_worker(worker.id) is True
    assert service.list_workers().count == 0


def test_prune_stale():
    worker, _ = service.register_worker(WorkerRegisterRequest(hostname="w1"))
    # Manually set heartbeat to past
    service._workers[worker.id]["last_heartbeat_at"] = datetime.now(
        timezone.utc
    ) - timedelta(seconds=120)
    pruned = service.prune_stale_workers(timeout_seconds=60)
    assert pruned == 1
    assert service.get_worker(worker.id).status == "offline"


def test_get_worker_by_token():
    req = WorkerRegisterRequest(hostname="w1")
    _, token = service.register_worker(req)
    found = service.get_worker_by_token(token)
    assert found is not None
    assert found["hostname"] == "w1"


# --- API tests ---


@pytest.mark.asyncio
async def test_api_register(client):
    response = await client.post(
        "/api/v1/workers/register",
        json={"hostname": "api-worker", "capabilities": ["claude"]},
        headers={"X-Registration-Secret": SECRET},
    )
    assert response.status_code == 200
    data = response.json()
    assert "worker_id" in data
    assert "token" in data


@pytest.mark.asyncio
async def test_api_register_wrong_secret(client):
    response = await client.post(
        "/api/v1/workers/register",
        json={"hostname": "bad-worker"},
        headers={"X-Registration-Secret": "wrong"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_api_list(client):
    service.register_worker(WorkerRegisterRequest(hostname="w1"))
    response = await client.get("/api/v1/workers/")
    assert response.status_code == 200
    assert response.json()["count"] == 1


@pytest.mark.asyncio
async def test_api_heartbeat(client):
    worker, _ = service.register_worker(WorkerRegisterRequest(hostname="w1"))
    response = await client.post(f"/api/v1/workers/{worker.id}/heartbeat")
    assert response.status_code == 200
    assert response.json()["status"] == "online"


@pytest.mark.asyncio
async def test_api_deregister(client):
    worker, _ = service.register_worker(WorkerRegisterRequest(hostname="w1"))
    response = await client.delete(f"/api/v1/workers/{worker.id}")
    assert response.status_code == 204
