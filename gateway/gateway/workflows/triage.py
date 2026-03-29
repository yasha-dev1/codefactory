"""Triage workflow — analyzes issues and routes them."""

import logging

from pyworkflow import workflow

from gateway.workflows.steps.ai_agent import run_ai_agent
from gateway.workflows.steps.github_api import add_issue_label, post_issue_comment

logger = logging.getLogger(__name__)


@workflow(name="triage")
async def triage_workflow(
    repo: str,
    issue_number: int,
    issue_title: str,
    issue_body: str | None = None,
) -> dict:
    """Triage a GitHub issue using AI analysis."""
    prompt = (
        f"Triage this GitHub issue:\nTitle: {issue_title}\n"
        f"Body: {issue_body or 'No description'}\n\n"
        "Classify as: bug, feature, question, or invalid."
    )

    analysis = await run_ai_agent(prompt=prompt, repo_url=f"https://github.com/{repo}.git")

    await post_issue_comment(repo=repo, issue_number=issue_number, body=f"## Triage Result\n\n{analysis}")

    await add_issue_label(repo=repo, issue_number=issue_number, label="agent:plan")

    return {
        "repo": repo,
        "issue_number": issue_number,
        "analysis": analysis,
        "label": "agent:plan",
    }
