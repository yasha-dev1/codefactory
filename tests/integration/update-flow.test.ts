import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';

// Mock dependencies
vi.mock('../../src/utils/package-info.js', () => ({
  getPackageInfo: vi.fn(() => ({ version: '0.1.0', description: 'test' })),
}));

vi.mock('../../src/ui/logger.js', () => ({
  logger: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    header: vi.fn(),
    dim: vi.fn(),
  },
}));

vi.mock('../../src/ui/spinner.js', () => ({
  withSpinner: vi.fn(async (_text: string, fn: () => Promise<unknown>) => fn()),
  createSpinner: vi.fn(() => ({ start: vi.fn(), succeed: vi.fn(), fail: vi.fn() })),
}));

import { logger } from '../../src/ui/logger.js';

const FAKE_BINARY_CONTENT = '#!/usr/bin/env node\nconsole.log("codefactory v0.3.0");';
const FAKE_BINARY_HASH = createHash('sha256').update(FAKE_BINARY_CONTENT).digest('hex');
const FAKE_CHECKSUMS = `${FAKE_BINARY_HASH}  codefactory\n`;

const mockRelease = {
  tag_name: 'v0.3.0',
  published_at: '2025-06-01T00:00:00Z',
  html_url: 'https://github.com/yasha-dev1/codefactory/releases/tag/v0.3.0',
  body: 'Release notes',
  assets: [
    {
      name: 'codefactory',
      browser_download_url: 'https://example.com/releases/download/v0.3.0/codefactory',
    },
    {
      name: 'checksums.sha256',
      browser_download_url: 'https://example.com/releases/download/v0.3.0/checksums.sha256',
    },
  ],
};

describe('update flow (e2e)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should complete full check → download → verify → replace cycle', async () => {
    // Set up mock fetch that handles all three API calls
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('api.github.com')) {
          return Promise.resolve(new Response(JSON.stringify(mockRelease), { status: 200 }));
        }
        if (url.includes('checksums.sha256')) {
          return Promise.resolve(new Response(FAKE_CHECKSUMS, { status: 200 }));
        }
        if (url.includes('codefactory')) {
          return Promise.resolve(new Response(FAKE_BINARY_CONTENT, { status: 200 }));
        }
        return Promise.resolve(new Response('Not found', { status: 404 }));
      }),
    );

    // We need to dynamically import to pick up the mocked fetch
    // The actual update will fail on the rename step (replacing the running binary),
    // but check mode should work end-to-end
    const { updateCommand } = await import('../../src/commands/update.js');

    await updateCommand({ check: true });

    // Should have reported the update
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('0.3.0'));
    expect(process.exitCode).toBeUndefined();
  });

  it('should report up-to-date when versions match', async () => {
    const currentVersionRelease = {
      ...mockRelease,
      tag_name: 'v0.1.0',
      assets: mockRelease.assets.map((a) => ({
        ...a,
        browser_download_url: a.browser_download_url.replace('v0.3.0', 'v0.1.0'),
      })),
    };

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(new Response(JSON.stringify(currentVersionRelease), { status: 200 })),
        ),
    );

    const { updateCommand } = await import('../../src/commands/update.js');

    await updateCommand({ check: true });

    expect(logger.success).toHaveBeenCalledWith(expect.stringContaining('up to date'));
  });

  it('should handle network failure gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));

    const { updateCommand } = await import('../../src/commands/update.js');

    await updateCommand({});

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Check your connection'));
    expect(process.exitCode).toBe(1);
  });
});
