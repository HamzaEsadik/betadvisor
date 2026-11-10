/** Production wiring: the on-device database and the feed store over the network. */
import { appVersion, feedBaseUrl } from '@/src/config/feed';
import { createFeedStore, type FeedStore } from '@/src/api/feedStore';
import type { SettlementTaskDeps } from '@/src/background/task';
import { appDatabase } from '@/src/db/appDatabase';
import { cacheRepo } from '@/src/db/repos';
import type { ThemeMode } from '@/src/theme';
import { readPref } from '../settings/prefs';
import type { AppEnv } from './AppEnv';

const now = () => new Date();

export function createAppEnv(): { env: AppEnv; feed: FeedStore; theme: ThemeMode } {
  const db = appDatabase();
  const feed = createFeedStore({
    fetch: (...args) => fetch(...args),
    cache: cacheRepo(db),
    baseUrl: feedBaseUrl(),
    now,
    appVersion: appVersion(),
  });
  return { env: { db, now, appVersion: appVersion() }, feed, theme: readPref(db, 'theme') };
}

/** What the background task runs against: the same database and feed host as the UI. */
export function settlementTaskDeps(): SettlementTaskDeps {
  return { db: appDatabase(), fetch: (...args) => fetch(...args), baseUrl: feedBaseUrl(), now };
}
