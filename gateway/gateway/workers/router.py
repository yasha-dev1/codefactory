"""Worker management API endpoints."""

from fastapi import APIRouter, Depends, HTTPException

from gateway.workers import service
from gateway.workers.auth import verify_registration_secret
from gateway.workers.models import (
    WorkerListResponse,
    WorkerRegisterRequest,
    WorkerRegisterResponse,
    WorkerResponse,
)

router = APIRouter(prefix="/api/v1/workers", tags=["workers"])


@router.post("/register", response_model=WorkerRegisterResponse)
async def register_worker(
    request: WorkerRegisterRequest,
    _secret: str = Depends(verify_registration_secret),
):
    worker, token = service.register_worker(request)
    return WorkerRegisterResponse(worker_id=worker.id, token=token)


@router.get("/", response_model=WorkerListResponse)
async def list_workers():
    return service.list_workers()


@router.post("/{worker_id}/heartbeat", response_model=WorkerResponse)
async def heartbeat(worker_id: str):
    worker = service.heartbeat(worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    return worker


@router.delete("/{worker_id}", status_code=204)
async def deregister_worker(worker_id: str):
    if not service.deregister_worker(worker_id):
        raise HTTPException(status_code=404, detail="Worker not found")
