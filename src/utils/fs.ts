import { access, readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function readFileIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

export async function getDirectoryTree(
  dir: string,
  options?: { maxDepth?: number; ignore?: string[] },
): Promise<string> {
  const maxDepth = options?.maxDepth ?? 3;
  const ignore = new Set(options?.ignore ?? ['node_modules', '.git', 'dist', '.next', '__pycache__']);

  const lines: string[] = [];

  async function walk(currentDir: string, prefix: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    const entries = await readdir(currentDir, { withFileTypes: true });
    const filtered = entries
      .filter((e) => !ignore.has(e.name))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

    for (let i = 0; i < filtered.length; i++) {
      const entry = filtered[i];
      const isLast = i === filtered.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const childPrefix = isLast ? '    ' : '│   ';

      lines.push(`${prefix}${connector}${entry.name}${entry.isDirectory() ? '/' : ''}`);

      if (entry.isDirectory()) {
        await walk(join(currentDir, entry.name), prefix + childPrefix, depth + 1);
      }
    }
  }

  lines.push(relative(process.cwd(), dir) || '.');
  await walk(dir, '', 0);
  return lines.join('\n');
}
