import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { cacheRepo } from '../db/repos/cacheRepo';
import { freshDb } from '../db/testUtils';
import { isKickoffPassed, MAX_CLOCK_SKEW_MS } from '../domain/stakes';
import { FeedProvider, useFeed, useFeedStore } from './FeedProvider';
import { compareVersions, createFeedStore, isFeedStale } from './feedStore';
import { BASE_URL, fakeServer, sample, scenario } from './testServer';

const HOUR = 60 * 60 * 1000;

function setup(files = scenario('day1-normal'), at = '2026-11-09T09:00:00Z') {
  const server = fakeServer(files);
  const db = freshDb();
  let now = new Date(at);
  const store = createFeedStore({
    fetch: server.fetch,
    cache: cacheRepo(db),
    baseUrl: BASE_URL,
    now: () => now,
    appVersion: '0.1.0',
  });
  return { server, db, store, setNow: (iso: string) => (now = new Date(iso)) };
}

describe('feed store', () => {
  it('starts empty', () => {
    const { store } = setup();
    expect(store.getState()).toMatchObject({
      signals: null,
      generatedAt: null,
      isStale: false,
      isOffline: false,
      isRefreshing: false,
    });
    expect(store.clock().feedGeneratedAt).toBeUndefined();
  });

  it('refresh loads all three files', async () => {
    const { store, server } = setup();
    const s = await store.refresh();
    expect(server.requests.map((r) => r.url).sort()).toEqual(
      ['meta', 'results', 'signals'].map((k) => `${BASE_URL}${k}.json`),
    );
    expect(s.signals?.signals).toHaveLength(9);
    expect(s.results).not.toBeNull();
    expect(s.meta?.model_version).toBe('dc-elo-0.1.0');
    expect(s).toMatchObject({
      generatedAt: '2026-11-09T07:00:00Z',
      lastFetchedAt: '2026-11-09T09:00:00.000Z',
      isStale: false,
      isOffline: false,
      isRefreshing: false,
      updateRequired: false,
      errors: {},
    });
  });

  it('flags isRefreshing while in flight and shares one refresh between callers', async () => {
    const { store, server } = setup();
    const p1 = store.refresh();
    const p2 = store.refresh();
    expect(store.getState().isRefreshing).toBe(true);
    expect(await p1).toBe(await p2);
    expect(server.requests).toHaveLength(3);
    await store.refresh(['results']);
    expect(server.requests).toHaveLength(4);
  });

  it('notifies subscribers until they unsubscribe', async () => {
    const { store } = setup();
    const listener = jest.fn();
    const off = store.subscribe(listener);
    await store.refresh();
    expect(listener).toHaveBeenCalledTimes(2); // refreshing, then done
    off();
    await store.refresh();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('load() serves the cache with no network', async () => {
    const { store, server, db, setNow } = setup();
    await store.refresh();
    const offline = createFeedStore({
      fetch: server.fetch,
      cache: cacheRepo(db),
      baseUrl: BASE_URL,
      now: () => new Date('2026-11-09T12:00:00Z'),
      appVersion: '0.1.0',
    });
    setNow('2026-11-09T12:00:00Z');
    offline.load();
    expect(offline.getState()).toMatchObject({
      generatedAt: '2026-11-09T07:00:00Z',
      lastFetchedAt: '2026-11-09T09:00:00.000Z',
    });
    expect(offline.getState().signals?.signals).toHaveLength(9);
    expect(server.requests).toHaveLength(3);
  });

  it('304: keeps the documents and moves lastFetchedAt', async () => {
    const { store, setNow } = setup();
    const first = await store.refresh();
    setNow('2026-11-09T11:00:00Z');
    const s = await store.refresh();
    expect(s.signals).toEqual(first.signals);
    expect(s.lastFetchedAt).toBe('2026-11-09T11:00:00.000Z');
  });

  it('AC-8: offline shows cached data with the offline flag and the stale warning', async () => {
    const { store, server, setNow } = setup(scenario('stale'), '2026-11-08T08:00:00Z');
    await store.refresh();
    expect(store.getState().isStale).toBe(false);

    server.setMode('network_error');
    setNow('2026-11-09T09:00:00Z'); // stale/ reference_now: 26 h after generated_at
    const s = await store.refresh();
    expect(s.isOffline).toBe(true);
    expect(s.isStale).toBe(true);
    expect(s.signals?.signals).toHaveLength(2);
    expect(s.errors.signals).toBe('Network request failed');

    server.setMode('ok');
    expect((await store.refresh()).isOffline).toBe(false);
  });

  it('a 26 h old generated_at is stale; 23 h is not', async () => {
    const { store, setNow } = setup(scenario('stale'), '2026-11-09T06:00:00Z');
    expect((await store.refresh()).isStale).toBe(false);
    setNow('2026-11-09T09:00:00Z');
    store.recheck();
    expect(store.getState().isStale).toBe(true);
  });

  it('malformed signals are rejected and the last good ones kept', async () => {
    const { store, server } = setup();
    await store.refresh();
    server.serve('signals', sample('malformed/signals-kickoff-not-utc.json'));
    const s = await store.refresh();
    expect(s.errors.signals).toMatch(/kickoff_at/);
    expect(s.errors.results).toBeUndefined();
    expect(s.signals?.signals).toHaveLength(9);
    expect(s.isOffline).toBe(false);
  });

  it('newer signal versions replace older ones in the store', async () => {
    const files = {
      signals: sample('versioned/signals.v1.json'),
      results: sample('versioned/results.json'),
      meta: sample('versioned/meta.json'),
    };
    const { store, server } = setup(files, '2026-11-09T14:00:00Z');
    await store.refresh();
    server.serve('signals', sample('versioned/signals.v2.json'));
    const s = await store.refresh();
    expect(s.generatedAt).toBe('2026-11-09T13:00:00Z');
    expect(Math.max(...s.signals!.signals.map((x) => x.version))).toBe(2);
  });

  it('min_app_version newer than the app: update required', async () => {
    const meta = JSON.parse(sample('day1-normal/meta.json'));
    const { store } = setup({
      ...scenario('day1-normal'),
      meta: JSON.stringify({ ...meta, min_app_version: '0.2.0' }),
    });
    expect((await store.refresh()).updateRequired).toBe(true);
  });

  it('an unexpected failure clears isRefreshing and is rethrown', async () => {
    const { store, db } = setup();
    db.exec('DROP TABLE cache');
    await expect(store.refresh()).rejects.toThrow();
    expect(store.getState().isRefreshing).toBe(false);
  });
});

describe('§9.5 clock skew', () => {
  const kickoff = '2026-11-09T07:05:00Z';

  it('device > 10 min behind generated_at: kickoff checks use feed time', async () => {
    const { store } = setup(scenario('day1-normal'), '2026-11-09T06:30:00Z');
    await store.refresh();
    const clock = store.clock();
    expect(clock).toEqual({
      deviceNow: new Date('2026-11-09T06:30:00Z'),
      feedGeneratedAt: '2026-11-09T07:00:00Z',
    });
    expect(isKickoffPassed('2026-11-09T06:45:00Z', clock)).toBe(true);
    expect(isKickoffPassed(kickoff, clock)).toBe(false);
  });

  it('device within 10 min: device time is used', async () => {
    const at = new Date(Date.parse('2026-11-09T07:00:00Z') - MAX_CLOCK_SKEW_MS + 60_000);
    const { store } = setup(scenario('day1-normal'), at.toISOString());
    await store.refresh();
    expect(isKickoffPassed('2026-11-09T06:55:00Z', store.clock())).toBe(false);
  });

  it('staleness is measured on the corrected clock', () => {
    const generatedAt = '2026-11-09T07:00:00Z';
    // Device clock 2 days behind: not stale even though device time says nothing.
    expect(
      isFeedStale(generatedAt, {
        deviceNow: new Date('2026-11-07T07:00:00Z'),
        feedGeneratedAt: generatedAt,
      }),
    ).toBe(false);
    expect(
      isFeedStale(generatedAt, { deviceNow: new Date(Date.parse(generatedAt) + 24 * HOUR + 1) }),
    ).toBe(true);
    expect(isFeedStale(null, { deviceNow: new Date() })).toBe(false);
  });
});

describe('compareVersions', () => {
  it.each([
    ['0.1.0', '0.1.0', 0],
    ['0.1.0', '0.2.0', -1],
    ['0.10.0', '0.9.9', 1],
    ['1.0.0', '0.99.99', 1],
    ['1.2', '1.2.0', 0],
  ])('%s vs %s', (a, b, want) => {
    expect(compareVersions(a, b)).toBe(want);
  });
});

describe('FeedProvider', () => {
  function Probe() {
    const feed = useFeed();
    return <Text>{feed.generatedAt ?? 'none'}</Text>;
  }

  it('loads the cache and refreshes on mount', async () => {
    const { store } = setup();
    await render(
      <FeedProvider store={store}>
        <Probe />
      </FeedProvider>,
    );
    expect(await screen.findByText('2026-11-09T07:00:00Z')).toBeTruthy();
  });

  it('can leave refreshing to the caller', async () => {
    const { store, server } = setup();
    await render(
      <FeedProvider store={store} refreshOnMount={false}>
        <Probe />
      </FeedProvider>,
    );
    expect(screen.getByText('none')).toBeTruthy();
    expect(server.requests).toHaveLength(0);
    await act(() => store.refresh());
    expect(screen.getByText('2026-11-09T07:00:00Z')).toBeTruthy();
  });

  it('hooks fail outside the provider', async () => {
    function Bad() {
      useFeedStore();
      return null;
    }
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(render(<Bad />)).rejects.toThrow(/FeedProvider/);
  });
});
