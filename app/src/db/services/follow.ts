/** FR-B1 to FR-B4: freezing today's advice as bets. */
import { dayKeyOf, dayStartUtc, type DayKey, type OffsetFn } from '../../domain/day';
import { settingsAt } from '../../domain/settings';
import { planDay, referenceNow, type Clock, type DayPlan } from '../../domain/stakes';
import type { SignalInput } from '../../domain/types';
import type { SqlDriver } from '../driver';
import { repos, type BetRecord } from '../repos';

/** The `signals.json` fields a frozen bet stores (FR-B2). */
export interface FreezableSignal extends SignalInput {
  version: number;
  home_team: string;
  away_team: string;
  model_prob: number;
  implied_prob: number;
}

export interface FollowOptions {
  /** FR-B5: freeze only these signals (when the user chooses bets individually). */
  only?: ReadonlySet<string>;
}

export interface FollowOutcome {
  sessionId: number;
  day: DayKey;
  frozen: BetRecord[];
  plan: DayPlan;
}

/**
 * Freezes every eligible recommended signal kicking off today, in one transaction. Signals of
 * other days are ignored (Yesterday and Tomorrow are read-only). Bets already frozen today keep
 * their values and count toward the daily cap, so calling this again freezes nothing twice
 * (FR-B4, also enforced by `UNIQUE(session_id, signal_id)`), even if a newer signal version
 * arrived (AC-6). Stakes use the bankroll at the start of the local day (FR-A5) and the settings
 * in force when the day started. With `only` (FR-B5), the plan is made over every signal so the
 * stakes match what Today shows, and only the chosen ones are frozen.
 */
export function followAdvice(
  db: SqlDriver,
  signals: readonly FreezableSignal[],
  now: Date | Clock,
  offsetOf?: OffsetFn,
  { only }: FollowOptions = {},
): FollowOutcome {
  return db.transaction(() => {
    const r = repos(db);
    const session = r.sessions.getActive();
    if (!session) throw new Error('no active session');
    const at = referenceNow(now);
    const day = dayKeyOf(at, offsetOf);
    const inDay = (kickoffAt: string) => dayKeyOf(kickoffAt, offsetOf) === day;

    const frozenToday = r.bets
      .listBySession(session.id)
      .filter((b) => inDay(b.kickoffAt))
      .map((b) => ({ signalId: b.signalId, stakeCents: b.stakeCents }));
    const dayStart = dayStartUtc(day, offsetOf);
    const startCents = r.bankroll.atDayStart(session.id, dayStart.toISOString());
    const todays = signals.filter((s) => inDay(s.kickoff_at));
    const settings = settingsAt(
      { settings: session.settings, next: session.nextSettings },
      dayStart,
    );
    const plan = planDay(todays, startCents, settings, now, frozenToday);
    const chosen =
      only === undefined
        ? plan.toFollow
        : plan.toFollow.filter((p) => only.has(p.signal.signal_id));

    const createdAt = at.toISOString();
    const frozen = chosen.map(({ signal, stakeCents }) => {
      const s = signal as FreezableSignal;
      const id = r.bets.insert({
        sessionId: session.id,
        signalId: s.signal_id,
        signalVersion: s.version,
        matchId: s.match_id,
        league: s.league,
        homeTeam: s.home_team,
        awayTeam: s.away_team,
        kickoffAt: s.kickoff_at,
        market: s.market,
        selection: s.selection,
        odds: s.odds,
        modelProb: s.model_prob,
        impliedProb: s.implied_prob,
        edge: s.edge,
        stakeFraction: s.stake_fraction,
        stakeCents,
        bankrollBeforeCents: r.bankroll.current(session.id),
        createdAt,
      });
      r.bankroll.append({
        sessionId: session.id,
        at: createdAt,
        deltaCents: -stakeCents,
        reason: 'stake',
        betId: id,
      });
      return r.bets.getById(id)!;
    });
    return { sessionId: session.id, day, frozen, plan };
  });
}
