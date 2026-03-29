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


async def _run_triage(job_id: str, repo: str, issue: dict) -> None:
    """Run triage workflow as background task."""
    from gateway.workflows.triage import triage_workflow

    try:
        update_job_status(job_id, "running")
        result = await triage_workflow(
            repo=repo,
            issue_number=issue["number"],
            issue_title=issue["title"],
            issue_body=issue.get("body"),
        )
        update_job_status(job_id, "completed", result=str(result))
    except Exception as e:
        logger.exception("Triage workflow failed for %s#%d", repo, issue["number"])
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

    # Dispatch triage for issue events
    if event_type == "issues" and action in ("opened", "labeled"):
        issue = body.get("issue", {})
        job = create_job("triage", repo, issue_number=issue.get("number"))
        job_id = job.id
        asyncio.create_task(_run_triage(job_id, repo, issue))

    return {
        "received": True,
        "event_type": event_type,
        "action": action,
        "repo": repo,
        "job_id": job_id,
    }
