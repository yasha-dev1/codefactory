"""AI CLI subprocess executor."""

import asyncio
import logging

logger = logging.getLogger(__name__)


async def execute_ai_cli(
    cli_path: str,
    prompt: str,
    working_dir: str,
    timeout: int = 300,
) -> tuple[str, str, int]:
    """Execute an AI CLI command. Returns (stdout, stderr, returncode)."""
    try:
        proc = await asyncio.create_subprocess_exec(
            cli_path,
            "--print",
            "--prompt",
            prompt,
            cwd=working_dir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return stdout.decode(), stderr.decode(), proc.returncode or 0
    except asyncio.TimeoutError:
        logger.error("AI CLI timed out after %ds", timeout)
        proc.kill()
        return "", "Timeout", -1
    except FileNotFoundError:
        logger.error("AI CLI not found at %s", cli_path)
        return "", f"CLI not found: {cli_path}", -1
