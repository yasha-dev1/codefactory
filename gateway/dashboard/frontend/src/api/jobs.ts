import { apiGet, apiPost } from './client';

export interface JobResponse {
  id: string;
  workflow_type: string;
  status: string;
  repo: string;
  issue_number: number | null;
  pr_number: number | null;
  started_at: string;
  completed_at: string | null;
  result: string | null;
  error: string | null;
}

export interface JobListResponse {
  items: JobResponse[];
  count: number;
}

export function fetchJobs(status?: string): Promise<JobListResponse> {
  const params = status ? `?status=${status}` : '';
  return apiGet<JobListResponse>(`/api/v1/jobs/${params}`);
}

export function cancelJob(jobId: string): Promise<JobResponse> {
  return apiPost<JobResponse>(`/api/v1/jobs/${jobId}/cancel`);
}
