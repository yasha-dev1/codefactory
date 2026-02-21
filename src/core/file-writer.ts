import { writeFile, appendFile, mkdir, access } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface FileWriterSnapshot {
  created: Set<string>;
  modified: Set<string>;
}

export interface FileWriterDiff {
  created: string[];
  modified: string[];
}

export class FileWriter {
  private created: Set<string> = new Set();
  private modified: Set<string> = new Set();

  async write(filePath: string, content: string): Promise<void> {
    const existed = await this.exists(filePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf-8');

    if (existed) {
      this.modified.add(filePath);
    } else {
      this.created.add(filePath);
    }
  }

  async append(filePath: string, content: string): Promise<void> {
    const existed = await this.exists(filePath);
    await mkdir(dirname(filePath), { recursive: true });
    await appendFile(filePath, content, 'utf-8');

    if (existed) {
      this.modified.add(filePath);
    } else {
      this.created.add(filePath);
    }
  }

  snapshot(): FileWriterSnapshot {
    return {
      created: new Set(this.created),
      modified: new Set(this.modified),
    };
  }

  diffSince(snap: FileWriterSnapshot): FileWriterDiff {
    const created = [...this.created].filter((f) => !snap.created.has(f));
    const modified = [...this.modified].filter((f) => !snap.modified.has(f));
    return { created, modified };
  }

  getCreatedFiles(): string[] {
    return [...this.created];
  }

  getModifiedFiles(): string[] {
    return [...this.modified];
  }

  getSummary(): { created: string[]; modified: string[] } {
    return {
      created: this.getCreatedFiles(),
      modified: this.getModifiedFiles(),
    };
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
