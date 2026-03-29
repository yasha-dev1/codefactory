"""GitHub webhook receiver endpoint."""

import asyncio
import json
import logging

from fastapi import APIRouter, Header, HTTPException, Request

from gateway.config import settings
from gateway.jobs.service import create_job, update_job_status
from gateway.webhooks.signature import verify_github_signature

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


async def _run_workflow(job_id: str, workflow_fn, **kwargs) -> None:
    """Run a workflow as a background task, updating job status."""
    try:
        update_job_status(job_id, "running")
        result = await workflow_fn(**kwargs)
        update_job_status(job_id, "completed", result=str(result))
    except Exception as e:
        logger.exception("Workflow failed: %s", e)
        update_job_status(job_id, "failed", error=str(e))


@router.post("/github")
async def github_webhook(
    request: Request,
    x_github_event: str = Header(...),
    x_hub_signature_256: str = Header(...),
):
    payload = await request.body()

    if not verify_github_signature(payload, x_hub_signature_256, settings.github_webhook_secret):
        raise HTTPException(status_code=403, detail="Invalid signature")

    body = json.loads(payload)

    event_type = x_github_event
    action = body.get("action", "")
    repo = body.get("repository", {}).get("full_name", "unknown")
    job_id = None

    if event_type == "issues":
        issue = body.get("issue", {})
        label_name = (body.get("label") or {}).get("name", "")

        if action == "opened":
            from gateway.workflows.triage import triage_workflow

            job = create_job("triage", repo, issue_number=issue.get("number"))
            job_id = job.id
            asyncio.create_task(
                _run_workflow(
                    job_id,
                    triage_workflow,
                    repo=repo,
                    issue_number=issue["number"],
                    issue_title=issue["title"],
                    issue_body=issue.get("body"),
                )
            )
        elif action == "labeled" and label_name == "agent:plan":
            from gateway.workflows.planner import planner_workflow

            job = create_job("planner", repo, issue_number=issue.get("number"))
            job_id = job.id
            asyncio.create_task(
                _run_workflow(
                    job_id,
                    planner_workflow,
                    repo=repo,
                    issue_number=issue["number"],
                    issue_title=issue["title"],
                    issue_body=issue.get("body"),
                )
            )
        elif action == "labeled" and label_name == "agent:implement":
            from gateway.workflows.implementer import implementer_workflow

            job = create_job("implementer", repo, issue_number=issue.get("number"))
            job_id = job.id
            asyncio.create_task(
                _run_workflow(
                    job_id,
                    implementer_workflow,
                    repo=repo,
                    issue_number=issue["number"],
                    plan=issue.get("body", ""),
                )
            )

    elif event_type == "pull_request":
        pr = body.get("pull_request", {})
        if action in ("opened", "synchronize"):
            from gateway.workflows.review import review_workflow

            job = create_job("review", repo, pr_number=pr.get("number"))
            job_id = job.id
            asyncio.create_task(
                _run_workflow(
                    job_id,
                    review_workflow,
                    repo=repo,
                    pr_number=pr["number"],
                    pr_title=pr["title"],
                    pr_body=pr.get("body"),
                )
            )

    return {
        "received": True,
        "event_type": event_type,
        "action": action,
        "repo": repo,
        "job_id": job_id,
    }
