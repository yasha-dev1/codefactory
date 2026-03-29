import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWorkers } from '@/api/workers';
import * as client from '@/api/client';

vi.mock('@/api/client');

describe('workers API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches workers from correct endpoint', async () => {
    const mockData = { items: [], count: 0 };
    vi.mocked(client.apiGet).mockResolvedValue(mockData);
    const result = await fetchWorkers();
    expect(client.apiGet).toHaveBeenCalledWith('/api/v1/workers/');
    expect(result).toEqual(mockData);
  });
});
