"""Pydantic schemas for worker API."""

from datetime import datetime

from pydantic import BaseModel


class WorkerRegisterRequest(BaseModel):
    hostname: str
    capabilities: list[str] = []
    labels: dict[str, str] = {}


class WorkerRegisterResponse(BaseModel):
    worker_id: str
    token: str


class WorkerResponse(BaseModel):
    id: str
    hostname: str
    status: str
    capabilities: list[str]
    labels: dict[str, str]
    last_heartbeat_at: datetime
    registered_at: datetime
    current_run_id: str | None = None


class WorkerListResponse(BaseModel):
    items: list[WorkerResponse]
    count: int
