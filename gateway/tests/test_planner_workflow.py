"""Tests for the planner workflow."""

import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_planner_workflow():
    with (
        patch("gateway.workflows.planner.run_ai_agent", new_callable=AsyncMock) as mock_ai,
        patch("gateway.workflows.planner.post_issue_comment", new_callable=AsyncMock),
        patch("gateway.workflows.planner.add_issue_label", new_callable=AsyncMock),
    ):
        mock_ai.return_value = "Step 1: Fix the bug\nStep 2: Add tests"

        from gateway.workflows.planner import planner_workflow

        result = await planner_workflow(
            repo="org/repo", issue_number=1, issue_title="Fix bug"
        )

        assert result["plan"] == "Step 1: Fix the bug\nStep 2: Add tests"
        assert result["issue_number"] == 1
