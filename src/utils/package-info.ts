import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface PackageInfo {
  version: string;
  description: string;
}

/**
 * Read package.json by walking up from the current file's directory.
 * Works both in source (src/) and bundled (dist/) contexts.
 */
export function getPackageInfo(): PackageInfo {
  let dir = dirname(fileURLToPath(import.meta.url));

  while (true) {
    try {
      const content = readFileSync(join(dir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(content) as Record<string, unknown>;
      if (typeof pkg.version === 'string') {
        return {
          version: pkg.version,
          description: typeof pkg.description === 'string' ? pkg.description : '',
        };
      }
    } catch {
      // Not found at this level, continue up
    }

    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return { version: '0.0.0', description: '' };
}
