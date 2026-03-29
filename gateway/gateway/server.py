"""FastAPI application factory."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from gateway.config import settings
from gateway.webhooks.github import router as webhook_router


def _initialize_pyworkflow() -> None:
    """Initialize pyworkflow with celery runtime defaults."""
    import pyworkflow

    pyworkflow.configure(default_runtime="celery", default_durable=False)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler."""
    _initialize_pyworkflow()
    yield


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="CodeFactory Gateway API",
        description="Webhook-driven workflow orchestration for AI coding agents",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # Configure CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include routers
    app.include_router(webhook_router)
    # TODO: app.include_router(worker_router)
    # TODO: app.include_router(job_router)

    @app.get("/api/v1/health")
    async def health() -> dict[str, str]:
        return {"status": "healthy"}

    return app


app = create_app()
