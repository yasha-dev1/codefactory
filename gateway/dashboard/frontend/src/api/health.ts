import { apiGet } from './client';

export interface HealthResponse {
  status: string;
  version: string;
  uptime: number;
}

export function fetchHealth(): Promise<HealthResponse> {
  return apiGet<HealthResponse>('/api/v1/health');
}
