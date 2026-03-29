"""Planner workflow — generates implementation plan."""

import logging

from pyworkflow import workflow

from gateway.workflows.steps.ai_agent import run_ai_agent
from gateway.workflows.steps.github_api import add_issue_label, post_issue_comment

logger = logging.getLogger(__name__)


@workflow(name="planner")
async def planner_workflow(
    repo: str,
    issue_number: int,
    issue_title: str,
    issue_body: str | None = None,
) -> dict:
    """Generate an implementation plan for a GitHub issue."""
    prompt = (
        f"Create an implementation plan for this issue:\nTitle: {issue_title}\n"
        f"Body: {issue_body or 'No description'}\n\n"
        "Provide a step-by-step plan with files to modify."
    )

    plan = await run_ai_agent(prompt=prompt, repo_url=f"https://github.com/{repo}.git")

    await post_issue_comment(
        repo=repo, issue_number=issue_number, body=f"## Implementation Plan\n\n{plan}"
    )

    await add_issue_label(repo=repo, issue_number=issue_number, label="agent:implement")

    return {"repo": repo, "issue_number": issue_number, "plan": plan}
