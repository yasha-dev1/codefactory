"""Periodic heartbeat sender."""

import asyncio
import logging

import httpx

logger = logging.getLogger(__name__)


async def heartbeat_loop(
    gateway_url: str, worker_id: str, token: str, interval: int = 30
) -> None:
    """Send periodic heartbeats to the gateway."""
    async with httpx.AsyncClient() as client:
        while True:
            try:
                response = await client.post(
                    f"{gateway_url}/api/v1/workers/{worker_id}/heartbeat",
                    headers={"Authorization": f"Bearer {token}"},
                )
                if response.status_code == 200:
                    logger.debug("Heartbeat sent successfully")
                else:
                    logger.warning("Heartbeat failed: %d", response.status_code)
            except Exception:
                logger.exception("Heartbeat error")
            await asyncio.sleep(interval)
