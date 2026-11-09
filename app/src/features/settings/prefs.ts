/**
 * App-wide preferences in the `settings` table (design 07). A missing key means the default; a
 * stored value of the wrong shape fails loudly instead of being replaced by a default.
 */
import type { SqlDriver } from '@/src/db/driver';
import { repos } from '@/src/db/repos';
import type { ThemeMode } from '@/src/theme';

export const CURRENCIES = ['$', '€', '£'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const THEME_MODES: readonly ThemeMode[] = ['dark', 'light', 'system'];

/** `HH:MM`, 24-hour. */
export type ClockTime = string;
const CLOCK_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface Prefs {
  /** FR-B5: pick which recommended bets to follow (off: Follow advice takes them all). */
  chooseIndividually: boolean;
  /** FR-N1, scheduled in Part 15. */
  notificationsEnabled: boolean;
  notificationTime: ClockTime;
  /** Display only. */
  currency: Currency;
  theme: ThemeMode;
}

export const DEFAULT_PREFS: Readonly<Prefs> = Object.freeze({
  chooseIndividually: false,
  notificationsEnabled: true,
  notificationTime: '07:30',
  currency: '$',
  theme: 'system',
});

const KEYS: { [K in keyof Prefs]: string } = {
  chooseIndividually: 'choose_individually',
  notificationsEnabled: 'notifications_enabled',
  notificationTime: 'notification_time',
  currency: 'currency',
  theme: 'theme',
};

const VALID: { [K in keyof Prefs]: (v: unknown) => v is Prefs[K] } = {
  chooseIndividually: (v): v is boolean => typeof v === 'boolean',
  notificationsEnabled: (v): v is boolean => typeof v === 'boolean',
  notificationTime: (v): v is string => typeof v === 'string' && CLOCK_RE.test(v),
  currency: (v): v is Currency => (CURRENCIES as readonly unknown[]).includes(v),
  theme: (v): v is ThemeMode => (THEME_MODES as readonly unknown[]).includes(v),
};

export function readPref<K extends keyof Prefs>(db: SqlDriver, key: K): Prefs[K] {
  const v = repos(db).settings.get<unknown>(KEYS[key]);
  if (v === undefined) return DEFAULT_PREFS[key];
  if (!VALID[key](v)) throw new Error(`setting ${KEYS[key]}: bad value ${JSON.stringify(v)}`);
  return v;
}

export function readPrefs(db: SqlDriver): Prefs {
  const out = {} as Record<keyof Prefs, unknown>;
  for (const key of Object.keys(KEYS) as (keyof Prefs)[]) out[key] = readPref(db, key);
  return out as Prefs;
}

export function writePref<K extends keyof Prefs>(db: SqlDriver, key: K, value: Prefs[K]): void {
  if (!VALID[key](value)) throw new Error(`setting ${KEYS[key]}: bad value ${String(value)}`);
  repos(db).settings.set(KEYS[key], value);
}
