/**
 * FR-N2: the periodic background task. Android runs it through WorkManager no more often than
 * every 15 minutes, and decides when it actually runs. It fetches `results.json` into the shared
 * feed cache (the UI reads it on its next load), settles bets and flags stale ones.
 */
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { fetchFeed } from '../api/feedClient';
import type { SqlDriver } from '../db/driver';
import { cacheRepo } from '../db/repos';
import { settleAndFlag, type SettlePass } from './settle';

export const SETTLEMENT_TASK = 'betadvisor-settle-results';
/** Minutes; the platform minimum. */
export const SETTLEMENT_INTERVAL_MIN = 15;

export interface SettlementTaskDeps {
  db: SqlDriver;
  fetch: typeof fetch;
  baseUrl: string;
  now: () => Date;
}

export interface SettlementRun {
  result: BackgroundTask.BackgroundTaskResult;
  pass: SettlePass | null;
}

const { Success, Failed } = BackgroundTask.BackgroundTaskResult;

/** The task body. Never throws: a failure is logged and reported to the scheduler. */
export async function runSettlementTask(deps: SettlementTaskDeps): Promise<SettlementRun> {
  try {
    const out = await fetchFeed(
      { fetch: deps.fetch, cache: cacheRepo(deps.db), baseUrl: deps.baseUrl, now: deps.now },
      'results',
    );
    const fetched = out.error === null || out.status === 'older_ignored';
    if (!fetched) console.warn(`background results fetch: ${out.status}: ${out.error}`);
    // Offline or a bad payload: still settle from the last good cache, which is valid data.
    const pass = settleAndFlag(deps.db, out.doc, deps.now());
    return { result: fetched && pass.errors.length === 0 ? Success : Failed, pass };
  } catch (e) {
    console.error('background settlement failed', e);
    return { result: Failed, pass: null };
  }
}

/**
 * Defines the task. It must run at module scope when the bundle loads (also in the headless
 * runtime Android starts for the task), so `app/_layout.tsx` calls it on import.
 */
export function defineSettlementTask(deps: () => SettlementTaskDeps): void {
  if (TaskManager.isTaskDefined(SETTLEMENT_TASK)) return;
  TaskManager.defineTask(SETTLEMENT_TASK, async () => (await runSettlementTask(deps())).result);
}

/** Registers the task with the scheduler (on app start). Returns false where it is unavailable. */
export async function registerSettlementTask(): Promise<boolean> {
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
    console.warn('background tasks are restricted; settlement runs when the app opens');
    return false;
  }
  if (!(await TaskManager.isTaskRegisteredAsync(SETTLEMENT_TASK))) {
    await BackgroundTask.registerTaskAsync(SETTLEMENT_TASK, {
      minimumInterval: SETTLEMENT_INTERVAL_MIN,
    });
  }
  return true;
}
