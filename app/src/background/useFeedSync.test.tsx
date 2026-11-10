/** Part 15: foreground settlement and the 1 h foreground refresh (FR-R1, FR-R6). */
import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { createFeedStore } from '../api/feedStore';
import { parseFeed } from '../api/schemas';
import { BASE_URL, fakeServer, sample, scenario } from '../api/testServer';
import { repos } from '../db/repos';
import { followAdvice } from '../db/services';
import { freshDb, utc } from '../db/testUtils';
import { startFirstSession } from '../features/app/session';
import { needsForegroundRefresh, useFeedSync } from './useFeedSync';

const MORNING = '2026-11-09T09:00:00Z';

let appStateListener: ((s: AppStateStatus) => void) | null = null;
beforeEach(() => {
  appStateListener = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as (s: AppStateStatus) => void;
    return { remove: () => (appStateListener = null) } as ReturnType<
      typeof AppState.addEventListener
    >;
  });
});
afterEach(() => jest.restoreAllMocks());

async function setup() {
  const db = freshDb();
  let now = new Date(MORNING);
  startFirstSession(db, 107_20, now);
  const feed = parseFeed('signals', sample('day1-normal/signals.json'));
  if (!feed.ok) throw new Error(feed.error);
  followAdvice(
    db,
    feed.data.signals,
    { deviceNow: now, feedGeneratedAt: feed.data.generated_at },
    utc,
  );

  const server = fakeServer(scenario('day1-normal'));
  const store = createFeedStore({
    fetch: server.fetch,
    cache: repos(db).cache,
    baseUrl: BASE_URL,
    now: () => now,
    appVersion: '0.1.0',
  });
  const onChange = jest.fn();
  const clock = () => now;
  const hook = await renderHook(() => useFeedSync({ store, db, now: clock, onChange }));
  const open = () => repos(db).bets.listOpen();
  return {
    db,
    server,
    store,
    onChange,
    hook,
    open,
    setNow: (iso: string) => (now = new Date(iso)),
  };
}

describe('useFeedSync', () => {
  it('settles when a refresh brings results (app open, pull to refresh)', async () => {
    const t = await setup();
    await act(() => t.store.refresh());
    expect(t.open()).toHaveLength(3);
    expect(t.onChange).not.toHaveBeenCalled();

    t.server.serve('results', sample('day1-results/results.json'));
    t.setNow('2026-11-09T23:45:00Z');
    await act(() => t.store.refresh());
    expect(t.open()).toHaveLength(0);
    expect(t.onChange).toHaveBeenCalledTimes(1);

    // A second refresh (304) settles nothing more.
    await act(() => t.store.refresh());
    expect(t.onChange).toHaveBeenCalledTimes(1);
  });

  it('settles from the cache already loaded when it mounts', async () => {
    const db = freshDb();
    const now = new Date('2026-11-09T23:45:00Z');
    startFirstSession(db, 107_20, new Date(MORNING));
    const feed = parseFeed('signals', sample('day1-normal/signals.json'));
    if (!feed.ok) throw new Error(feed.error);
    followAdvice(
      db,
      feed.data.signals,
      { deviceNow: new Date(MORNING), feedGeneratedAt: feed.data.generated_at },
      utc,
    );
    repos(db).cache.put({
      key: 'results',
      fetchedAt: now.toISOString(),
      etag: null,
      payload: sample('day1-results/results.json'),
    });
    const store = createFeedStore({
      fetch: fakeServer().fetch,
      cache: repos(db).cache,
      baseUrl: BASE_URL,
      now: () => now,
      appVersion: '0.1.0',
    });
    store.load();
    const onChange = jest.fn();
    await renderHook(() => useFeedSync({ store, db, now: () => now, onChange }));
    expect(repos(db).bets.listOpen()).toHaveLength(0);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('on return to the foreground: flags stale bets, and refreshes only a feed over 1 h old', async () => {
    const t = await setup();
    await act(() => t.store.refresh());
    const fetches = t.server.requests.length;

    t.setNow('2026-11-09T09:50:00Z');
    await act(async () => {
      appStateListener?.('background');
      appStateListener?.('active');
    });
    expect(t.server.requests.length).toBe(fetches);

    // 73 h after the 20:00 kickoffs, the results never came.
    t.setNow('2026-11-12T21:30:00Z');
    await act(async () => {
      appStateListener?.('background');
      appStateListener?.('active');
      await Promise.resolve();
    });
    expect(t.server.requests.length).toBe(fetches + 3);
    expect(t.open().every((b) => b.reviewFlag)).toBe(true);
    expect(t.onChange).toHaveBeenCalled();
  });

  it('stops listening on unmount', async () => {
    const t = await setup();
    await t.hook.unmount();
    expect(appStateListener).toBeNull();
  });
});

describe('needsForegroundRefresh', () => {
  const state = (lastFetchedAt: string | null, isRefreshing = false) =>
    ({ lastFetchedAt, isRefreshing }) as Parameters<typeof needsForegroundRefresh>[0];
  const now = new Date('2026-11-09T12:00:00Z');

  it('refreshes a feed never fetched or fetched over an hour ago', () => {
    expect(needsForegroundRefresh(state(null), now)).toBe(true);
    expect(needsForegroundRefresh(state('2026-11-09T10:59:59Z'), now)).toBe(true);
    expect(needsForegroundRefresh(state('2026-11-09T11:00:00Z'), now)).toBe(false);
    expect(needsForegroundRefresh(state(null, true), now)).toBe(false);
  });
});
