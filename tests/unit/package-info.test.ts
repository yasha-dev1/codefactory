import { getPackageInfo } from '../../src/utils/package-info.js';

describe('getPackageInfo', () => {
  it('should return a valid version string', () => {
    const info = getPackageInfo();
    expect(info.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('should return a non-empty description', () => {
    const info = getPackageInfo();
    expect(info.description).toBeTruthy();
    expect(typeof info.description).toBe('string');
  });

  it('should match the actual package.json values', async () => {
    const { readFile } = await import('node:fs/promises');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const __dirname = dirname(fileURLToPath(import.meta.url));
    const raw = await readFile(join(__dirname, '../../package.json'), 'utf-8');
    const expected = JSON.parse(raw) as { version: string; description: string };

    const info = getPackageInfo();
    expect(info.version).toBe(expected.version);
    expect(info.description).toBe(expected.description);
  });
});
