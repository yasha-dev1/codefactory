import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  compareVersions,
  fetchLatestRelease,
  checkForUpdate,
} from '../../src/utils/version-check.js';
import { NetworkError, UpdateError } from '../../src/utils/errors.js';

const mockRelease = {
  tag_name: 'v0.3.0',
  published_at: '2025-06-01T00:00:00Z',
  html_url: 'https://github.com/yasha-dev1/codefactory/releases/tag/v0.3.0',
  body: 'Release notes here',
  assets: [
    {
      name: 'codefactory',
      browser_download_url:
        'https://github.com/yasha-dev1/codefactory/releases/download/v0.3.0/codefactory',
    },
    {
      name: 'checksums.sha256',
      browser_download_url:
        'https://github.com/yasha-dev1/codefactory/releases/download/v0.3.0/checksums.sha256',
    },
  ],
};

describe('version-check', () => {
  describe('compareVersions', () => {
    it('should return 0 for equal versions', () => {
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    });

    it('should return -1 when current < latest', () => {
      expect(compareVersions('0.1.0', '0.2.0')).toBe(-1);
      expect(compareVersions('0.1.0', '1.0.0')).toBe(-1);
      expect(compareVersions('0.1.9', '0.2.0')).toBe(-1);
    });

    it('should return 1 when current > latest', () => {
      expect(compareVersions('1.0.0', '0.9.0')).toBe(1);
      expect(compareVersions('0.2.0', '0.1.0')).toBe(1);
    });

    it('should handle pre-release versions (0.1.0-beta.1 < 0.1.0)', () => {
      expect(compareVersions('0.1.0-beta.1', '0.1.0')).toBe(-1);
      expect(compareVersions('0.1.0', '0.1.0-beta.1')).toBe(1);
    });

    it('should handle versions with different segment counts (1.0 vs 1.0.0)', () => {
      expect(compareVersions('1.0', '1.0.0')).toBe(0);
      expect(compareVersions('1.0.0', '1.0')).toBe(0);
      expect(compareVersions('1.0', '1.0.1')).toBe(-1);
    });
  });

  describe('fetchLatestRelease', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('should parse GitHub release API response into ReleaseInfo', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify(mockRelease), { status: 200 }),
      );

      const info = await fetchLatestRelease();
      expect(info.version).toBe('0.3.0');
      expect(info.tag).toBe('v0.3.0');
      expect(info.publishedAt).toBe('2025-06-01T00:00:00Z');
      expect(info.releaseUrl).toContain('v0.3.0');
      expect(info.changelog).toBe('Release notes here');
    });

    it('should find the "codefactory" asset download URL', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify(mockRelease), { status: 200 }),
      );

      const info = await fetchLatestRelease();
      expect(info.downloadUrl).toContain('/codefactory');
    });

    it('should find the "checksums.sha256" asset URL', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify(mockRelease), { status: 200 }),
      );

      const info = await fetchLatestRelease();
      expect(info.checksumUrl).toContain('checksums.sha256');
    });

    it('should throw NetworkError on non-200 response', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response('Not Found', { status: 404, statusText: 'Not Found' }),
      );

      await expect(fetchLatestRelease()).rejects.toThrow(NetworkError);
    });

    it('should throw NetworkError on fetch failure', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('DNS resolution failed'));

      await expect(fetchLatestRelease()).rejects.toThrow(NetworkError);
      await expect(fetchLatestRelease()).rejects.toThrow(/Check your connection/);
    });

    it('should throw UpdateError if no "codefactory" asset found in release', async () => {
      const noAssetRelease = {
        ...mockRelease,
        assets: [{ name: 'other-file', browser_download_url: 'https://example.com/other' }],
      };
      vi.mocked(globalThis.fetch).mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(noAssetRelease), { status: 200 })),
      );

      await expect(fetchLatestRelease()).rejects.toThrow(UpdateError);
      await expect(fetchLatestRelease()).rejects.toThrow(/No "codefactory" asset/);
    });

    it('should handle rate-limited responses (403) with appropriate message', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response('Rate limited', { status: 403, statusText: 'Forbidden' }),
      );

      await expect(fetchLatestRelease()).rejects.toThrow(NetworkError);
      await expect(fetchLatestRelease()).rejects.toThrow(/rate limit/);
    });
  });

  describe('checkForUpdate', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('should return available=true when latest > current', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify(mockRelease), { status: 200 }),
      );

      const result = await checkForUpdate('0.1.0');
      expect(result.available).toBe(true);
      expect(result.current).toBe('0.1.0');
      expect(result.latest?.version).toBe('0.3.0');
    });

    it('should return available=false when latest == current', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify(mockRelease), { status: 200 }),
      );

      const result = await checkForUpdate('0.3.0');
      expect(result.available).toBe(false);
    });

    it('should return available=false when latest < current (dev build)', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify(mockRelease), { status: 200 }),
      );

      const result = await checkForUpdate('1.0.0');
      expect(result.available).toBe(false);
    });

    it('should propagate NetworkError from fetchLatestRelease', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Network error'));

      await expect(checkForUpdate('0.1.0')).rejects.toThrow(NetworkError);
    });
  });
});
