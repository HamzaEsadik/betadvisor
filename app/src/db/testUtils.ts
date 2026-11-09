/** Builders for database tests. Not imported by app code. */
import type { MatchResult } from '../domain/types';
import { prepareDatabase } from './migrate';
import type { FreezableSignal } from './services/follow';
import { openTestDriver } from './testDriver';

export function freshDb() {
  const db = openTestDriver();
  prepareDatabase(db);
  return db;
}

export function freezable(over: Partial<FreezableSignal> = {}): FreezableSignal {
  const home = over.home_team ?? 'Arsenal';
  return {
    signal_id: '2026-11-09_PL_ARS-CHE_1X2_HOME',
    version: 1,
    match_id: 'PL_20261109_ARS_CHE',
    league: 'Premier League',
    home_team: home,
    away_team: 'Chelsea',
    kickoff_at: '2026-11-09T20:00:00Z',
    market: '1X2',
    selection: 'HOME',
    odds: 2,
    model_prob: 0.55,
    implied_prob: 0.48,
    edge: 0.1,
    stake_fraction: 0.05,
    recommended: true,
    skip_reason: null,
    ...over,
  };
}

export function finished(
  matchId: string,
  homeGoals: number,
  awayGoals: number,
  over: Partial<MatchResult> = {},
): MatchResult {
  return {
    match_id: matchId,
    status: 'FINISHED',
    home_goals: homeGoals,
    away_goals: awayGoals,
    closing_odds: null,
    ...over,
  };
}

export const utc = () => 0;
