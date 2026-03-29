"""Tests for AI CLI executor."""

import pytest
from worker_agent.executor import execute_ai_cli


@pytest.mark.asyncio
async def test_cli_not_found():
    stdout, stderr, code = await execute_ai_cli("/nonexistent/cli", "test", "/tmp")
    assert code == -1
    assert "not found" in stderr.lower()


@pytest.mark.asyncio
async def test_execute_with_echo():
    """Test subprocess execution with echo as stand-in."""
    stdout, stderr, code = await execute_ai_cli("echo", "hello", "/tmp")
    assert isinstance(stdout, str)
    assert isinstance(code, int)
