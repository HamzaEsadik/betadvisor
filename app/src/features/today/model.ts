/**
 * What Today shows for one day chip, built from the feed and the session's frozen bets with the
 * same `planDay` call `followAdvice` makes, so the screen shows exactly what following freezes.
 */
import type { Signal } from '@/src/api/schemas';
import type { BetRecord } from '@/src/db/repos';
import { dayKeyOf, daySlots, type DayKey, type DaySlot, type OffsetFn } from '@/src/domain/day';
import {
  isBankrollDepleted,
  planDay,
  referenceNow,
  type Clock,
  type DayPlan,
} from '@/src/domain/stakes';
import type { Selection, SkipReason, StakeSettings } from '@/src/domain/types';

export interface DayCard {
  signalId: string;
  home: string;
  away: string;
  homeCode?: string;
  awayCode?: string;
  league: string;
  kickoffAt: string;
  selection: Selection;
  odds: number;
  model: number;
  implied: number;
  edge: number;
  stakeCents: number;
  /** A frozen bet: values come from the database, never from the feed (AC-6). */
  frozen: boolean;
  /** Recommended, not followed, and kickoff has passed (FR-A10). */
  expired: boolean;
}

/** `not_followed`: a recommendation of a past day that was never frozen. */
export type DaySkipReason = SkipReason | 'not_followed';

export interface DaySkip {
  signalId: string;
  home: string;
  away: string;
  league: string;
  kickoffAt: string;
  reason: DaySkipReason;
}

export type FollowBlock = 'read_only' | 'stale' | 'depleted' | 'nothing_to_follow';

export interface DayView {
  slot: DaySlot;
  day: DayKey;
  today: DayKey;
  cards: DayCard[];
  skipped: DaySkip[];
  /** Cards still to follow (not frozen, not expired). */
  toFollowCount: number;
  toFollowStakeCents: number;
  frozenCount: number;
  /** Stakes of the non-expired cards (frozen and to follow). */
  totalStakeCents: number;
  /** The bankroll stakes are sized from: start of the day, or current for the Tomorrow preview. */
  baseBankrollCents: number;
  depleted: boolean;
  /** Why Follow advice is disabled, or null when it is enabled. */
  followBlock: FollowBlock | null;
}

export interface DayInput {
  slot: DaySlot;
  signals: readonly Signal[];
  /** Bets of the active session. */
  bets: readonly BetRecord[];
  settings: StakeSettings;
  /** Bankroll at the start of the chosen day (Yesterday, Today) or the current one (Tomorrow). */
  baseBankrollCents: number;
  clock: Clock;
  isStale: boolean;
  offsetOf?: OffsetFn;
}

export const SKIP_LABELS: Readonly<Record<DaySkipReason, string>> = {
  no_edge: 'No edge',
  below_threshold: 'Below threshold',
  odds_out_of_range: 'Odds out of range',
  missing_data: 'Missing data',
  low_confidence: 'Low confidence',
  daily_cap_reached: 'Daily cap reached',
  below_min_stake: 'Stake below minimum',
  kickoff_passed: 'Kickoff passed',
  bankroll_depleted: 'Stake below minimum',
  duplicate_selection: 'Match already picked',
  not_followed: 'Not followed',
};

function cardOfSignal(s: Signal, stakeCents: number, expired: boolean): DayCard {
  return {
    signalId: s.signal_id,
    home: s.home_team,
    away: s.away_team,
    homeCode: s.home_code,
    awayCode: s.away_code,
    league: s.league,
    kickoffAt: s.kickoff_at,
    selection: s.selection,
    odds: s.odds,
    model: s.model_prob,
    implied: s.implied_prob,
    edge: s.edge,
    stakeCents,
    frozen: false,
    expired,
  };
}

function cardOfBet(b: BetRecord, signal: Signal | undefined): DayCard {
  return {
    signalId: b.signalId,
    home: b.homeTeam,
    away: b.awayTeam,
    homeCode: signal?.home_code,
    awayCode: signal?.away_code,
    league: b.league,
    kickoffAt: b.kickoffAt,
    selection: b.selection,
    odds: b.odds,
    model: b.modelProb,
    implied: b.impliedProb,
    edge: b.edge,
    stakeCents: b.stakeCents,
    frozen: true,
    expired: false,
  };
}

const skipOf = (s: Signal, reason: DaySkipReason): DaySkip => ({
  signalId: s.signal_id,
  home: s.home_team,
  away: s.away_team,
  league: s.league,
  kickoffAt: s.kickoff_at,
  reason,
});

const byKickoff = <T extends { kickoffAt: string }>(a: T, b: T) =>
  Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt);

/** The plan `followAdvice` would apply right now for the given day's signals and bets. */
export function planFor(input: DayInput, day: DayKey): DayPlan {
  const inDay = (at: string) => dayKeyOf(at, input.offsetOf) === day;
  const frozen = input.bets
    .filter((b) => inDay(b.kickoffAt))
    .map((b) => ({ signalId: b.signalId, stakeCents: b.stakeCents }));
  return planDay(
    input.signals.filter((s) => inDay(s.kickoff_at)),
    input.baseBankrollCents,
    input.settings,
    input.clock,
    frozen,
  );
}

export function buildDayView(input: DayInput): DayView {
  const { slot, offsetOf } = input;
  const slots = daySlots(referenceNow(input.clock), offsetOf);
  const day = slots[slot];
  const inDay = (at: string) => dayKeyOf(at, offsetOf) === day;
  const daySignals = input.signals.filter((s) => inDay(s.kickoff_at));
  const dayBets = input.bets.filter((b) => inDay(b.kickoffAt));
  const signalById = new Map(input.signals.map((s) => [s.signal_id, s]));
  const frozenIds = new Set(dayBets.map((b) => b.signalId));

  const cards: DayCard[] = dayBets.map((b) => cardOfBet(b, signalById.get(b.signalId)));
  const skipped: DaySkip[] = [];

  if (slot === 'yesterday') {
    for (const s of daySignals) {
      if (frozenIds.has(s.signal_id)) continue;
      skipped.push(skipOf(s, s.recommended ? 'not_followed' : (s.skip_reason ?? 'no_edge')));
    }
  } else {
    const plan = planFor(input, day);
    for (const p of plan.toFollow) {
      cards.push(cardOfSignal(p.signal as Signal, p.stakeCents, false));
    }
    for (const k of plan.skipped) {
      const s = k.signal as Signal;
      if (k.reason === 'kickoff_passed') cards.push(cardOfSignal(s, k.stakeCents ?? 0, true));
      else skipped.push(skipOf(s, k.reason));
    }
  }

  cards.sort(byKickoff);
  skipped.sort(byKickoff);
  const live = cards.filter((c) => !c.expired);
  const toFollow = live.filter((c) => !c.frozen);
  const sum = (cs: DayCard[]) => cs.reduce((t, c) => t + c.stakeCents, 0);
  const depleted = isBankrollDepleted(input.baseBankrollCents, input.settings);

  let followBlock: FollowBlock | null = null;
  if (slot !== 'today') followBlock = 'read_only';
  else if (depleted) followBlock = 'depleted';
  else if (input.isStale) followBlock = 'stale';
  else if (toFollow.length === 0) followBlock = 'nothing_to_follow';

  return {
    slot,
    day,
    today: slots.today,
    cards,
    skipped,
    toFollowCount: toFollow.length,
    toFollowStakeCents: sum(toFollow),
    frozenCount: live.length - toFollow.length,
    totalStakeCents: sum(live),
    baseBankrollCents: input.baseBankrollCents,
    depleted,
    followBlock,
  };
}
