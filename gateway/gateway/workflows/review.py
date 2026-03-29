"""Review workflow — reviews PR code changes."""

import logging

from pyworkflow import workflow

from gateway.workflows.steps.ai_agent import run_ai_agent
from gateway.workflows.steps.github_api import post_issue_comment

logger = logging.getLogger(__name__)


@workflow(name="review")
async def review_workflow(
    repo: str,
    pr_number: int,
    pr_title: str,
    pr_body: str | None = None,
) -> dict:
    """Review a pull request using AI analysis."""
    prompt = (
        f"Review this pull request:\nTitle: {pr_title}\n"
        f"Body: {pr_body or 'No description'}\n\n"
        "Provide feedback on code quality, bugs, and improvements."
    )

    review = await run_ai_agent(prompt=prompt, repo_url=f"https://github.com/{repo}.git")

    await post_issue_comment(
        repo=repo, issue_number=pr_number, body=f"## Code Review\n\n{review}"
    )

    return {"repo": repo, "pr_number": pr_number, "review": review}
