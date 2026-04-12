/**
 * GitHub Releases version check.
 * Non-blocking, fails silently on network errors.
 */
import { get } from 'node:https';

const RELEASES_API = 'https://api.github.com/repos/schmooky/spine-benchmark/releases';
const RELEASES_URL = 'https://github.com/schmooky/spine-benchmark/releases';

interface ReleaseInfo {
  tagName: string;
  version: string;
  url: string;
}

function parseVersion(tag: string): string {
  // Tags like "watcher-v1.0.0" or "v1.0.0"
  return tag.replace(/^(watcher-)?v/, '');
}

function isNewer(remote: string, local: string): boolean {
  const r = remote.split('.').map(Number);
  const l = local.split('.').map(Number);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rv = r[i] ?? 0;
    const lv = l[i] ?? 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = get(url, {
      headers: {
        'User-Agent': 'spine-benchmark-watcher',
        'Accept': 'application/vnd.github.v3+json',
      },
      timeout: 5000,
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirect = res.headers.location;
        if (redirect) {
          fetchJson(redirect).then(resolve, reject);
          return;
        }
      }
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Invalid JSON'));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

export async function checkForUpdate(currentVersion: string): Promise<ReleaseInfo | null> {
  try {
    const releases = await fetchJson(RELEASES_API);
    if (!Array.isArray(releases)) return null;

    // Look for watcher-specific releases first, then fall back to any release
    const watcherRelease = releases.find(
      (r: any) => r.tag_name?.startsWith('watcher-v') && !r.draft && !r.prerelease,
    );
    const release = watcherRelease || releases.find(
      (r: any) => !r.draft && !r.prerelease,
    );

    if (!release) return null;

    const version = parseVersion(release.tag_name);
    if (isNewer(version, currentVersion)) {
      return {
        tagName: release.tag_name,
        version,
        url: release.html_url || RELEASES_URL,
      };
    }

    return null;
  } catch {
    return null;
  }
}

export { RELEASES_URL };
