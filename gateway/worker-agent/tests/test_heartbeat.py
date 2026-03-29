"""Tests for heartbeat module."""

import asyncio

import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_heartbeat_loop_sends_request():
    mock_response = AsyncMock()
    mock_response.status_code = 200

    mock_client_instance = AsyncMock()
    mock_client_instance.post = AsyncMock(return_value=mock_response)
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with patch("worker_agent.heartbeat.httpx.AsyncClient", return_value=mock_client_instance):
        with patch("worker_agent.heartbeat.asyncio.sleep", side_effect=asyncio.CancelledError):
            with pytest.raises(asyncio.CancelledError):
                from worker_agent.heartbeat import heartbeat_loop
                await heartbeat_loop("http://gw:8585", "wid", "tok", interval=30)

    mock_client_instance.post.assert_called_once()
