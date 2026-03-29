"""Tests for the job management API."""

import pytest

from gateway.jobs import service


@pytest.fixture(autouse=True)
def _clear_jobs():
    service.clear_jobs()
    yield
    service.clear_jobs()


def test_create_job():
    job = service.create_job("triage", "org/repo", issue_number=1)
    assert job.workflow_type == "triage"
    assert job.status == "pending"
    assert job.repo == "org/repo"


def test_get_job():
    job = service.create_job("triage", "org/repo")
    found = service.get_job(job.id)
    assert found is not None
    assert found.id == job.id


def test_list_jobs_empty():
    result = service.list_jobs()
    assert result.count == 0
    assert result.items == []


def test_list_jobs_with_status_filter():
    service.create_job("triage", "org/repo")
    j2 = service.create_job("review", "org/repo")
    service.update_job_status(j2.id, "running")
    result = service.list_jobs(status="running")
    assert result.count == 1
    assert result.items[0].status == "running"


def test_cancel_job():
    job = service.create_job("triage", "org/repo")
    cancelled = service.cancel_job(job.id)
    assert cancelled is not None
    assert cancelled.status == "cancelled"
    assert cancelled.completed_at is not None


def test_get_nonexistent_job():
    assert service.get_job("nonexistent") is None


@pytest.mark.asyncio
async def test_jobs_api_list_empty(client):
    response = await client.get("/api/v1/jobs/")
    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 0


@pytest.mark.asyncio
async def test_jobs_api_get_404(client):
    response = await client.get("/api/v1/jobs/nonexistent")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_jobs_api_cancel(client):
    job = service.create_job("triage", "org/repo")
    response = await client.post(f"/api/v1/jobs/{job.id}/cancel")
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
