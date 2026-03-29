from unittest.mock import patch

from fastapi import FastAPI


def test_create_app_returns_fastapi():
    with patch("gateway.server._initialize_pyworkflow"):
        from gateway.server import create_app

        app = create_app()
        assert isinstance(app, FastAPI)


def test_app_has_health_route():
    with patch("gateway.server._initialize_pyworkflow"):
        from gateway.server import create_app

        app = create_app()
        routes = [r.path for r in app.routes]
        assert "/api/v1/health" in routes
