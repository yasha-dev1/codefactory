# Deployment Guide

## Prerequisites

- Docker and Docker Compose (v2+)
- A GitHub webhook secret (any random string)
- A worker registration secret (any random string)

## Quick Start

```bash
cd gateway
cp .env.example .env
# Edit .env -- set GATEWAY_GITHUB_WEBHOOK_SECRET and GATEWAY_REGISTRATION_SECRET
docker compose up -d
```

The gateway API will be available at `http://localhost:8686` and the dashboard at `http://localhost:5173`.

## Environment Variables

| Variable                        | Default                                                         | Required | Description                                                  |
| ------------------------------- | --------------------------------------------------------------- | -------- | ------------------------------------------------------------ |
| `GATEWAY_HOST`                  | `0.0.0.0`                                                       | No       | API listen address                                           |
| `GATEWAY_PORT`                  | `8686`                                                          | No       | API listen port                                              |
| `GATEWAY_DEBUG`                 | `false`                                                         | No       | Enable debug mode (verbose logging, auto-reload)             |
| `GATEWAY_CORS_ORIGINS`          | `["http://localhost:5173"]`                                     | No       | Allowed CORS origins (JSON array)                            |
| `GATEWAY_GITHUB_WEBHOOK_SECRET` | --                                                              | Yes      | GitHub webhook secret for HMAC-SHA256 signature verification |
| `GATEWAY_REGISTRATION_SECRET`   | --                                                              | Yes      | Shared secret for worker registration auth                   |
| `GATEWAY_DATABASE_URL`          | `postgresql+asyncpg://postgres:postgres@localhost:5432/gateway` | No       | PostgreSQL connection string (asyncpg)                       |
| `GATEWAY_REDIS_URL`             | `redis://localhost:6379/0`                                      | No       | Redis connection string for general use                      |
| `CELERY_BROKER_URL`             | `redis://localhost:6379/0`                                      | No       | Celery message broker URL                                    |
| `CELERY_RESULT_BACKEND`         | `redis://localhost:6379/1`                                      | No       | Celery result backend URL                                    |

When running with Docker Compose, the database and Redis URLs are overridden in `docker-compose.yaml` to use internal service hostnames (`postgres`, `redis`).

## Scaling

Scale step workers to handle more concurrent jobs:

```bash
docker compose up -d --scale step-worker=5
```

Each step worker process auto-scales between 2 and 10 concurrent threads (configured via `--autoscale=10,2` in the compose file).

## Production Considerations

**TLS termination** -- Place the gateway behind a reverse proxy (nginx, Caddy, Traefik) that handles TLS. The gateway itself listens on plain HTTP.

**Database** -- For production, use a managed PostgreSQL instance (AWS RDS, GCP Cloud SQL, etc.) and update `GATEWAY_DATABASE_URL` accordingly. Run regular `pg_dump` backups.

**Redis** -- Consider a managed Redis service (ElastiCache, Memorystore) for reliability. Separate broker and result backend onto different Redis databases or instances if needed.

**Monitoring** -- The health endpoint at `GET /api/v1/health` returns service status and can be used for load balancer health checks and uptime monitoring.

**CORS** -- Update `GATEWAY_CORS_ORIGINS` to include your production dashboard URL.
