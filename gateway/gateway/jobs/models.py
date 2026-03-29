"""Pydantic schemas for job API responses."""

from datetime import datetime
from pydantic import BaseModel


class JobResponse(BaseModel):
    id: str
    workflow_type: str
    status: str
    repo: str
    issue_number: int | None = None
    pr_number: int | None = None
    started_at: datetime
    completed_at: datetime | None = None
    result: str | None = None
    error: str | None = None


class JobListResponse(BaseModel):
    items: list[JobResponse]
    count: int
