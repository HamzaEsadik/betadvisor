import { cacheRepo, type CacheRepo } from '../db/repos/cacheRepo';
import { freshDb } from '../db/testUtils';
import { feedUrl, fetchFeed, readCached, type FeedClientDeps } from './feedClient';
import { BASE_URL, fakeServer, sample } from './testServer';

const T0 = new Date('2026-11-09T09:00:00Z');
const T1 = new Date('2026-11-09T10:00:00Z');

function setup(files = { signals: sample('day1-normal/signals.json') }) {
  const server = fakeServer(files);
  const cache: CacheRepo = cacheRepo(freshDb());
  let now = T0;
  const deps: FeedClientDeps = { fetch: server.fetch, cache, baseUrl: BASE_URL, now: () => now };
  return { server, cache, deps, setNow: (d: Date) => (now = d) };
}

describe('fetchFeed', () => {
  it('builds the file URL', () => {
    expect(feedUrl(BASE_URL, 'meta')).toBe('https://feed.test/feed/meta.json');
  });

  it('200: validates, caches with the ETag and returns the document', async () => {
    const { server, cache, deps } = setup();
    const out = await fetchFeed(deps, 'signals');
    expect(out.status).toBe('updated');
    expect(out.error).toBeNull();
    expect(out.doc?.signals).toHaveLength(9);
    expect(out.fetchedAt).toBe(T0.toISOString());
    const entry = cache.get('signals')!;
    expect(entry.payload).toBe(sample('day1-normal/signals.json'));
    expect(entry.etag).toBe(server.etagOf(entry.payload));
    expect(server.requests[0]).toEqual({ url: `${BASE_URL}signals.json`, ifNoneMatch: null });
  });

  it('asks every HTTP cache on the way to revalidate (Cache-Control: no-cache)', async () => {
    const seen: Record<string, string>[] = [];
    const { deps } = setup();
    const inner = deps.fetch;
    deps.fetch = (url, init) => {
      seen.push({ ...(init?.headers as Record<string, string>) });
      return inner(url, init);
    };
    await fetchFeed(deps, 'signals');
    expect(seen[0]).toMatchObject({ 'Cache-Control': 'no-cache', Accept: 'application/json' });
  });

  it('304: sends If-None-Match and reuses the cache, moving only the fetch time', async () => {
    const { server, cache, deps, setNow } = setup();
    const first = await fetchFeed(deps, 'signals');
    setNow(T1);
    const out = await fetchFeed(deps, 'signals');
    expect(server.requests[1]!.ifNoneMatch).toBe(cache.get('signals')!.etag);
    expect(out.status).toBe('not_modified');
    expect(out.doc).toEqual(first.doc);
    expect(out.fetchedAt).toBe(T1.toISOString());
    expect(cache.get('signals')!.fetchedAt).toBe(T1.toISOString());
  });

  it.each([
    'signals-extra-field.json',
    'signals-truncated.json',
    'signals-schema-version-2.json',
    'signals-recommended-with-skip-reason.json',
  ])('malformed (%s): rejected and the old cache kept', async (file) => {
    const { server, cache, deps, setNow } = setup();
    await fetchFeed(deps, 'signals');
    const before = cache.get('signals');
    server.serve('signals', sample(`malformed/${file}`));
    setNow(T1);
    const out = await fetchFeed(deps, 'signals');
    expect(out.status).toBe('rejected');
    expect(out.error).toBeTruthy();
    expect(out.doc?.generated_at).toBe('2026-11-09T07:00:00Z');
    expect(out.fetchedAt).toBe(T0.toISOString());
    expect(cache.get('signals')).toEqual(before);
  });

  it('malformed with no cache: nothing to show, nothing cached', async () => {
    const { cache, deps } = setup({ signals: sample('malformed/signals-missing-odds.json') });
    const out = await fetchFeed(deps, 'signals');
    expect(out).toMatchObject({ status: 'rejected', doc: null, fetchedAt: null });
    expect(cache.get('signals')).toBeUndefined();
  });

  it('network error: offline, cached document served', async () => {
    const { server, deps } = setup();
    await fetchFeed(deps, 'signals');
    server.setMode('network_error');
    const out = await fetchFeed(deps, 'signals');
    expect(out.status).toBe('offline');
    expect(out.error).toBe('Network request failed');
    expect(out.doc?.signals).toHaveLength(9);
  });

  it('times out after the configured delay', async () => {
    const { server, deps } = setup();
    server.setMode('hang');
    const out = await fetchFeed({ ...deps, timeoutMs: 20 }, 'signals');
    expect(out).toMatchObject({ status: 'offline', error: 'timed out', doc: null });
  });

  it('HTTP error: cache kept', async () => {
    const { server, deps } = setup();
    await fetchFeed(deps, 'signals');
    server.setMode({ status: 503 });
    const out = await fetchFeed(deps, 'signals');
    expect(out.status).toBe('http_error');
    expect(out.error).toBe('HTTP 503');
    expect(out.doc).not.toBeNull();
  });

  it('a feed older than the cache (lagging CDN) does not replace it', async () => {
    const { server, cache, deps } = setup({ signals: sample('versioned/signals.v2.json') });
    await fetchFeed(deps, 'signals');
    server.serve('signals', sample('versioned/signals.v1.json'));
    const out = await fetchFeed(deps, 'signals');
    expect(out.status).toBe('older_ignored');
    expect(out.doc?.generated_at).toBe('2026-11-09T13:00:00Z');
    expect(cache.get('signals')!.payload).toBe(sample('versioned/signals.v2.json'));
  });

  it('a newer version replaces the cache', async () => {
    const { server, deps } = setup({ signals: sample('versioned/signals.v1.json') });
    await fetchFeed(deps, 'signals');
    server.serve('signals', sample('versioned/signals.v2.json'));
    const out = await fetchFeed(deps, 'signals');
    expect(out.status).toBe('updated');
    expect(out.doc?.signals.map((s) => s.version).sort()).toEqual([1, 2]);
  });

  it('an unreadable cache is ignored and refetched without If-None-Match', async () => {
    const { server, cache, deps } = setup();
    const body = sample('day1-normal/signals.json');
    cache.put({
      key: 'signals',
      fetchedAt: T0.toISOString(),
      etag: server.etagOf(body),
      payload: '{',
    });
    expect(readCached(cache, 'signals')).toBeNull();
    const out = await fetchFeed(deps, 'signals');
    expect(server.requests[0]!.ifNoneMatch).toBeNull();
    expect(out.status).toBe('updated');
  });

  it('a 304 with no usable cache retries unconditionally', async () => {
    const { cache, deps } = setup();
    const calls: (string | null)[] = [];
    const body = sample('day1-normal/signals.json');
    const fetch304 = (async (_u: string, init?: RequestInit) => {
      const h = (init?.headers ?? {}) as Record<string, string>;
      calls.push(h['If-None-Match'] ?? null);
      return {
        status: calls.length === 1 ? 304 : 200,
        headers: { get: () => null },
        text: async () => body,
      };
    }) as unknown as typeof fetch;
    const out = await fetchFeed({ ...deps, fetch: fetch304 }, 'signals');
    expect(calls).toEqual([null, null]);
    expect(out.status).toBe('updated');
    expect(cache.get('signals')!.etag).toBeNull();
  });

  it('non-Error throws are reported as text', async () => {
    const { deps } = setup();
    const boom = (async () => {
      throw 'boom';
    }) as unknown as typeof fetch;
    const out = await fetchFeed({ ...deps, fetch: boom }, 'signals');
    expect(out).toMatchObject({ status: 'offline', error: 'boom' });
  });
});
