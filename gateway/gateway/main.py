"""Entry point for the CodeFactory Gateway."""

import uvicorn

from gateway.config import Settings
from gateway.server import create_app


def main() -> None:
    """Run the gateway server."""
    settings = Settings()
    app = create_app()
    uvicorn.run(app, host=settings.host, port=settings.port)


if __name__ == "__main__":
    main()
