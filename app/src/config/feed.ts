/**
 * Feed location and app version. The base URL comes from `app.json` → `extra.feedBaseUrl`. Dev
 * builds can override it with `EXPO_PUBLIC_FEED_BASE_URL`, e.g. to serve `feed-samples/` locally
 * (`npm run feed:samples`, then `EXPO_PUBLIC_FEED_BASE_URL=http://10.0.2.2:8787/day1-normal/`).
 */
import Constants from 'expo-constants';

export const FEED_TIMEOUT_MS = 10_000;

/** FR-A9: older feeds get a warning. */
export const FEED_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

interface FeedConfigInput {
  extra?: Record<string, unknown> | null;
  devOverride?: string;
  isDev: boolean;
}

export function resolveFeedBaseUrl({ extra, devOverride, isDev }: FeedConfigInput): string {
  const raw = (isDev && devOverride) || extra?.feedBaseUrl;
  if (typeof raw !== 'string' || !/^https?:\/\//.test(raw)) {
    throw new Error('feedBaseUrl is missing from app.json extra');
  }
  if (!isDev && !raw.startsWith('https://')) {
    throw new Error('release builds only fetch the feed over HTTPS');
  }
  return raw.endsWith('/') ? raw : `${raw}/`;
}

export function feedBaseUrl(): string {
  return resolveFeedBaseUrl({
    extra: Constants.expoConfig?.extra,
    devOverride: process.env.EXPO_PUBLIC_FEED_BASE_URL,
    isDev: __DEV__,
  });
}

export function appVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}
