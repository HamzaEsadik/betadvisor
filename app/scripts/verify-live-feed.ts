/**
 * Fetches the live feed and validates it with the app's own zod schemas, so contract drift
 * between the pipeline and the app shows up before a device sees it (Part 16).
 *
 *   npm run verify:feed                       # the production URL from app.json extra.feedBaseUrl
 *   npm run verify:feed -- http://host/feed/  # any other base URL
 *
 * Fails (exit 1) on: a fetch error, a payload the schemas reject, a file over 500 KB (NFR-P2), or
 * a `min_app_version` newer than this app. A feed older than 24 h is only a warning: the app shows
 * it with a stale banner (FR-A9), and the pipeline's own monitoring covers missed runs.
 *
 * Runs on Node's built-in TypeScript support (Node 22.18+), so it imports `.ts` files directly.
 */
import fs from 'node:fs';
import path from 'node:path';

import { parseFeed, type FeedKind } from '../src/api/schemas.ts';

const KINDS: readonly FeedKind[] = ['signals', 'results', 'meta'];
const MAX_BYTES = 500 * 1024;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 15_000;

const appJson = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../app.json'), 'utf8'));
const appVersion: string = appJson.expo.version;
const rawBase: unknown = process.argv[2] ?? appJson.expo.extra?.feedBaseUrl;
if (typeof rawBase !== 'string' || !/^https?:\/\//.test(rawBase)) {
  console.error('no feed base URL (app.json extra.feedBaseUrl or the first argument)');
  process.exit(1);
}
const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

/** -1, 0 or 1 for dotted numeric versions. */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

const failures: string[] = [];
const warnings: string[] = [];

async function check(kind: FeedKind): Promise<void> {
  const url = `${base}${kind}.json`;
  let body: string;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status !== 200) {
      failures.push(`${kind}: HTTP ${res.status} from ${url}`);
      return;
    }
    body = await res.text();
  } catch (e) {
    failures.push(`${kind}: ${e instanceof Error ? e.message : String(e)} (${url})`);
    return;
  }

  const bytes = Buffer.byteLength(body);
  if (bytes > MAX_BYTES) failures.push(`${kind}: ${bytes} bytes is over the 500 KB limit`);

  const parsed = parseFeed(kind, body);
  if (!parsed.ok) {
    failures.push(
      `${kind}: rejected by the app schema at ${JSON.stringify(parsed.path)}\n${parsed.error}`,
    );
    return;
  }
  const doc = parsed.data;
  const ageMs = Date.now() - Date.parse(doc.generated_at);
  const ageH = (ageMs / 3_600_000).toFixed(1);
  if (ageMs > STALE_AFTER_MS) warnings.push(`${kind}: generated ${ageH} h ago (stale)`);

  let detail = '';
  if ('signals' in doc) {
    const recommended = doc.signals.filter((s) => s.recommended).length;
    detail = `${doc.signals.length} signals, ${recommended} recommended`;
  } else if ('results' in doc) {
    detail = `${doc.results.length} results`;
  } else {
    detail = `model ${doc.model_version}, min app ${doc.min_app_version}`;
    if (compareVersions(doc.min_app_version, appVersion) > 0) {
      failures.push(`meta: min_app_version ${doc.min_app_version} is newer than app ${appVersion}`);
    }
    const down = Object.entries(doc.sources_health).filter(([, h]) => h.status !== 'ok');
    for (const [name, h] of down) warnings.push(`meta: source ${name} is ${h.status}`);
  }
  console.log(
    `ok  ${kind.padEnd(7)} ${String(bytes).padStart(7)} B  ${doc.generated_at} (${ageH} h)  ${detail}`,
  );
}

console.log(`feed ${base} (app ${appVersion})`);
for (const kind of KINDS) await check(kind);
for (const w of warnings) console.warn(`warn ${w}`);
for (const f of failures) console.error(`FAIL ${f}`);
if (failures.length > 0) process.exit(1);
console.log('live feed passes the app schema check');
