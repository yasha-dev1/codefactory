"""Job management service — in-memory store for MVP."""

import uuid
from datetime import datetime, timezone

from gateway.jobs.models import JobListResponse, JobResponse

_jobs: dict[str, dict] = {}


def create_job(
    workflow_type: str,
    repo: str,
    issue_number: int | None = None,
    pr_number: int | None = None,
) -> JobResponse:
    job_id = str(uuid.uuid4())
    job = {
        "id": job_id,
        "workflow_type": workflow_type,
        "status": "pending",
        "repo": repo,
        "issue_number": issue_number,
        "pr_number": pr_number,
        "started_at": datetime.now(timezone.utc),
        "completed_at": None,
        "result": None,
        "error": None,
    }
    _jobs[job_id] = job
    return JobResponse(**job)


def get_job(job_id: str) -> JobResponse | None:
    job = _jobs.get(job_id)
    return JobResponse(**job) if job else None


def list_jobs(
    status: str | None = None, repo: str | None = None
) -> JobListResponse:
    items = list(_jobs.values())
    if status:
        items = [j for j in items if j["status"] == status]
    if repo:
        items = [j for j in items if j["repo"] == repo]
    return JobListResponse(
        items=[JobResponse(**j) for j in items], count=len(items)
    )


def update_job_status(
    job_id: str,
    status: str,
    result: str | None = None,
    error: str | None = None,
) -> JobResponse | None:
    job = _jobs.get(job_id)
    if not job:
        return None
    job["status"] = status
    if status in ("completed", "failed", "cancelled"):
        job["completed_at"] = datetime.now(timezone.utc)
    if result is not None:
        job["result"] = result
    if error is not None:
        job["error"] = error
    return JobResponse(**job)


def cancel_job(job_id: str) -> JobResponse | None:
    return update_job_status(job_id, "cancelled")


def clear_jobs() -> None:
    """Clear all jobs (for testing)."""
    _jobs.clear()
