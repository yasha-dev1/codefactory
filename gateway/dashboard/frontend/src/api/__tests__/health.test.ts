import { vi, describe, it, expect } from 'vitest';
import { fetchHealth } from '../health';

vi.mock('@/api/client', () => ({
  apiGet: vi.fn(),
}));

import { apiGet } from '@/api/client';

describe('fetchHealth', () => {
  it('calls apiGet with the correct endpoint', async () => {
    const mockData = { status: 'healthy', version: '1.0.0', uptime: 1000 };
    vi.mocked(apiGet).mockResolvedValue(mockData);

    const result = await fetchHealth();

    expect(apiGet).toHaveBeenCalledWith('/api/v1/health');
    expect(result).toEqual(mockData);
  });
});
