"""Tests for worker agent config."""

import os
from unittest.mock import patch


def test_default_config():
    with patch.dict(os.environ, {}, clear=True):
        from worker_agent.config import WorkerConfig
        c = WorkerConfig()
        assert c.gateway_url == "http://localhost:8585"
        assert c.heartbeat_interval == 30
        assert c.ai_cli == "claude"


def test_env_override():
    with patch.dict(os.environ, {"WORKER_GATEWAY_URL": "http://gw:9000", "WORKER_HEARTBEAT_INTERVAL": "10"}):
        from worker_agent.config import WorkerConfig
        c = WorkerConfig()
        assert c.gateway_url == "http://gw:9000"
        assert c.heartbeat_interval == 10
