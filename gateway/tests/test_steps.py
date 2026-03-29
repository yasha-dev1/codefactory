"""Tests for workflow steps."""

import pytest

from gateway.workflows.steps.ai_agent import run_ai_agent
from gateway.workflows.steps.github_api import add_issue_label, post_issue_comment


@pytest.mark.asyncio
async def test_ai_agent_returns_mock():
    fn = run_ai_agent.__wrapped__ if hasattr(run_ai_agent, "__wrapped__") else run_ai_agent
    result = await fn(prompt="test", repo_url="https://github.com/org/repo.git")
    assert "[mock]" in result


@pytest.mark.asyncio
async def test_post_comment_returns_mock():
    fn = post_issue_comment.__wrapped__ if hasattr(post_issue_comment, "__wrapped__") else post_issue_comment
    result = await fn(repo="org/repo", issue_number=1, body="Hello")
    assert result["body"] == "Hello"
    assert result["issue_number"] == 1


@pytest.mark.asyncio
async def test_add_label_returns_mock():
    fn = add_issue_label.__wrapped__ if hasattr(add_issue_label, "__wrapped__") else add_issue_label
    result = await fn(repo="org/repo", issue_number=1, label="bug")
    assert result["label"] == "bug"
