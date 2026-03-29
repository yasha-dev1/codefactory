import { apiGet } from './client';

export interface WorkerResponse {
  id: string;
  hostname: string;
  status: 'online' | 'offline' | 'busy';
  capabilities: string[];
  labels: Record<string, string>;
  last_heartbeat_at: string;
  registered_at: string;
  current_run_id: string | null;
}

export interface WorkerListResponse {
  items: WorkerResponse[];
  count: number;
}

export function fetchWorkers(): Promise<WorkerListResponse> {
  return apiGet<WorkerListResponse>('/api/v1/workers/');
}
