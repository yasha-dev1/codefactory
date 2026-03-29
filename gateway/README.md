# CodeFactory Gateway

Self-hosted backend for CodeFactory that receives GitHub webhooks, orchestrates CI/CD agent jobs via PyWorkflow on self-hosted workers, and provides a dashboard for monitoring. Replaces GitHub-hosted Actions runners to avoid billing limits.

## Architecture

```
GitHub Repo ──webhook──> Gateway API (FastAPI)
                              |
                              v
                     PyWorkflow start() [transient]
                              |
                              v
                     Celery Broker (Redis)
                              |
                              v
                     Worker Agent (self-hosted)
                     |-- Celery step worker
                     |-- Claude Code CLI
                     +-- Heartbeat -> Gateway API

Dashboard (React) <-- Gateway API <-- Postgres (workers, webhooks, jobs)
```

## Quickstart

```bash
cd gateway
cp .env.example .env
# Edit .env with your GitHub webhook secret
docker compose up
```

## Services

| Service     | Port | Description          |
| ----------- | ---- | -------------------- |
| gateway-api | 8585 | FastAPI backend      |
| postgres    | 5432 | Gateway database     |
| redis       | 6379 | Celery broker        |
| step-worker | --   | Celery step executor |
| dashboard   | 5173 | React frontend (dev) |

## Environment Variables

| Variable                        | Default                                                         | Description                                      |
| ------------------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| `GATEWAY_HOST`                  | `0.0.0.0`                                                       | API listen address                               |
| `GATEWAY_PORT`                  | `8585`                                                          | API listen port                                  |
| `GATEWAY_DEBUG`                 | `false`                                                         | Enable debug mode                                |
| `GATEWAY_CORS_ORIGINS`          | `["http://localhost:5173"]`                                     | Allowed CORS origins                             |
| `GATEWAY_GITHUB_WEBHOOK_SECRET` | --                                                              | GitHub webhook secret for signature verification |
| `GATEWAY_REGISTRATION_SECRET`   | --                                                              | Secret for worker registration                   |
| `GATEWAY_DATABASE_URL`          | `postgresql+asyncpg://postgres:postgres@localhost:5432/gateway` | Postgres connection string                       |
| `GATEWAY_REDIS_URL`             | `redis://localhost:6379/0`                                      | Redis connection string                          |
| `CELERY_BROKER_URL`             | `redis://localhost:6379/0`                                      | Celery broker URL                                |
| `CELERY_RESULT_BACKEND`         | `redis://localhost:6379/1`                                      | Celery result backend URL                        |

## Development

```bash
# Backend
cd gateway
poetry install
uvicorn gateway.main:app --reload --port 8585

# Frontend
cd gateway/dashboard/frontend
npm install
npm run dev

# Celery worker
celery -A pyworkflow.celery.app worker --queues=pyworkflow.steps --loglevel=info
```

## Project Structure

```
gateway/
  gateway/              Python package
    config.py           Settings and env loading
    main.py             FastAPI application entry
    server.py           Server startup
    jobs/               Job tracking and management
    storage/            Database models and persistence
    webhooks/           GitHub webhook handlers
    workers/            Worker registration and heartbeat
    workflows/          PyWorkflow definitions
      steps/            Individual workflow step implementations
  dashboard/
    frontend/           React dashboard app
  docker-compose.yaml   Full stack compose config
  Dockerfile            Gateway API container image
  pyproject.toml        Python dependencies (Poetry)
  pyworkflow.config.yaml  PyWorkflow configuration
```

## See Also

Detailed documentation will be available in `docs/` (see Issue #45):

- Architecture deep-dive
- Deployment guide
- Worker setup
- Webhook configuration
