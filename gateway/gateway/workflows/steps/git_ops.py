"""Git operations step — clone, branch, push."""

import logging

from pyworkflow import step

logger = logging.getLogger(__name__)


@step(max_retries=2, retry_delay="exponential")
async def clone_repo(repo_url: str, branch: str = "main", working_dir: str | None = None) -> str:
    """Clone a repository. Mock for MVP."""
    logger.info("Cloning %s (branch: %s)", repo_url, branch)
    return f"/tmp/repos/{repo_url.split('/')[-1].replace('.git', '')}"


@step(max_retries=2, retry_delay="exponential")
async def create_branch(repo_dir: str, branch_name: str) -> str:
    """Create a new branch. Mock for MVP."""
    logger.info("Creating branch %s in %s", branch_name, repo_dir)
    return branch_name


@step(max_retries=2, retry_delay="exponential")
async def push_branch(repo_dir: str, branch_name: str, token: str | None = None) -> bool:
    """Push a branch to remote. Mock for MVP."""
    logger.info("Pushing branch %s from %s", branch_name, repo_dir)
    return True
