/** A fake feed host for tests: serves `feed-samples` files with ETags. Not imported by app code. */
import fs from 'node:fs';
import path from 'node:path';

import type { FeedKind } from './schemas';

export const SAMPLES = path.resolve(__dirname, '../../../feed-samples');
export const BASE_URL = 'https://feed.test/feed/';

export function sample(rel: string): string {
  return fs.readFileSync(path.join(SAMPLES, rel), 'utf8');
}

type Mode = 'ok' | 'network_error' | 'hang' | { status: number };

export interface Request {
  url: string;
  ifNoneMatch: string | null;
}

/** Fake `fetch`: each kind maps to a body; the ETag is derived from the body. */
export function fakeServer(files: Partial<Record<FeedKind, string>> = {}) {
  const bodies: Partial<Record<FeedKind, string>> = { ...files };
  const requests: Request[] = [];
  let mode: Mode = 'ok';

  const etagOf = (body: string) => `"${body.length}-${hash(body)}"`;

  const fetchImpl = (async (input: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const ifNoneMatch = headers['If-None-Match'] ?? null;
    requests.push({ url: input, ifNoneMatch });
    if (mode === 'network_error') throw new TypeError('Network request failed');
    if (mode === 'hang') {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const e = new Error('Aborted');
          e.name = 'AbortError';
          reject(e);
        });
      });
    }
    if (typeof mode === 'object') return response(mode.status, '', null);
    const kind = path.basename(input, '.json') as FeedKind;
    const body = bodies[kind];
    if (body === undefined) return response(404, '', null);
    const etag = etagOf(body);
    if (ifNoneMatch === etag) return response(304, '', etag);
    return response(200, body, etag);
  }) as unknown as typeof fetch;

  return {
    fetch: fetchImpl,
    requests,
    serve(kind: FeedKind, body: string) {
      bodies[kind] = body;
    },
    setMode(m: Mode) {
      mode = m;
    },
    etagOf,
  };
}

function response(status: number, body: string, etag: string | null) {
  return {
    status,
    headers: { get: (h: string) => (h.toLowerCase() === 'etag' ? etag : null) },
    text: async () => body,
  };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/** The three files of a `feed-samples` scenario. */
export function scenario(name: string): Record<FeedKind, string> {
  return {
    signals: sample(`${name}/signals.json`),
    results: sample(`${name}/results.json`),
    meta: sample(`${name}/meta.json`),
  };
}
