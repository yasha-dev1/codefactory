# Architecture

CodeFactory Gateway is a self-hosted backend that receives GitHub webhooks, orchestrates multi-step CI/CD agent jobs via PyWorkflow, dispatches work to self-hosted workers through Celery, and exposes a React dashboard for monitoring. It replaces GitHub-hosted Actions runners to avoid billing limits and provide full control over the execution environment.

## System Diagram

```
GitHub Repository
    |
    v (webhook: issues, pull_request, push)
Gateway API (FastAPI :8686)
    |-- Signature verification (HMAC-SHA256)
    |-- Event parsing + job creation
    +-- Workflow dispatch
            |
            v
    PyWorkflow (transient mode)
            |
            v
    Celery Broker (Redis)
            |
            v
    Worker Agent (self-hosted)
    |-- Celery step worker
    |-- AI CLI (Claude / Kiro / Codex)
    +-- Heartbeat -> Gateway API
            |
            v
    GitHub API (comments, labels, PRs)

Dashboard (React :5173) <-- Gateway API <-- Postgres
```

## Components

| Component    | Description                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| gateway-api  | FastAPI application that receives webhooks, verifies signatures, manages jobs, and serves the REST API. |
| step-worker  | Celery worker that executes individual workflow steps dispatched through Redis.                         |
| worker-agent | Self-hosted agent that registers with the gateway, runs AI CLI tools, and sends heartbeats.             |
| dashboard    | React frontend providing real-time views of workers, jobs, and webhook activity.                        |
| postgres     | PostgreSQL database storing workers, webhook events, jobs, and workflow state.                          |
| redis        | Redis instance serving as the Celery message broker and result backend.                                 |

## Workflow Pipeline

Each GitHub event triggers a multi-step workflow:

1. **Triage** -- Classifies the incoming issue or event, assigns labels, and determines whether agent work is needed.
2. **Planner** -- Analyzes the issue context and posts an implementation plan as a comment.
3. **Implementer** -- Reads the plan, makes code changes on a branch, and opens a pull request.
4. **Review** -- Reviews the PR for correctness, style, and safety; requests changes or approves.

Steps are executed sequentially by Celery workers. Each step produces output consumed by the next. If a step fails, the job is marked with `agent:needs-judgment` for manual escalation.

## Technology Stack

| Layer          | Technology                                                |
| -------------- | --------------------------------------------------------- |
| Backend        | Python 3.11+, FastAPI, PyWorkflow, Celery                 |
| Frontend       | React 19, TypeScript, TanStack Router/Query, Tailwind CSS |
| Database       | PostgreSQL 16                                             |
| Broker         | Redis 7                                                   |
| Infrastructure | Docker, Docker Compose                                    |
