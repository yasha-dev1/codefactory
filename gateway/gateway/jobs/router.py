"""Job management API endpoints."""

from fastapi import APIRouter, HTTPException, Query

from gateway.jobs import service
from gateway.jobs.models import JobListResponse, JobResponse

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])


@router.get("/", response_model=JobListResponse)
async def list_jobs(
    status: str | None = Query(None),
    repo: str | None = Query(None),
):
    return service.list_jobs(status=status, repo=repo)


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: str):
    job = service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/{job_id}/cancel", response_model=JobResponse)
async def cancel_job(job_id: str):
    job = service.cancel_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
