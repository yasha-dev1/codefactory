"""Tests for the git operations steps."""

import pytest

from gateway.workflows.steps.git_ops import clone_repo, create_branch, push_branch


@pytest.mark.asyncio
async def test_clone_repo():
    fn = clone_repo.__wrapped__ if hasattr(clone_repo, "__wrapped__") else clone_repo
    result = await fn(repo_url="https://github.com/org/repo.git")
    assert "repo" in result


@pytest.mark.asyncio
async def test_create_branch():
    fn = create_branch.__wrapped__ if hasattr(create_branch, "__wrapped__") else create_branch
    result = await fn(repo_dir="/tmp/repo", branch_name="fix/test")
    assert result == "fix/test"


@pytest.mark.asyncio
async def test_push_branch():
    fn = push_branch.__wrapped__ if hasattr(push_branch, "__wrapped__") else push_branch
    result = await fn(repo_dir="/tmp/repo", branch_name="fix/test")
    assert result is True
