import { NetworkError, UpdateError } from './errors.js';

const GITHUB_API_URL = 'https://api.github.com/repos/yasha-dev1/codefactory/releases/latest';

export interface ReleaseInfo {
  version: string;
  tag: string;
  publishedAt: string;
  downloadUrl: string;
  checksumUrl: string;
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

  const data = (await response.json()) as Record<string, unknown>;
  const tag = data.tag_name as string;
  const version = tag.startsWith('v') ? tag.slice(1) : tag;
  const assets = data.assets as Array<Record<string, unknown>>;

  const binaryAsset = assets?.find((a) => a.name === 'codefactory');
  if (!binaryAsset) {
    throw new UpdateError('No "codefactory" asset found in the latest release.');
  }

  const checksumAsset = assets?.find((a) => a.name === 'checksums.sha256');

  return {
    version,
    tag,
    publishedAt: data.published_at as string,
    downloadUrl: binaryAsset.browser_download_url as string,
    checksumUrl: checksumAsset ? (checksumAsset.browser_download_url as string) : '',
    releaseUrl: data.html_url as string,
    changelog: (data.body as string) || '',
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
