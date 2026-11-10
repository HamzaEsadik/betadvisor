/** Part 15: the background settlement task (FR-N2, FR-R1, FR-R5, FR-R6). */
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { parseFeed } from '../api/schemas';
import { BASE_URL, fakeServer, sample } from '../api/testServer';
import { assertConsistent } from '../db/consistency';
import type { SqlDriver } from '../db/driver';
import { repos } from '../db/repos';
import { followAdvice } from '../db/services';
import { freshDb, utc } from '../db/testUtils';
import { startFirstSession } from '../features/app/session';
import {
  SETTLEMENT_INTERVAL_MIN,
  SETTLEMENT_TASK,
  defineSettlementTask,
  registerSettlementTask,
  runSettlementTask,
} from './task';

jest.mock('expo-background-task', () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
  getStatusAsync: jest.fn(() => Promise.resolve(2)),
  registerTaskAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-task-manager', () => {
  const defined = new Map<string, () => Promise<unknown>>();
  return {
    __defined: defined,
    defineTask: jest.fn((name: string, fn: () => Promise<unknown>) => defined.set(name, fn)),
    isTaskDefined: jest.fn((name: string) => defined.has(name)),
    isTaskRegisteredAsync: jest.fn(() => Promise.resolve(false)),
  };
});

const { Success, Failed } = BackgroundTask.BackgroundTaskResult;
const MORNING = new Date('2026-11-09T09:00:00Z');
const NIGHT = new Date('2026-11-09T23:45:00Z');

function signals(scenario: string) {
  const r = parseFeed('signals', sample(`${scenario}/signals.json`));
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

/** Day 1 of design 02: three bets frozen on a $107.20 budget. */
function followedDay1(): SqlDriver {
  const db = freshDb();
  startFirstSession(db, 107_20, MORNING);
  const feed = signals('day1-normal');
  const out = followAdvice(
    db,
    feed.signals,
    { deviceNow: MORNING, feedGeneratedAt: feed.generated_at },
    utc,
  );
  expect(out.frozen).toHaveLength(3);
  return db;
}

function setup(results = 'day1-results') {
  const db = followedDay1();
  const server = fakeServer({ results: sample(`${results}/results.json`) });
  let now = NIGHT;
  const deps = { db, fetch: server.fetch, baseUrl: BASE_URL, now: () => now };
  const r = repos(db);
  const session = r.sessions.getActive()!;
  return {
    db,
    server,
    deps,
    setNow: (iso: string) => (now = new Date(iso)),
    bets: () => r.bets.listBySession(session.id),
    bankroll: () => r.bankroll.current(session.id),
  };
}

describe('runSettlementTask', () => {
  it('fetches results, settles the open bets and books the payouts', async () => {
    const t = setup();
    const before = t.bankroll();
    expect(before).toBe(107_20 - 5_03);

    const run = await runSettlementTask(t.deps);
    expect(run).toMatchObject({ result: Success, pass: { settled: 3, flagged: 0, errors: [] } });

    const bets = t.bets();
    const byTeam = Object.fromEntries(bets.map((b) => [b.homeTeam, b]));
    expect(byTeam['Arsenal']!.status).toBe('won');
    expect(byTeam['Bayern']!.status).toBe('lost');
    expect(byTeam['Real Madrid']!.status).toBe('void');
    const payouts = bets.reduce((t2, b) => t2 + (b.payoutCents ?? 0), 0);
    expect(t.bankroll()).toBe(before + payouts);
    // The void bet returns its stake.
    expect(byTeam['Real Madrid']!.payoutCents).toBe(byTeam['Real Madrid']!.stakeCents);
    assertConsistent(t.db);
    // The results landed in the feed cache the UI loads from.
    expect(repos(t.db).cache.get('results')).toBeTruthy();
  });

  it('is idempotent: a second run settles nothing and leaves the bankroll alone (FR-R5)', async () => {
    const t = setup();
    await runSettlementTask(t.deps);
    const after = t.bankroll();
    const history = repos(t.db).bankroll.listBySession(t.bets()[0]!.sessionId).length;

    t.setNow('2026-11-10T02:00:00Z');
    const again = await runSettlementTask(t.deps);
    expect(again).toMatchObject({ result: Success, pass: { settled: 0, flagged: 0 } });
    expect(t.bankroll()).toBe(after);
    expect(repos(t.db).bankroll.listBySession(t.bets()[0]!.sessionId)).toHaveLength(history);
    // The second fetch was conditional and answered 304.
    expect(t.server.requests.at(-1)?.ifNoneMatch).not.toBeNull();
    assertConsistent(t.db);
  });

  it('offline: settles from the cached results and reports a failed run', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const t = setup();
    // The UI cached the results earlier; the device is now offline.
    repos(t.db).cache.put({
      key: 'results',
      fetchedAt: '2026-11-09T23:40:00Z',
      etag: null,
      payload: sample('day1-results/results.json'),
    });
    t.server.setMode('network_error');
    const run = await runSettlementTask(t.deps);
    expect(run).toMatchObject({ result: Failed, pass: { settled: 3 } });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('offline'));
    warn.mockRestore();
    expect(t.bets().every((b) => b.status !== 'open')).toBe(true);
    assertConsistent(t.db);
  });

  it('flags bets still open 72 h after kickoff (FR-R6)', async () => {
    // day1-normal's results do not cover today's matches.
    const t = setup('day1-normal');
    t.setNow('2026-11-12T12:00:00Z');
    expect((await runSettlementTask(t.deps)).pass).toMatchObject({ settled: 0, flagged: 0 });

    t.setNow('2026-11-13T00:00:00Z');
    const run = await runSettlementTask(t.deps);
    expect(run.pass!.flagged).toBe(3);
    expect(t.bets().every((b) => b.status === 'open' && b.reviewFlag)).toBe(true);
    // Flagging is idempotent too.
    expect((await runSettlementTask(t.deps)).pass!.flagged).toBe(0);
  });

  it('never throws: an unexpected error is logged and the run fails', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const t = setup();
    const broken = { ...t.deps, now: () => new Date(NaN) };
    const run = await runSettlementTask(broken);
    expect(run).toEqual({ result: Failed, pass: null });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('task registration', () => {
  it('defines the task once, and its executor runs the settlement', async () => {
    const t = setup();
    defineSettlementTask(() => t.deps);
    defineSettlementTask(() => t.deps);
    expect(TaskManager.defineTask).toHaveBeenCalledTimes(1);
    const executor = (
      TaskManager as unknown as { __defined: Map<string, () => Promise<unknown>> }
    ).__defined.get(SETTLEMENT_TASK)!;
    await expect(executor()).resolves.toBe(Success);
    expect(t.bets().every((b) => b.status !== 'open')).toBe(true);
  });

  it('registers with a 15 minute minimum interval when background work is available', async () => {
    await expect(registerSettlementTask()).resolves.toBe(true);
    expect(BackgroundTask.registerTaskAsync).toHaveBeenCalledWith(SETTLEMENT_TASK, {
      minimumInterval: 15,
    });
    expect(SETTLEMENT_INTERVAL_MIN).toBe(15);
  });

  it('does not register again once registered, and skips restricted devices', async () => {
    jest.mocked(BackgroundTask.registerTaskAsync).mockClear();
    jest.mocked(TaskManager.isTaskRegisteredAsync).mockResolvedValueOnce(true);
    await expect(registerSettlementTask()).resolves.toBe(true);
    expect(BackgroundTask.registerTaskAsync).not.toHaveBeenCalled();

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest
      .mocked(BackgroundTask.getStatusAsync)
      .mockResolvedValueOnce(BackgroundTask.BackgroundTaskStatus.Restricted);
    await expect(registerSettlementTask()).resolves.toBe(false);
    expect(BackgroundTask.registerTaskAsync).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
