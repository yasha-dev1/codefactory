import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, unlinkSync } from 'node:fs';
import { chmod, readFile, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';

import chalk from 'chalk';

import { logger } from '../ui/logger.js';
import { withSpinner } from '../ui/spinner.js';
import { ChecksumError, NetworkError, UpdateError } from '../utils/errors.js';
import { getPackageInfo } from '../utils/package-info.js';
import { checkForUpdate } from '../utils/version-check.js';

export async function updateCommand(options: { check?: boolean; force?: boolean }): Promise<void> {
  const { version: currentVersion } = getPackageInfo();

  try {
    const { available, latest } = await checkForUpdate(currentVersion);

    if (options.check) {
      if (available && latest) {
        logger.info(
          `Update available: ${chalk.red(currentVersion)} → ${chalk.green(latest.version)}`,
        );
        logger.dim(`Release: ${latest.releaseUrl}`);
      } else {
        logger.success(`Already up to date (v${currentVersion})`);
      }
      return;
    }

    if (!available && !options.force) {
      logger.success(`Already up to date (v${currentVersion})`);
      return;
    }

    if (!latest) {
      logger.error('Could not fetch release information.');
      process.exitCode = 1;
      return;
    }

    if (available) {
      logger.info(
        `Update available: ${chalk.red(currentVersion)} → ${chalk.green(latest.version)}`,
      );
    } else {
      logger.info(`Re-downloading v${currentVersion} (--force)`);
    }

    // Show changelog summary
    if (latest.changelog) {
      const lines = latest.changelog.split('\n').slice(0, 5);
      logger.dim('Changelog:');
      for (const line of lines) {
        logger.dim(`  ${line}`);
      }
      if (latest.changelog.split('\n').length > 5) {
        logger.dim('  ...');
      }
    }

    const tempDir = tmpdir();
    const tempBinary = join(tempDir, `codefactory-update-${Date.now()}`);

    try {
      // Download binary
      await withSpinner('Downloading update', async () => {
        await downloadFile(latest.downloadUrl, tempBinary);
      });

      // Verify checksum
      if (latest.checksumUrl) {
        await withSpinner('Verifying checksum', async () => {
          await verifyChecksum(tempBinary, latest.checksumUrl);
        });
      }

      // Replace current binary
      await withSpinner('Installing update', async () => {
        const currentBinary = resolve(process.argv[1] || process.execPath);
        await chmod(tempBinary, 0o755);
        await rename(tempBinary, currentBinary);
      });

      logger.success(`Updated to v${latest.version}!`);
    } finally {
      // Clean up temp file if it still exists
      if (existsSync(tempBinary)) {
        try {
          unlinkSync(tempBinary);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  } catch (error) {
    if (error instanceof NetworkError) {
      logger.error(error.message);
    } else if (error instanceof ChecksumError) {
      logger.error('Checksum verification failed. Aborting update.');
    } else if (
      error instanceof Error &&
      'code' in error &&
      ((error as NodeJS.ErrnoException).code === 'EACCES' ||
        (error as NodeJS.ErrnoException).code === 'EPERM')
    ) {
      logger.error('Permission denied. Try: sudo codefactory update');
    } else if (error instanceof UpdateError) {
      logger.error(error.message);
    } else {
      logger.error(`Update failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exitCode = 1;
  }
}

async function downloadFile(url: string, dest: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, { redirect: 'follow' });
  } catch (error) {
    throw new NetworkError(
      `Download failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) {
    throw new NetworkError(`Download failed: HTTP ${response.status}`);
  }

  if (!response.body) {
    throw new NetworkError('Download failed: empty response body');
  }

  const fileStream = createWriteStream(dest);
  // Node's fetch returns a web ReadableStream; convert to Node stream for piping
  const readable = response.body as unknown as Readable;
  await pipeline(readable, fileStream);
}

async function verifyChecksum(filePath: string, checksumUrl: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(checksumUrl, { redirect: 'follow' });
  } catch (error) {
    throw new NetworkError(
      `Could not download checksums: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) {
    throw new NetworkError(`Checksum download failed: HTTP ${response.status}`);
  }

  const checksumContent = await response.text();
  const expectedLine = checksumContent.split('\n').find((line) => line.includes('codefactory'));

  if (!expectedLine) {
    throw new ChecksumError('No checksum found for "codefactory" in checksums file.');
  }

  const expectedHash = expectedLine.trim().split(/\s+/)[0];

  const fileBuffer = await readFile(filePath);
  const actualHash = createHash('sha256').update(fileBuffer).digest('hex');

  if (actualHash !== expectedHash) {
    throw new ChecksumError(`Expected SHA-256: ${expectedHash}\nActual SHA-256:   ${actualHash}`);
  }
}
