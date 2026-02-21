import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing the module under test
vi.mock('../../src/utils/version-check.js', () => ({
  checkForUpdate: vi.fn(),
  fetchLatestRelease: vi.fn(),
}));

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

import { updateCommand } from '../../src/commands/update.js';
import { checkForUpdate } from '../../src/utils/version-check.js';
import { logger } from '../../src/ui/logger.js';
import { NetworkError, ChecksumError } from '../../src/utils/errors.js';

const mockLatest = {
  version: '0.3.0',
  tag: 'v0.3.0',
  publishedAt: '2025-06-01T00:00:00Z',
  downloadUrl: 'https://example.com/codefactory',
  checksumUrl: 'https://example.com/checksums.sha256',
  releaseUrl: 'https://github.com/yasha-dev1/codefactory/releases/tag/v0.3.0',
  changelog: 'Line 1\nLine 2\nLine 3',
};

describe('update command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  describe('--check mode', () => {
    it('should display "Up to date" when no update available', async () => {
      vi.mocked(checkForUpdate).mockResolvedValue({
        available: false,
        current: '0.1.0',
        latest: mockLatest,
      });

      await updateCommand({ check: true });

      expect(logger.success).toHaveBeenCalledWith(expect.stringContaining('up to date'));
    });

    it('should display update info when newer version exists', async () => {
      vi.mocked(checkForUpdate).mockResolvedValue({
        available: true,
        current: '0.1.0',
        latest: mockLatest,
      });

      await updateCommand({ check: true });

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('0.3.0'));
    });

    it('should not attempt download in check mode', async () => {
      vi.mocked(checkForUpdate).mockResolvedValue({
        available: true,
        current: '0.1.0',
        latest: mockLatest,
      });

      const originalFetch = globalThis.fetch;
      vi.stubGlobal('fetch', vi.fn());

      await updateCommand({ check: true });

      // fetch should not have been called (only checkForUpdate calls it internally, which is mocked)
      expect(globalThis.fetch).not.toHaveBeenCalled();
      globalThis.fetch = originalFetch;
    });

    it('should exit with code 0 regardless of update availability', async () => {
      vi.mocked(checkForUpdate).mockResolvedValue({
        available: true,
        current: '0.1.0',
        latest: mockLatest,
      });

      await updateCommand({ check: true });

      expect(process.exitCode).toBeUndefined();
    });
  });

  describe('update mode', () => {
    it('should display "Already up to date" when on latest', async () => {
      vi.mocked(checkForUpdate).mockResolvedValue({
        available: false,
        current: '0.3.0',
        latest: mockLatest,
      });

      await updateCommand({});

      expect(logger.success).toHaveBeenCalledWith(expect.stringContaining('up to date'));
    });

    it('should handle --force flag to re-download current version', async () => {
      vi.mocked(checkForUpdate).mockResolvedValue({
        available: false,
        current: '0.3.0',
        latest: mockLatest,
      });

      // Mock fetch for the download
      const originalFetch = globalThis.fetch;
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Simulated download')));

      await updateCommand({ force: true });

      // It should have attempted to download (logger.info about re-downloading)
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('force'));
      globalThis.fetch = originalFetch;
    });
  });

  describe('error handling', () => {
    it('should display friendly message on network error', async () => {
      vi.mocked(checkForUpdate).mockRejectedValue(new NetworkError('Could not reach GitHub'));

      await updateCommand({});

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Could not reach GitHub'));
      expect(process.exitCode).toBe(1);
    });

    it('should display checksum error on integrity failure', async () => {
      vi.mocked(checkForUpdate).mockRejectedValue(new ChecksumError('Checksum mismatch'));

      await updateCommand({});

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Checksum'));
      expect(process.exitCode).toBe(1);
    });

    it('should display permission instructions on EACCES', async () => {
      const err = new Error('Permission denied') as NodeJS.ErrnoException;
      err.code = 'EACCES';
      vi.mocked(checkForUpdate).mockRejectedValue(err);

      await updateCommand({});

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('sudo'));
      expect(process.exitCode).toBe(1);
    });
  });
});
