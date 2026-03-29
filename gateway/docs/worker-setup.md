# Worker Setup Guide

Workers are self-hosted agents that register with the gateway, receive job steps via Celery, and execute AI CLI tools (Claude, Kiro, Codex) against target repositories.

## Docker (Recommended)

```bash
docker run -d \
  -e WORKER_GATEWAY_URL=http://your-gateway:8686 \
  -e WORKER_REGISTRATION_SECRET=your-secret \
  -e WORKER_CAPABILITIES=claude \
  codefactory-worker-agent
```

## Bare Metal

```bash
cd gateway/worker-agent
pip install -e .

export WORKER_GATEWAY_URL=http://your-gateway:8686
export WORKER_REGISTRATION_SECRET=your-secret
export WORKER_CAPABILITIES=claude

codefactory-worker
```

## Configuration

| Variable                     | Default  | Required | Description                                                   |
| ---------------------------- | -------- | -------- | ------------------------------------------------------------- |
| `WORKER_GATEWAY_URL`         | --       | Yes      | Full URL of the gateway API (e.g., `http://host:8686`)        |
| `WORKER_REGISTRATION_SECRET` | --       | Yes      | Must match `GATEWAY_REGISTRATION_SECRET` on the gateway       |
| `WORKER_CAPABILITIES`        | `claude` | No       | Comma-separated list of AI CLI tools available on this worker |

## Verifying Connection

Once a worker starts, it registers with the gateway and begins sending heartbeats. Verify the connection by opening the Workers page in the dashboard (`http://your-gateway:5173`). Registered workers appear with their capabilities and last heartbeat timestamp.

You can also check via the API:

```bash
curl http://your-gateway:8686/api/v1/workers
```

## Troubleshooting

**Worker not appearing in the dashboard** -- Verify that `WORKER_GATEWAY_URL` is reachable from the worker host. Test with `curl $WORKER_GATEWAY_URL/api/v1/health`.

**Registration failed** -- Confirm that `WORKER_REGISTRATION_SECRET` matches the `GATEWAY_REGISTRATION_SECRET` value set on the gateway.

**Heartbeat timeout** -- Check network connectivity between the worker and gateway. The worker sends periodic heartbeats; if the gateway does not receive them within the timeout window, the worker is marked offline.

**AI CLI not found** -- Ensure the AI CLI tools listed in `WORKER_CAPABILITIES` are installed and available on the worker's `PATH`.
