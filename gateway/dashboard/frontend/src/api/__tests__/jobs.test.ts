import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchJobs, cancelJob } from '@/api/jobs';
import * as client from '@/api/client';

vi.mock('@/api/client');

describe('jobs API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches jobs from correct endpoint', async () => {
    const mockData = { items: [], count: 0 };
    vi.mocked(client.apiGet).mockResolvedValue(mockData);
    const result = await fetchJobs();
    expect(client.apiGet).toHaveBeenCalledWith('/api/v1/jobs/');
    expect(result).toEqual(mockData);
  });

  it('fetches jobs with status filter', async () => {
    vi.mocked(client.apiGet).mockResolvedValue({ items: [], count: 0 });
    await fetchJobs('running');
    expect(client.apiGet).toHaveBeenCalledWith('/api/v1/jobs/?status=running');
  });

  it('cancels a job', async () => {
    const mockJob = { id: '123', status: 'cancelled' };
    vi.mocked(client.apiPost).mockResolvedValue(mockJob);
    const result = await cancelJob('123');
    expect(client.apiPost).toHaveBeenCalledWith('/api/v1/jobs/123/cancel');
    expect(result.status).toBe('cancelled');
  });
});
