/**
 * Staking settings that change mid-session (design 07: "Caps apply to advice from the next day.
 * Frozen bets never change."). A session keeps its current settings plus at most one scheduled
 * change that takes effect at a UTC instant (the start of the next local day when it was made).
 */
import { assertCents } from './money';
import type { StakeSettings } from './types';

export interface ScheduledSettings {
  /** UTC ISO instant from which `settings` apply. */
  from: string;
  settings: StakeSettings;
}

export interface SessionSettings {
  /** Settings in force before `next.from` (or always, when nothing is scheduled). */
  settings: StakeSettings;
  next: ScheduledSettings | null;
}

/** The settings in force at an instant: a day's advice uses the instant the day starts. */
export function settingsAt(s: SessionSettings, at: Date | string): StakeSettings {
  if (s.next === null) return s.settings;
  const t = typeof at === 'string' ? Date.parse(at) : at.getTime();
  return t >= Date.parse(s.next.from) ? s.next.settings : s.settings;
}

/** Throws on settings the staking rules cannot use (FR-A4 to FR-A6). */
export function assertStakeSettings(s: StakeSettings): void {
  if (!(s.perBetCap > 0 && s.perBetCap <= 1)) {
    throw new RangeError(`perBetCap must be in (0, 1]: ${s.perBetCap}`);
  }
  if (!(s.dailyCap > 0 && s.dailyCap <= 1)) {
    throw new RangeError(`dailyCap must be in (0, 1]: ${s.dailyCap}`);
  }
  if (s.dailyCap < s.perBetCap) {
    throw new RangeError(`dailyCap ${s.dailyCap} is below perBetCap ${s.perBetCap}`);
  }
  assertCents(s.minStakeCents);
  if (s.minStakeCents < 1) throw new RangeError(`minStakeCents must be >= 1: ${s.minStakeCents}`);
}

export const sameSettings = (a: StakeSettings, b: StakeSettings): boolean =>
  a.perBetCap === b.perBetCap && a.dailyCap === b.dailyCap && a.minStakeCents === b.minStakeCents;

/**
 * Schedules `wanted` from `from`. A scheduled change whose time has come (`now >= next.from`)
 * becomes the current settings first; scheduling the settings already in force clears the change.
 */
export function scheduleSettings(
  s: SessionSettings,
  wanted: StakeSettings,
  now: Date,
  from: Date,
): SessionSettings {
  assertStakeSettings(wanted);
  if (from.getTime() <= now.getTime()) throw new RangeError('a change must start in the future');
  const current = settingsAt(s, now);
  if (sameSettings(current, wanted)) return { settings: current, next: null };
  return { settings: current, next: { from: from.toISOString(), settings: { ...wanted } } };
}
