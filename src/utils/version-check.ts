import { z } from 'zod';

import { NetworkError, UpdateError } from './errors.js';

const GITHUB_API_URL = 'https://api.github.com/repos/yasha-dev1/codefactory/releases/latest';

const GitHubAssetSchema = z.object({
  name: z.string(),
  browser_download_url: z.string().url(),
});

const GitHubReleaseSchema = z.object({
  tag_name: z.string(),
  published_at: z.string(),
  html_url: z.string().url(),
  body: z.string().nullable().default(''),
  assets: z.array(GitHubAssetSchema),
});

export interface ReleaseInfo {
  version: string;
  tag: string;
  publishedAt: string;
  downloadUrl: string;
  checksumUrl: string | undefined;
  releaseUrl: string;
  changelog: string;
}

export async function fetchLatestRelease(): Promise<ReleaseInfo> {
  let response: Response;
  try {
    response = await fetch(GITHUB_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
    });
  } catch (error) {
    throw new NetworkError(
      `Could not reach GitHub. Check your connection. (${error instanceof Error ? error.message : String(error)})`,
    );
  }

  if (response.status === 403) {
    throw new NetworkError('GitHub API rate limit exceeded. Try again later.');
  }

  if (!response.ok) {
    throw new NetworkError(`GitHub API returned ${response.status}: ${response.statusText}`);
  }

  const raw = await response.json();
  const parsed = GitHubReleaseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new UpdateError(`Unexpected GitHub API response: ${parsed.error.message}`);
  }

  const data = parsed.data;
  const tag = data.tag_name;
  const version = tag.startsWith('v') ? tag.slice(1) : tag;

  const binaryAsset = data.assets.find((a) => a.name === 'codefactory');
  if (!binaryAsset) {
    throw new UpdateError('No "codefactory" asset found in the latest release.');
  }

  const checksumAsset = data.assets.find((a) => a.name === 'checksums.sha256');

  return {
    version,
    tag,
    publishedAt: data.published_at,
    downloadUrl: binaryAsset.browser_download_url,
    checksumUrl: checksumAsset?.browser_download_url,
    releaseUrl: data.html_url,
    changelog: data.body || '',
  };
}

export function compareVersions(current: string, latest: string): number {
  const parseParts = (v: string) => {
    const [release, pre] = v.split('-', 2);
    const parts = release.split('.').map(Number);
    return { parts, pre };
  };

  const a = parseParts(current);
  const b = parseParts(latest);

  const maxLen = Math.max(a.parts.length, b.parts.length);
  for (let i = 0; i < maxLen; i++) {
    const av = a.parts[i] ?? 0;
    const bv = b.parts[i] ?? 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }

  // Equal release parts — check pre-release
  if (a.pre && !b.pre) return -1; // pre-release < release
  if (!a.pre && b.pre) return 1; // release > pre-release
  if (a.pre && b.pre) {
    return a.pre < b.pre ? -1 : a.pre > b.pre ? 1 : 0;
  }

  return 0;
}

export async function checkForUpdate(currentVersion: string): Promise<{
  available: boolean;
  current: string;
  latest: ReleaseInfo | null;
}> {
  const latest = await fetchLatestRelease();
  const cmp = compareVersions(currentVersion, latest.version);
  return {
    available: cmp < 0,
    current: currentVersion,
    latest,
  };
}
