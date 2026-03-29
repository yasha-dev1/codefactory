"""AI agent step — spawns Claude/Kiro/Codex CLI as subprocess."""

import logging

from pyworkflow import step

logger = logging.getLogger(__name__)


@step(max_retries=2, retry_delay="exponential")
async def run_ai_agent(prompt: str, repo_url: str, working_dir: str | None = None) -> str:
    """Run an AI CLI agent with the given prompt.

    For MVP, returns a mock response.
    In production, will spawn claude/kiro/codex as subprocess.
    """
    logger.info("AI agent step called with prompt=%s, repo=%s", prompt[:100], repo_url)
    return f"[mock] Triage result for {repo_url}: Issue analyzed successfully."
