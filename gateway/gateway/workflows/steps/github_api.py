"""GitHub API step — posts comments, adds labels."""

import logging

from pyworkflow import step

logger = logging.getLogger(__name__)


@step(max_retries=3, retry_delay="exponential")
async def post_issue_comment(
    repo: str, issue_number: int, body: str, token: str | None = None
) -> dict:
    """Post a comment on a GitHub issue. Mock for MVP."""
    logger.info("Posted comment on %s#%d: %s", repo, issue_number, body[:100])
    return {"id": 1, "body": body, "repo": repo, "issue_number": issue_number}


@step(max_retries=3, retry_delay="exponential")
async def add_issue_label(
    repo: str, issue_number: int, label: str, token: str | None = None
) -> dict:
    """Add a label to a GitHub issue. Mock for MVP."""
    logger.info("Added label '%s' to %s#%d", label, repo, issue_number)
    return {"label": label, "repo": repo, "issue_number": issue_number}
