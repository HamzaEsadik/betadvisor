/** Domain types shared by the pure modules. Money is integer cents; times are UTC ISO 8601. */

export type Market = '1X2';
export type Selection = 'HOME' | 'DRAW' | 'AWAY';

/** Skip reasons published by the pipeline (`signals.json` `skip_reason`). */
export type FeedSkipReason =
  'no_edge' | 'below_threshold' | 'odds_out_of_range' | 'missing_data' | 'low_confidence';

/** Skip reasons decided on the device. */
export type AppSkipReason =
  | 'daily_cap_reached' // FR-A5
  | 'below_min_stake' // FR-A6
  | 'kickoff_passed' // FR-A10
  | 'bankroll_depleted' // §9.1
  | 'duplicate_selection'; // §9.6: one selection per match and market

export type SkipReason = FeedSkipReason | AppSkipReason;

/** The fields of a feed signal the domain logic needs (a subset of `signals.json` items). */
export interface SignalInput {
  signal_id: string;
  match_id: string;
  league: string;
  kickoff_at: string;
  market: Market;
  selection: Selection;
  odds: number;
  edge: number;
  stake_fraction: number;
  recommended: boolean;
  skip_reason: FeedSkipReason | null;
}

export type ResultStatus = 'FINISHED' | 'POSTPONED' | 'CANCELLED' | 'ABANDONED';

/** One `results.json` item. */
export interface MatchResult {
  match_id: string;
  status: ResultStatus;
  home_goals: number | null;
  away_goals: number | null;
  closing_odds: Record<Selection, number> | null;
}

export type BetStatus = 'open' | 'won' | 'lost' | 'void';

/** A frozen bet as the domain sees it. */
export interface Bet {
  matchId: string;
  league: string;
  market: Market;
  selection: Selection;
  kickoffAt: string;
  odds: number;
  stakeCents: number;
  status: BetStatus;
  payoutCents: number | null;
  profitCents: number | null;
  closingOdds: number | null;
}

/** Per-session staking settings (stored in `sessions.settings_json`). */
export interface StakeSettings {
  /** Maximum single stake as a fraction of bankroll (FR-A4). */
  perBetCap: number;
  /** Maximum total stake per day as a fraction of bankroll at start of day (FR-A5). */
  dailyCap: number;
  /** Minimum stake in cents (FR-A6). */
  minStakeCents: number;
}

export const DEFAULT_STAKE_SETTINGS: Readonly<StakeSettings> = Object.freeze({
  perBetCap: 0.05,
  dailyCap: 0.15,
  minStakeCents: 100,
});
