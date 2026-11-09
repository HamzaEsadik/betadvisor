import type { SqlDriver } from '../driver';

export type CacheKey = 'signals' | 'results' | 'meta';

export interface CacheEntry {
  key: CacheKey;
  fetchedAt: string;
  etag: string | null;
  /** Raw JSON text, stored only after schema validation (Part 10). */
  payload: string;
}

interface CacheRow {
  key: CacheKey;
  fetched_at: string;
  etag: string | null;
  payload: string;
}

export function cacheRepo(db: SqlDriver) {
  return {
    get(key: CacheKey): CacheEntry | undefined {
      const r = db.get<CacheRow>('SELECT * FROM cache WHERE key = ?', [key]);
      return r && { key: r.key, fetchedAt: r.fetched_at, etag: r.etag, payload: r.payload };
    },

    put(e: CacheEntry): void {
      db.run(
        `INSERT INTO cache (key, fetched_at, etag, payload) VALUES (?, ?, ?, ?)
         ON CONFLICT (key) DO UPDATE
         SET fetched_at = excluded.fetched_at, etag = excluded.etag, payload = excluded.payload`,
        [e.key, e.fetchedAt, e.etag, e.payload],
      );
    },

    /** A 304 response: the payload is still good, only the fetch time moves. */
    touch(key: CacheKey, fetchedAt: string): boolean {
      return (
        db.run('UPDATE cache SET fetched_at = ? WHERE key = ?', [fetchedAt, key]).changes === 1
      );
    },
  };
}

export type CacheRepo = ReturnType<typeof cacheRepo>;
