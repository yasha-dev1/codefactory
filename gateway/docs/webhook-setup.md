# Webhook Setup Guide

## GitHub Configuration

1. Go to your repository on GitHub.
2. Navigate to **Settings > Webhooks > Add webhook**.
3. Set the fields:
   - **Payload URL**: `http://your-gateway:8686/webhooks/github`
   - **Content type**: `application/json`
   - **Secret**: the same value as `GATEWAY_GITHUB_WEBHOOK_SECRET` in your `.env`
4. Under "Which events would you like to trigger this webhook?", select **Let me select individual events** and check:
   - **Issues**
   - **Pull requests**
   - **Pushes**
5. Ensure **Active** is checked.
6. Click **Add webhook**.

GitHub will send a ping event immediately. Check the webhook's **Recent Deliveries** tab to confirm a `200` response.

## Testing with curl

```bash
SECRET="your-webhook-secret"
PAYLOAD='{"action":"opened","issue":{"number":1,"title":"Test","user":{"login":"test"},"state":"open"},"repository":{"full_name":"org/repo","clone_url":"https://github.com/org/repo.git"}}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print "sha256="$NF}')

curl -X POST http://localhost:8686/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: issues" \
  -H "X-Hub-Signature-256: $SIGNATURE" \
  -d "$PAYLOAD"
```

A successful request returns `200` with a JSON body containing the created job ID.

## Event Routing

| GitHub Event   | Action        | Workflow Triggered    | Description                                                             |
| -------------- | ------------- | --------------------- | ----------------------------------------------------------------------- |
| `issues`       | `opened`      | Triage + Plan         | New issue triggers triage and planning                                  |
| `issues`       | `labeled`     | Planner / Implementer | `agent:plan` or `agent:implement` label triggers the corresponding step |
| `pull_request` | `opened`      | Review                | New PR triggers automated review                                        |
| `pull_request` | `synchronize` | Review                | Updated PR triggers re-review                                           |
| `push`         | --            | Varies                | Push events can trigger CI-related steps                                |
