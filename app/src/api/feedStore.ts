/**
 * The app's view of the feed: the last good signals, results and meta, plus freshness flags
 * (FR-A9 stale, NFR-R1 offline, `min_app_version`). Framework-free so it can run in tests and the
 * background task; `FeedProvider.tsx` exposes it to React.
 */
import { FEED_STALE_AFTER_MS } from '../config/feed';
import { referenceNow, type Clock } from '../domain/stakes';
import { fetchFeed, readCached, type FeedClientDeps, type FetchOutcome } from './feedClient';
import type { FeedKind, MetaFeed, ResultsFeed, SignalsFeed } from './schemas';

export const FEED_KINDS: readonly FeedKind[] = ['signals', 'results', 'meta'];

export interface FeedState {
  signals: SignalsFeed | null;
  results: ResultsFeed | null;
  meta: MetaFeed | null;
  /** When the server last confirmed the signals in use (200 or 304). */
  lastFetchedAt: string | null;
  /** `generated_at` of the signals in use. */
  generatedAt: string | null;
  /** FR-A9: the signals in use were generated more than 24 h ago. */
  isStale: boolean;
  /** NFR-R1: the last refresh could not reach the server; cached data is shown. */
  isOffline: boolean;
  isRefreshing: boolean;
  /** `meta.min_app_version` is newer than this app. */
  updateRequired: boolean;
  /** Per-file problem from the last refresh (rejected payload, HTTP error, network error). */
  errors: Partial<Record<FeedKind, string>>;
}

export interface FeedStoreDeps extends FeedClientDeps {
  appVersion: string;
}

export interface FeedStore {
  getState(): FeedState;
  subscribe(listener: () => void): () => void;
  /** Loads the cached documents without touching the network. */
  load(): void;
  /** Fetches the given files (all by default). Concurrent calls share one in-flight refresh. */
  refresh(kinds?: readonly FeedKind[]): Promise<FeedState>;
  /** Recomputes time-dependent flags (call on app foreground or a timer). */
  recheck(): void;
  /** The clock for kickoff checks: device time, corrected by the feed time (§9.5). */
  clock(): Clock;
}

const EMPTY: FeedState = {
  signals: null,
  results: null,
  meta: null,
  lastFetchedAt: null,
  generatedAt: null,
  isStale: false,
  isOffline: false,
  isRefreshing: false,
  updateRequired: false,
  errors: {},
};

/** Compares `X.Y.Z` versions numerically. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

export function isFeedStale(generatedAt: string | null, clock: Clock): boolean {
  if (generatedAt === null) return false;
  return referenceNow(clock).getTime() - Date.parse(generatedAt) > FEED_STALE_AFTER_MS;
}

export function createFeedStore(deps: FeedStoreDeps): FeedStore {
  let state = EMPTY;
  let inFlight: Promise<FeedState> | null = null;
  const listeners = new Set<() => void>();

  const clockFor = (generatedAt: string | null): Clock =>
    generatedAt === null
      ? { deviceNow: deps.now() }
      : { deviceNow: deps.now(), feedGeneratedAt: generatedAt };

  function set(patch: Partial<FeedState>) {
    const next = { ...state, ...patch };
    next.generatedAt = next.signals?.generated_at ?? null;
    next.isStale = isFeedStale(next.generatedAt, clockFor(next.generatedAt));
    next.updateRequired =
      next.meta !== null && compareVersions(deps.appVersion, next.meta.min_app_version) < 0;
    state = next;
    listeners.forEach((l) => l());
  }

  async function run(kinds: readonly FeedKind[]): Promise<FeedState> {
    set({ isRefreshing: true });
    let outcomes: FetchOutcome<FeedKind>[];
    try {
      outcomes = await Promise.all(kinds.map((k) => fetchFeed(deps, k)));
    } catch (e) {
      set({ isRefreshing: false });
      throw e;
    }
    const patch: Partial<FeedState> = { isRefreshing: false, errors: {} };
    const errors: Partial<Record<FeedKind, string>> = {};
    for (const o of outcomes) {
      (patch as Record<FeedKind, unknown>)[o.kind] = o.doc;
      if (o.kind === 'signals') patch.lastFetchedAt = o.fetchedAt;
      if (o.error !== null && o.status !== 'older_ignored') errors[o.kind] = o.error;
    }
    patch.errors = errors;
    patch.isOffline = outcomes.some((o) => o.status === 'offline');
    set(patch);
    return state;
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    load() {
      const signals = readCached(deps.cache, 'signals');
      set({
        signals: signals?.doc ?? null,
        results: readCached(deps.cache, 'results')?.doc ?? null,
        meta: readCached(deps.cache, 'meta')?.doc ?? null,
        lastFetchedAt: signals?.fetchedAt ?? null,
      });
    },

    refresh(kinds = FEED_KINDS) {
      inFlight ??= run(kinds).finally(() => {
        inFlight = null;
      });
      return inFlight;
    },

    recheck: () => set({}),

    clock: () => clockFor(state.generatedAt),
  };
}
