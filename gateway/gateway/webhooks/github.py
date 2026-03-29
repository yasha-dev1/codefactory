"""GitHub webhook receiver endpoint."""

import json

from fastapi import APIRouter, Header, HTTPException, Request

from gateway.config import settings
from gateway.webhooks.signature import verify_github_signature

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


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

    # TODO: Store in DB (requires async session, will be added with Alembic)
    # TODO: Dispatch to pyworkflow based on event type

    return {
        "received": True,
        "event_type": event_type,
        "action": action,
        "repo": repo,
    }
