"""Tests for the review workflow."""

import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_review_workflow():
    with (
        patch("gateway.workflows.review.run_ai_agent", new_callable=AsyncMock) as mock_ai,
        patch("gateway.workflows.review.post_issue_comment", new_callable=AsyncMock),
    ):
        mock_ai.return_value = "LGTM, minor nits."

        from gateway.workflows.review import review_workflow

        result = await review_workflow(repo="org/repo", pr_number=5, pr_title="Fix bug")

        assert result["review"] == "LGTM, minor nits."
        assert result["pr_number"] == 5
