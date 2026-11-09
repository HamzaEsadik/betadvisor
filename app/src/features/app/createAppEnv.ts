/** Production wiring: the on-device database and the feed store over the network. */
import { appVersion, feedBaseUrl } from '@/src/config/feed';
import { createFeedStore, type FeedStore } from '@/src/api/feedStore';
import { cacheRepo } from '@/src/db/repos';
import { openExpoDriver } from '@/src/db/expoDriver';
import { prepareDatabase } from '@/src/db/migrate';
import type { AppEnv } from './AppEnv';

export function createAppEnv(): { env: AppEnv; feed: FeedStore } {
  const db = prepareDatabase(openExpoDriver());
  const now = () => new Date();
  const feed = createFeedStore({
    fetch: (...args) => fetch(...args),
    cache: cacheRepo(db),
    baseUrl: feedBaseUrl(),
    now,
    appVersion: appVersion(),
  });
  return { env: { db, now, currency: '$' }, feed };
}
