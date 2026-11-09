/** Builders for domain tests. Not imported by app code. */
import type { Bet, MatchResult, SignalInput } from './types';

export function signal(over: Partial<SignalInput> = {}): SignalInput {
  return {
    signal_id: '2026-11-09_PL_ARS-CHE_1X2_HOME',
    match_id: 'PL_20261109_ARS_CHE',
    league: 'Premier League',
    kickoff_at: '2026-11-09T20:00:00Z',
    market: '1X2',
    selection: 'HOME',
    odds: 2.1,
    edge: 0.092,
    stake_fraction: 0.0209,
    recommended: true,
    skip_reason: null,
    ...over,
  };
}

export function bet(over: Partial<Bet> = {}): Bet {
  return {
    matchId: 'PL_20261109_ARS_CHE',
    league: 'Premier League',
    market: '1X2',
    selection: 'HOME',
    kickoffAt: '2026-11-09T20:00:00Z',
    odds: 2,
    stakeCents: 500,
    status: 'open',
    payoutCents: null,
    profitCents: null,
    closingOdds: null,
    ...over,
  };
}

export function result(over: Partial<MatchResult> = {}): MatchResult {
  return {
    match_id: 'PL_20261109_ARS_CHE',
    status: 'FINISHED',
    home_goals: 2,
    away_goals: 1,
    closing_odds: { HOME: 1.9, DRAW: 3.6, AWAY: 3.9 },
    ...over,
  };
}
