/** Performance metrics: SRS §6.6, FR-P2 to FR-P6. */
import type { Bet } from './types';

type MetricBet = Pick<
  Bet,
  'status' | 'odds' | 'stakeCents' | 'profitCents' | 'league' | 'market' | 'closingOdds'
>;

/** Won and lost bets: the ones with money actually at risk and decided. Void bets returned the stake. */
function decided<T extends MetricBet>(bets: readonly T[]): T[] {
  return bets.filter((b) => b.status === 'won' || b.status === 'lost');
}

function profitOf(b: MetricBet): number {
  if (b.profitCents === null) throw new Error('settled bet without profit');
  return b.profitCents;
}

export interface Summary {
  bets: number;
  open: number;
  won: number;
  lost: number;
  void: number;
  /** Stake of won and lost bets. */
  totalStakedCents: number;
  /** Profit of all settled bets (void bets add 0). */
  profitCents: number;
  /** profit / total staked over won and lost bets; null before any is decided. */
  roi: number | null;
  /** won / (won + lost); null before any is decided. */
  hitRate: number | null;
  /** Over all bets of the session; null when there are none. */
  averageOdds: number | null;
  averageStakeCents: number | null;
}

export function summarize(bets: readonly MetricBet[]): Summary {
  const count = (s: Bet['status']) => bets.filter((b) => b.status === s).length;
  const won = count('won');
  const lost = count('lost');
  const settled = bets.filter((b) => b.status !== 'open');
  const staked = decided(bets).reduce((s, b) => s + b.stakeCents, 0);
  const profit = settled.reduce((s, b) => s + profitOf(b), 0);
  const n = bets.length;
  return {
    bets: n,
    open: count('open'),
    won,
    lost,
    void: count('void'),
    totalStakedCents: staked,
    profitCents: profit,
    roi: staked > 0 ? profit / staked : null,
    hitRate: won + lost > 0 ? won / (won + lost) : null,
    averageOdds: n > 0 ? bets.reduce((s, b) => s + b.odds, 0) / n : null,
    averageStakeCents: n > 0 ? Math.round(bets.reduce((s, b) => s + b.stakeCents, 0) / n) : null,
  };
}

export interface Drawdown {
  amountCents: number;
  /** amount / peak bankroll; 0 when there is no fall. */
  pct: number;
  /** Indices into the curve for the chart band; equal when there is no fall. */
  peakIndex: number;
  troughIndex: number;
}

/** Largest peak-to-trough fall of the bankroll curve (cents per point, in time order). */
export function maxDrawdown(curveCents: readonly number[]): Drawdown {
  const none: Drawdown = { amountCents: 0, pct: 0, peakIndex: 0, troughIndex: 0 };
  if (curveCents.length === 0) return none;
  let best = none;
  let peakIndex = 0;
  for (let i = 1; i < curveCents.length; i++) {
    const v = curveCents[i]!;
    if (v > curveCents[peakIndex]!) {
      peakIndex = i;
      continue;
    }
    const fall = curveCents[peakIndex]! - v;
    if (fall > best.amountCents) {
      const peak = curveCents[peakIndex]!;
      best = { amountCents: fall, pct: peak > 0 ? fall / peak : 0, peakIndex, troughIndex: i };
    }
  }
  return best;
}

export interface GroupProfit {
  key: string;
  bets: number;
  stakedCents: number;
  profitCents: number;
}

/** Profit of settled bets grouped by league or market (FR-P4), largest profit first. */
export function profitBy(bets: readonly MetricBet[], key: 'league' | 'market'): GroupProfit[] {
  const groups = new Map<string, GroupProfit>();
  for (const b of bets) {
    if (b.status === 'open') continue;
    const k = b[key];
    const g = groups.get(k) ?? { key: k, bets: 0, stakedCents: 0, profitCents: 0 };
    g.bets += 1;
    if (b.status !== 'void') g.stakedCents += b.stakeCents;
    g.profitCents += profitOf(b);
    groups.set(k, g);
  }
  return [...groups.values()].sort(
    (a, b) => b.profitCents - a.profitCents || a.key.localeCompare(b.key),
  );
}

/** CLV of one bet: `taken_odds / closing_odds − 1` (§6.6). */
export function clv(odds: number, closingOdds: number): number {
  return odds / closingOdds - 1;
}

/** Average CLV over bets with closing odds (FR-P6); null when none have them. */
export function averageClv(bets: readonly MetricBet[]): { value: number; bets: number } | null {
  const withClosing = bets.filter(
    (b): b is MetricBet & { closingOdds: number } => b.closingOdds !== null,
  );
  if (withClosing.length === 0) return null;
  const sum = withClosing.reduce((s, b) => s + clv(b.odds, b.closingOdds), 0);
  return { value: sum / withClosing.length, bets: withClosing.length };
}

/** mulberry32: small, fast, seedable PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BootstrapOptions {
  seed?: number;
  resamples?: number;
  /** Central interval width, e.g. 0.9 for 5th to 95th percentile. */
  level?: number;
}

export interface Interval {
  low: number;
  high: number;
  bets: number;
}

/**
 * Bootstrap interval for ROI (FR-P5): resample the decided bets with replacement, compute ROI of
 * each resample, and take the central `level` percentiles. Deterministic for a given seed.
 */
export function bootstrapRoi(
  bets: readonly MetricBet[],
  { seed = 1, resamples = 2000, level = 0.9 }: BootstrapOptions = {},
): Interval | null {
  const sample = decided(bets);
  const n = sample.length;
  if (n === 0) return null;
  const rand = mulberry32(seed);
  const rois: number[] = new Array<number>(resamples);
  for (let r = 0; r < resamples; r++) {
    let profit = 0;
    let staked = 0;
    for (let i = 0; i < n; i++) {
      const b = sample[Math.floor(rand() * n)]!;
      profit += profitOf(b);
      staked += b.stakeCents;
    }
    rois[r] = profit / staked;
  }
  rois.sort((a, b) => a - b);
  const tail = (1 - level) / 2;
  return { low: quantile(rois, tail), high: quantile(rois, 1 - tail), bets: n };
}

/** Linear-interpolated quantile of a sorted, non-empty array. */
export function quantile(sorted: readonly number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}
