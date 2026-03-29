"""Implementer workflow — implements plan and creates PR."""

import logging

from pyworkflow import workflow

from gateway.workflows.steps.ai_agent import run_ai_agent
from gateway.workflows.steps.git_ops import clone_repo, create_branch, push_branch
from gateway.workflows.steps.github_api import post_issue_comment

logger = logging.getLogger(__name__)


@workflow(name="implementer")
async def implementer_workflow(repo: str, issue_number: int, plan: str) -> dict:
    """Implement a plan and push changes to a branch."""
    repo_url = f"https://github.com/{repo}.git"

    repo_dir = await clone_repo(repo_url=repo_url)

    branch_name = f"fix/issue-{issue_number}"
    await create_branch(repo_dir=repo_dir, branch_name=branch_name)

    prompt = f"Implement this plan:\n{plan}\n\nMake the necessary code changes."
    result = await run_ai_agent(prompt=prompt, repo_url=repo_url, working_dir=repo_dir)

    await push_branch(repo_dir=repo_dir, branch_name=branch_name)

    await post_issue_comment(
        repo=repo,
        issue_number=issue_number,
        body=f"## Implementation Complete\n\nBranch: `{branch_name}`\n\n{result}",
    )

    return {"repo": repo, "issue_number": issue_number, "branch": branch_name, "result": result}
