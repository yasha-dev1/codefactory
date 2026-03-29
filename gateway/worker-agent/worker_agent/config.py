"""Worker agent configuration."""

from pydantic_settings import BaseSettings


class WorkerConfig(BaseSettings):
    gateway_url: str = "http://localhost:8686"
    registration_secret: str = ""
    hostname: str = ""
    capabilities: str = "claude"
    ai_cli: str = "claude"
    heartbeat_interval: int = 30

    class Config:
        env_prefix = "WORKER_"


config = WorkerConfig()
