"""Tests for the implementer workflow."""

import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_implementer_workflow():
    with (
        patch(
            "gateway.workflows.implementer.run_ai_agent", new_callable=AsyncMock
        ) as mock_ai,
        patch(
            "gateway.workflows.implementer.clone_repo", new_callable=AsyncMock
        ) as mock_clone,
        patch("gateway.workflows.implementer.create_branch", new_callable=AsyncMock),
        patch("gateway.workflows.implementer.push_branch", new_callable=AsyncMock),
        patch("gateway.workflows.implementer.post_issue_comment", new_callable=AsyncMock),
    ):
        mock_clone.return_value = "/tmp/repos/repo"
        mock_ai.return_value = "Changes applied."

        from gateway.workflows.implementer import implementer_workflow

        result = await implementer_workflow(
            repo="org/repo", issue_number=1, plan="Fix the bug"
        )

        assert result["branch"] == "fix/issue-1"
        assert result["result"] == "Changes applied."
