/**
 * Fetches one feed file (FR-A1, FR-R1): conditional GET with the cached ETag (§7.3), a 10 s
 * timeout, schema validation (NFR-S3), and a cache write only once the payload is valid. On any
 * failure the last good cache is returned unchanged (NFR-R1).
 */
import { FEED_TIMEOUT_MS } from '../config/feed';
import type { CacheRepo } from '../db/repos/cacheRepo';
import { parseFeed, type FeedDocs, type FeedKind } from './schemas';

export interface FeedClientDeps {
  fetch: typeof fetch;
  cache: CacheRepo;
  /** Ends with `/`. */
  baseUrl: string;
  now: () => Date;
  timeoutMs?: number;
}

export type FetchStatus =
  /** 200 with a valid payload, now cached. */
  | 'updated'
  /** 304: the cached payload is current. */
  | 'not_modified'
  /** 200 with a valid payload generated before the cached one (a lagging CDN); cache kept. */
  | 'older_ignored'
  /** Payload failed JSON parsing or schema validation; cache kept. */
  | 'rejected'
  /** Non-2xx/304 status; cache kept. */
  | 'http_error'
  /** Network error or timeout; cache kept. */
  | 'offline';

export interface FetchOutcome<K extends FeedKind> {
  kind: K;
  status: FetchStatus;
  /** The document to use: the new one, or the last good cache (null if there is none). */
  doc: FeedDocs[K] | null;
  /** When `doc` was last confirmed by the server. */
  fetchedAt: string | null;
  error: string | null;
}

export interface CachedDoc<K extends FeedKind> {
  doc: FeedDocs[K];
  fetchedAt: string;
  etag: string | null;
}

/** The cached document, re-validated (a cache written by an older app version may not parse). */
export function readCached<K extends FeedKind>(cache: CacheRepo, kind: K): CachedDoc<K> | null {
  const entry = cache.get(kind);
  if (!entry) return null;
  const r = parseFeed(kind, entry.payload);
  return r.ok ? { doc: r.data, fetchedAt: entry.fetchedAt, etag: entry.etag } : null;
}

export function feedUrl(baseUrl: string, kind: FeedKind): string {
  return `${baseUrl}${kind}.json`;
}

export async function fetchFeed<K extends FeedKind>(
  deps: FeedClientDeps,
  kind: K,
): Promise<FetchOutcome<K>> {
  const cached = readCached(deps.cache, kind);
  const keep = (status: FetchStatus, error: string): FetchOutcome<K> => ({
    kind,
    status,
    doc: cached?.doc ?? null,
    fetchedAt: cached?.fetchedAt ?? null,
    error,
  });

  let res: { status: number; etag: string | null; body: string };
  try {
    res = await get(deps, feedUrl(deps.baseUrl, kind), cached?.etag ?? null);
    // A 304 for a cache we cannot use (should not happen): ask again unconditionally.
    if (res.status === 304 && !cached) {
      res = await get(deps, feedUrl(deps.baseUrl, kind), null);
    }
  } catch (e) {
    return keep('offline', errorText(e));
  }

  const fetchedAt = deps.now().toISOString();
  if (res.status === 304 && cached) {
    deps.cache.touch(kind, fetchedAt);
    return { kind, status: 'not_modified', doc: cached.doc, fetchedAt, error: null };
  }
  if (res.status !== 200) return keep('http_error', `HTTP ${res.status}`);

  const parsed = parseFeed(kind, res.body);
  if (!parsed.ok) return keep('rejected', parsed.error);

  if (cached && Date.parse(parsed.data.generated_at) < Date.parse(cached.doc.generated_at)) {
    return keep('older_ignored', `server sent ${parsed.data.generated_at}`);
  }

  deps.cache.put({ key: kind, fetchedAt, etag: res.etag, payload: res.body });
  return { kind, status: 'updated', doc: parsed.data, fetchedAt, error: null };
}

async function get(
  deps: FeedClientDeps,
  url: string,
  etag: string | null,
): Promise<{ status: number; etag: string | null; body: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? FEED_TIMEOUT_MS);
  try {
    // `no-cache`: React Native's Android OkHttp keeps a disk HTTP cache and would otherwise answer
    // from it (GitHub Pages sends max-age=600), so a refresh could show a feed up to 10 min old.
    // The app does its own ETag revalidation; the HTTP cache must always ask the server.
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
    };
    if (etag) headers['If-None-Match'] = etag;
    const res = await deps.fetch(url, { method: 'GET', headers, signal: controller.signal });
    const body = res.status === 200 ? await res.text() : '';
    return { status: res.status, etag: res.headers.get('etag'), body };
  } finally {
    clearTimeout(timer);
  }
}

function errorText(e: unknown): string {
  if (e instanceof Error) return e.name === 'AbortError' ? 'timed out' : e.message;
  return String(e);
}
