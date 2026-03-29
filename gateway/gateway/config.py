"""Gateway configuration using pydantic-settings."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Gateway settings loaded from environment variables."""

    # Server configuration
    host: str = "0.0.0.0"
    port: int = 8585
    debug: bool = False

    # CORS configuration
    cors_origins: list[str] = ["http://localhost:5173"]

    # Secrets
    github_webhook_secret: str = ""
    registration_secret: str = ""

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/gateway"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    class Config:
        env_prefix = "GATEWAY_"
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
