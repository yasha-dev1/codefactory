import { apiGet } from './client';

export interface WebhookEventResponse {
  id: string;
  github_event_type: string;
  action: string;
  repo: string;
  received_at: string;
  workflow_run_id: string | null;
}

export interface WebhookListResponse {
  items: WebhookEventResponse[];
  count: number;
}

export function fetchWebhooks(): Promise<WebhookListResponse> {
  return apiGet<WebhookListResponse>('/api/v1/webhooks/');
}
