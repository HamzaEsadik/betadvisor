/**
 * Foreground side of FR-R1 and FR-R6: settles bets whenever the feed store gets new results or a
 * refresh ends (app open, pull to refresh, Settings › Refresh data). When the app returns to the
 * foreground it re-flags stale bets and refreshes the feed if it was fetched over an hour ago.
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';

import type { FeedState, FeedStore } from '../api/feedStore';
import { FOREGROUND_REFRESH_AFTER_MS } from '../config/feed';
import type { SqlDriver } from '../db/driver';
import { changedAnything, settleAndFlag } from './settle';

export interface FeedSyncDeps {
  store: FeedStore;
  db: SqlDriver;
  now: () => Date;
  /** Called after a pass that changed the database. */
  onChange: () => void;
}

/** No fetch yet, or the last one is more than an hour old. */
export function needsForegroundRefresh(state: FeedState, now: Date): boolean {
  if (state.isRefreshing) return false;
  if (state.lastFetchedAt === null) return true;
  return now.getTime() - Date.parse(state.lastFetchedAt) > FOREGROUND_REFRESH_AFTER_MS;
}

export function useFeedSync({ store, db, now, onChange }: FeedSyncDeps): void {
  useEffect(() => {
    const pass = () => {
      if (changedAnything(settleAndFlag(db, store.getState().results, now()))) onChange();
    };

    let prev = store.getState();
    pass();
    const unsubscribe = store.subscribe(() => {
      const next = store.getState();
      const refreshEnded = prev.isRefreshing && !next.isRefreshing;
      const newResults = next.results !== prev.results;
      prev = next;
      if (refreshEnded || newResults) pass();
    });

    let appState: string | null | undefined = AppState.currentState;
    const sub = AppState.addEventListener('change', (nextState) => {
      const cameBack = appState !== 'active' && nextState === 'active';
      appState = nextState;
      if (!cameBack) return;
      store.recheck();
      pass();
      if (needsForegroundRefresh(store.getState(), now())) void store.refresh();
    });

    return () => {
      unsubscribe();
      sub.remove();
    };
  }, [store, db, now, onChange]);
}
