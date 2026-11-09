/** Writes bets straight through the repositories, for ledger tests. Tests only. */
import type { SqlDriver } from '@/src/db/driver';
import { repos, type BetRecord } from '@/src/db/repos';
import { mulberry32 } from '@/src/domain/metrics';
import type { BetStatus, Selection } from '@/src/domain/types';

export interface SeedBet {
  league?: string;
  home?: string;
  away?: string;
  kickoffAt: string;
  selection?: Selection;
  odds?: number;
  stakeCents?: number;
  status?: BetStatus;
  /** Settled bets only. */
  closingOdds?: number;
}

/** Freezes each bet in the active session (stake entry), then settles it if it has a result. */
export function seedBets(db: SqlDriver, specs: readonly SeedBet[]): BetRecord[] {
  return db.transaction(() => {
    const r = repos(db);
    const session = r.sessions.getActive();
    if (!session) throw new Error('no active session');
    return specs.map((b, i) => {
      const odds = b.odds ?? 2;
      const stake = b.stakeCents ?? 100;
      const home = b.home ?? `Home ${i}`;
      const away = b.away ?? `Away ${i}`;
      const at = new Date(Date.parse(b.kickoffAt) - 3 * 3_600_000).toISOString();
      const id = r.bets.insert({
        sessionId: session.id,
        signalId: `seed-${i}`,
        signalVersion: 1,
        matchId: `M${i}`,
        league: b.league ?? 'Premier League',
        homeTeam: home,
        awayTeam: away,
        kickoffAt: b.kickoffAt,
        market: '1X2',
        selection: b.selection ?? 'HOME',
        odds,
        modelProb: 0.55,
        impliedProb: 0.5,
        edge: 0.1,
        stakeFraction: 0.02,
        stakeCents: stake,
        bankrollBeforeCents: r.bankroll.current(session.id),
        createdAt: at,
      });
      r.bankroll.append({
        sessionId: session.id,
        at,
        deltaCents: -stake,
        reason: 'stake',
        betId: id,
      });
      const status = b.status ?? 'open';
      if (status !== 'open') {
        const payout = status === 'won' ? Math.round(stake * odds) : status === 'void' ? stake : 0;
        const settledAt = new Date(Date.parse(b.kickoffAt) + 2 * 3_600_000).toISOString();
        r.bets.settle(
          id,
          {
            status,
            payoutCents: payout,
            profitCents: payout - stake,
            closingOdds: b.closingOdds ?? null,
          },
          settledAt,
        );
        r.bankroll.append({
          sessionId: session.id,
          at: settledAt,
          deltaCents: payout,
          reason: 'settle',
          betId: id,
        });
      }
      return r.bets.getById(id)!;
    });
  });
}

const LEAGUES = ['Premier League', 'La Liga', 'Bundesliga', 'Ligue 1'];
const STATUSES: BetStatus[] = ['won', 'lost', 'void'];

/** `n` bets, one per 4 hours back from `end`; the newest few still open. */
export function generatedBets(n: number, end: string, seed = 7): SeedBet[] {
  const rand = mulberry32(seed);
  const last = Date.parse(end);
  return Array.from({ length: n }, (_, i) => {
    const kickoff = new Date(last - (n - 1 - i) * 4 * 3_600_000).toISOString();
    return {
      league: LEAGUES[i % LEAGUES.length],
      kickoffAt: kickoff.replace('.000', ''),
      odds: Math.round((1.5 + rand() * 3) * 100) / 100,
      stakeCents: 100 + Math.floor(rand() * 50),
      status: i >= n - 3 ? 'open' : STATUSES[Math.floor(rand() * 3)],
    };
  });
}
