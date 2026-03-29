"""Worker management service — in-memory store for MVP."""

import uuid
from datetime import datetime, timedelta, timezone

from gateway.workers.auth import generate_token, hash_token
from gateway.workers.models import (
    WorkerListResponse,
    WorkerRegisterRequest,
    WorkerResponse,
)

_workers: dict[str, dict] = {}


def register_worker(request: WorkerRegisterRequest) -> tuple[WorkerResponse, str]:
    worker_id = str(uuid.uuid4())
    token, token_hash = generate_token()
    now = datetime.now(timezone.utc)
    worker = {
        "id": worker_id,
        "hostname": request.hostname,
        "api_token_hash": token_hash,
        "capabilities": request.capabilities,
        "labels": request.labels,
        "status": "online",
        "last_heartbeat_at": now,
        "registered_at": now,
        "current_run_id": None,
    }
    _workers[worker_id] = worker
    return _to_response(worker), token


def get_worker(worker_id: str) -> WorkerResponse | None:
    worker = _workers.get(worker_id)
    return _to_response(worker) if worker else None


def get_worker_by_token(token: str) -> dict | None:
    th = hash_token(token)
    for w in _workers.values():
        if w["api_token_hash"] == th:
            return w
    return None


def list_workers() -> WorkerListResponse:
    items = [_to_response(w) for w in _workers.values()]
    return WorkerListResponse(items=items, count=len(items))


def heartbeat(worker_id: str) -> WorkerResponse | None:
    worker = _workers.get(worker_id)
    if not worker:
        return None
    worker["last_heartbeat_at"] = datetime.now(timezone.utc)
    worker["status"] = "online"
    return _to_response(worker)


def deregister_worker(worker_id: str) -> bool:
    return _workers.pop(worker_id, None) is not None


def prune_stale_workers(timeout_seconds: int = 60) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=timeout_seconds)
    count = 0
    for w in _workers.values():
        if w["status"] != "offline" and w["last_heartbeat_at"] < cutoff:
            w["status"] = "offline"
            count += 1
    return count


def clear_workers() -> None:
    _workers.clear()


def _to_response(worker: dict) -> WorkerResponse:
    return WorkerResponse(
        id=worker["id"],
        hostname=worker["hostname"],
        status=worker["status"],
        capabilities=worker["capabilities"],
        labels=worker["labels"],
        last_heartbeat_at=worker["last_heartbeat_at"],
        registered_at=worker["registered_at"],
        current_run_id=worker["current_run_id"],
    )
