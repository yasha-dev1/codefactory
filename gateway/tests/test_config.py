import os
from unittest.mock import patch


def test_default_settings():
    with patch.dict(os.environ, {}, clear=True):
        from gateway.config import Settings

        s = Settings()
        assert s.host == "0.0.0.0"
        assert s.port == 8686
        assert s.debug is False
        assert "http://localhost:5173" in s.cors_origins


def test_env_override():
    with patch.dict(os.environ, {"GATEWAY_PORT": "9090", "GATEWAY_DEBUG": "true"}):
        from gateway.config import Settings

        s = Settings()
        assert s.port == 9090
        assert s.debug is True
