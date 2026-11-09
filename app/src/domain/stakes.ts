/** Device-side staking: SRS §6.4, FR-A3 to FR-A6, FR-A10, §9.1, §9.5, §9.6. */
import { assertCents, mulCents } from './money';
import type { AppSkipReason, SignalInput, SkipReason, StakeSettings } from './types';

/** §9.5: beyond this difference the device clock is not trusted for kickoff checks. */
export const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;

export interface Clock {
  deviceNow: Date;
  /** `generated_at` of the signals feed in use. */
  feedGeneratedAt?: string;
}

/**
 * The time used for kickoff checks (§9.5). A feed cannot be generated in the future, so a device
 * clock more than 10 minutes behind `generated_at` is known to be wrong; the feed time is used
 * instead.
 */
export function referenceNow(now: Date | Clock): Date {
  if (now instanceof Date) return now;
  const { deviceNow, feedGeneratedAt } = now;
  if (feedGeneratedAt === undefined) return deviceNow;
  const generated = Date.parse(feedGeneratedAt);
  if (Number.isNaN(generated)) throw new RangeError(`bad generated_at: ${feedGeneratedAt}`);
  return generated - deviceNow.getTime() > MAX_CLOCK_SKEW_MS ? new Date(generated) : deviceNow;
}

/** FR-A10: a recommendation can only be accepted before kickoff. */
export function isKickoffPassed(kickoffAt: string, now: Date | Clock): boolean {
  return Date.parse(kickoffAt) <= referenceNow(now).getTime();
}

/** Stake for one signal before the daily cap and minimum (FR-A3, FR-A4). */
export function stakeFor(
  stakeFraction: number,
  bankrollCents: number,
  settings: StakeSettings,
): number {
  const fraction = Math.min(Math.max(stakeFraction, 0), settings.perBetCap);
  return Math.max(mulCents(bankrollCents, fraction), 0);
}

/** §9.1: depleted when even a stake at the per-bet cap would fall below the minimum. */
export function isBankrollDepleted(bankrollCents: number, settings: StakeSettings): boolean {
  return stakeFor(settings.perBetCap, bankrollCents, settings) < settings.minStakeCents;
}

/** Daily exposure limit in cents (FR-A5). */
export function dailyCapCents(bankrollAtDayStartCents: number, settings: StakeSettings): number {
  return mulCents(bankrollAtDayStartCents, settings.dailyCap);
}

export interface PlannedBet {
  signal: SignalInput;
  stakeCents: number;
}

export interface SkippedSignal {
  signal: SignalInput;
  reason: SkipReason;
  /** The stake the signal would have had, when one was computed. */
  stakeCents: number | null;
}

/** A bet already frozen today: its signal is not planned again and its stake counts toward the cap. */
export interface FrozenStake {
  signalId: string;
  stakeCents: number;
}

export interface DayPlan {
  toFollow: PlannedBet[];
  skipped: SkippedSignal[];
  /** Stakes of `toFollow` plus the already frozen stakes of the day. */
  totalStakeCents: number;
  dailyCapCents: number;
  depleted: boolean;
}

function byEdgeDesc(a: SignalInput, b: SignalInput): number {
  return (
    b.edge - a.edge ||
    Date.parse(a.kickoff_at) - Date.parse(b.kickoff_at) ||
    (a.signal_id < b.signal_id ? -1 : a.signal_id > b.signal_id ? 1 : 0)
  );
}

/**
 * Plans one day's bets. Signals not recommended by the feed keep the feed's reason. Recommended
 * signals are taken in descending edge order (FR-A5); each one is checked for kickoff passed,
 * minimum stake, then the daily cap. Once a stake does not fit under the cap, every remaining
 * signal is skipped as "daily cap reached". Stakes of `frozen` bets count toward the cap.
 */
export function planDay(
  signals: readonly SignalInput[],
  bankrollAtDayStartCents: number,
  settings: StakeSettings,
  now: Date | Clock,
  frozen: readonly FrozenStake[] = [],
): DayPlan {
  assertCents(bankrollAtDayStartCents);
  const frozenIds = new Set(frozen.map((f) => f.signalId));
  const cap = dailyCapCents(bankrollAtDayStartCents, settings);
  const depleted = isBankrollDepleted(bankrollAtDayStartCents, settings);
  const toFollow: PlannedBet[] = [];
  const skipped: SkippedSignal[] = [];
  const skip = (signal: SignalInput, reason: SkipReason, stakeCents: number | null = null) =>
    skipped.push({ signal, reason, stakeCents });

  let total = frozen.reduce((sum, f) => sum + f.stakeCents, 0);
  let capReached = false;
  const takenMatches = new Set<string>();
  for (const signal of signals) {
    if (frozenIds.has(signal.signal_id)) takenMatches.add(`${signal.match_id}|${signal.market}`);
  }

  const candidates: SignalInput[] = [];
  for (const signal of signals) {
    if (frozenIds.has(signal.signal_id)) continue;
    if (!signal.recommended) skip(signal, signal.skip_reason ?? 'no_edge');
    else candidates.push(signal);
  }

  for (const signal of [...candidates].sort(byEdgeDesc)) {
    const matchKey = `${signal.match_id}|${signal.market}`;
    let reason: AppSkipReason | null = null;
    const stake = stakeFor(signal.stake_fraction, bankrollAtDayStartCents, settings);
    if (takenMatches.has(matchKey)) reason = 'duplicate_selection';
    else if (isKickoffPassed(signal.kickoff_at, now)) reason = 'kickoff_passed';
    else if (depleted) reason = 'bankroll_depleted';
    else if (stake < settings.minStakeCents) reason = 'below_min_stake';
    else if (capReached || total + stake > cap) {
      capReached = true;
      reason = 'daily_cap_reached';
    }
    if (reason !== null) {
      skip(signal, reason, reason === 'duplicate_selection' ? null : stake);
      continue;
    }
    takenMatches.add(matchKey);
    total += stake;
    toFollow.push({ signal, stakeCents: stake });
  }

  return { toFollow, skipped, totalStakeCents: total, dailyCapCents: cap, depleted };
}
