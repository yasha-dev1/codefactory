"""Worker agent entry point."""

import asyncio
import logging
import platform

import httpx

from worker_agent.config import config
from worker_agent.heartbeat import heartbeat_loop

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)


async def register(
    gateway_url: str, secret: str, hostname: str, capabilities: list[str]
) -> tuple[str, str]:
    """Register with the gateway. Returns (worker_id, token)."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{gateway_url}/api/v1/workers/register",
            json={"hostname": hostname, "capabilities": capabilities},
            headers={"X-Registration-Secret": secret},
        )
        response.raise_for_status()
        data = response.json()
        return data["worker_id"], data["token"]


async def run() -> None:
    hostname = config.hostname or platform.node()
    capabilities = [c.strip() for c in config.capabilities.split(",")]

    logger.info("Registering worker '%s' with gateway at %s", hostname, config.gateway_url)
    worker_id, token = await register(
        config.gateway_url, config.registration_secret, hostname, capabilities
    )
    logger.info("Registered as worker %s", worker_id)

    heartbeat_task = asyncio.create_task(
        heartbeat_loop(config.gateway_url, worker_id, token, config.heartbeat_interval)
    )

    logger.info("Worker agent running. Press Ctrl+C to stop.")
    try:
        await heartbeat_task
    except asyncio.CancelledError:
        logger.info("Worker agent shutting down")


def main() -> None:
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        logger.info("Worker agent stopped")


if __name__ == "__main__":
    main()
