import { vi, describe, it, expect, beforeEach } from 'vitest';
import axios from 'axios';
import { apiGet, apiPost } from '../client';

vi.mock('axios', () => {
  const mockInstance = {
    get: vi.fn(),
    post: vi.fn(),
  };
  return {
    default: {
      create: vi.fn(() => mockInstance),
      __mockInstance: mockInstance,
    },
  };
});

function getMockInstance() {
  return (
    axios as unknown as {
      __mockInstance: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };
    }
  ).__mockInstance;
}

describe('apiGet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls axios.get and returns response.data', async () => {
    const mock = getMockInstance();
    mock.get.mockResolvedValue({ data: { status: 'ok' } });

    const result = await apiGet('/api/v1/health');

    expect(mock.get).toHaveBeenCalledWith('/api/v1/health', undefined);
    expect(result).toEqual({ status: 'ok' });
  });
});

describe('apiPost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls axios.post and returns response.data', async () => {
    const mock = getMockInstance();
    mock.post.mockResolvedValue({ data: { id: 1 } });

    const result = await apiPost('/api/v1/jobs', { name: 'test' });

    expect(mock.post).toHaveBeenCalledWith('/api/v1/jobs', { name: 'test' }, undefined);
    expect(result).toEqual({ id: 1 });
  });
});
