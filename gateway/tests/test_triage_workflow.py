"""Tests for the triage workflow."""

import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_triage_workflow_returns_result():
    with (
        patch("gateway.workflows.triage.run_ai_agent", new_callable=AsyncMock) as mock_ai,
        patch("gateway.workflows.triage.post_issue_comment", new_callable=AsyncMock) as mock_comment,
        patch("gateway.workflows.triage.add_issue_label", new_callable=AsyncMock) as mock_label,
    ):
        mock_ai.return_value = "This is a bug report."
        mock_comment.return_value = {"id": 1}
        mock_label.return_value = {"label": "agent:plan"}

        from gateway.workflows.triage import triage_workflow

        result = await triage_workflow(
            repo="org/repo",
            issue_number=42,
            issue_title="Bug report",
            issue_body="Something broke",
        )

        assert result["repo"] == "org/repo"
        assert result["issue_number"] == 42
        assert result["analysis"] == "This is a bug report."
        mock_ai.assert_called_once()
        mock_comment.assert_called_once()
        mock_label.assert_called_once()


@pytest.mark.asyncio
async def test_triage_workflow_with_no_body():
    with (
        patch("gateway.workflows.triage.run_ai_agent", new_callable=AsyncMock) as mock_ai,
        patch("gateway.workflows.triage.post_issue_comment", new_callable=AsyncMock),
        patch("gateway.workflows.triage.add_issue_label", new_callable=AsyncMock),
    ):
        mock_ai.return_value = "Analyzed."

        from gateway.workflows.triage import triage_workflow

        result = await triage_workflow(
            repo="org/repo",
            issue_number=1,
            issue_title="Question",
        )

        assert result["analysis"] == "Analyzed."
