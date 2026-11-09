/** Renders the real routes over an in-memory database and a fake feed host. Tests only. */
import { renderRouter } from 'expo-router/testing-library';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import TabLayout from '@/app/(tabs)/_layout';
import LedgerRoute from '@/app/(tabs)/ledger';
import MoreRoute from '@/app/(tabs)/more';
import PerformanceRoute from '@/app/(tabs)/performance';
import SessionsRoute from '@/app/(tabs)/sessions';
import TodayRoute from '@/app/(tabs)/index';
import SetupRoute from '@/app/setup';
import SignalRoute from '@/app/signal/[id]';
import { FeedProvider } from '@/src/api/FeedProvider';
import { createFeedStore } from '@/src/api/feedStore';
import type { FeedKind } from '@/src/api/schemas';
import { BASE_URL, fakeServer, scenario } from '@/src/api/testServer';
import { repos } from '@/src/db/repos';
import { cacheRepo } from '@/src/db/repos/cacheRepo';
import { freshDb, utc } from '@/src/db/testUtils';
import { ThemeProvider } from '@/src/theme';
import { AppEnvProvider, type AppEnv } from '../app/AppEnv';
import { RootNavigator } from '../app/RootNavigator';
import { startFirstSession } from '../app/session';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

export interface AppOptions {
  /** A `feed-samples` scenario, or explicit files. */
  feed?: string | Partial<Record<FeedKind, string>>;
  /** Device time (UTC). The time zone is pinned to UTC. */
  at: string;
  /** Starts a session (disclaimer accepted) before rendering; omit for a first launch. */
  budgetCents?: number;
  /** Fetch the feed before rendering (the app does it on open). */
  prefetch?: boolean;
}

export async function renderApp({
  feed = 'day1-normal',
  at,
  budgetCents,
  prefetch = true,
}: AppOptions) {
  const server = fakeServer(typeof feed === 'string' ? scenario(feed) : feed);
  const db = freshDb();
  let now = new Date(at);
  const store = createFeedStore({
    fetch: server.fetch,
    cache: cacheRepo(db),
    baseUrl: BASE_URL,
    now: () => now,
    appVersion: '0.1.0',
  });
  const env: AppEnv = { db, now: () => now, offsetOf: utc, currency: '$' };
  if (budgetCents !== undefined) startFirstSession(db, budgetCents, now);
  if (prefetch) await store.refresh();

  function Root() {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider initialMode="dark">
          <AppEnvProvider env={env}>
            <FeedProvider store={store} refreshOnMount={false}>
              <RootNavigator />
            </FeedProvider>
          </AppEnvProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    );
  }

  const result = await renderRouter(
    {
      _layout: Root,
      '(tabs)/_layout': TabLayout,
      '(tabs)/index': TodayRoute,
      '(tabs)/ledger': LedgerRoute,
      '(tabs)/performance': PerformanceRoute,
      '(tabs)/sessions': SessionsRoute,
      '(tabs)/more': MoreRoute,
      setup: SetupRoute,
      'signal/[id]': SignalRoute,
    },
    { initialUrl: '/' },
  );

  return {
    result,
    db,
    store,
    server,
    setNow: (iso: string) => (now = new Date(iso)),
    bets: () => {
      const r = repos(db);
      const s = r.sessions.getActive();
      return s ? r.bets.listBySession(s.id) : [];
    },
    bankroll: () => {
      const r = repos(db);
      return r.bankroll.current(r.sessions.getActive()!.id);
    },
  };
}
