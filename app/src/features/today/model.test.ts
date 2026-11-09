import { parseFeed, type Signal } from '@/src/api/schemas';
import { sample } from '@/src/api/testServer';
import type { BetRecord } from '@/src/db/repos';
import { utc } from '@/src/db/testUtils';
import { DEFAULT_STAKE_SETTINGS } from '@/src/domain/types';
import { buildDayView, SKIP_LABELS, type DayInput } from './model';

function signals(rel = 'day1-normal/signals.json'): Signal[] {
  const r = parseFeed('signals', sample(rel));
  if (!r.ok) throw new Error('bad sample');
  return r.data.signals;
}

function betOf(s: Signal, over: Partial<BetRecord> = {}): BetRecord {
  return {
    id: 1,
    sessionId: 1,
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
    stakeCents: 500,
    bankrollBeforeCents: 100_00,
    createdAt: '2026-11-09T08:00:00Z',
    status: 'open',
    settledAt: null,
    payoutCents: null,
    profitCents: null,
    closingOdds: null,
    reviewFlag: false,
    ...over,
  };
}

const input = (over: Partial<DayInput>): DayInput => ({
  slot: 'today',
  signals: signals(),
  bets: [],
  settings: DEFAULT_STAKE_SETTINGS,
  baseBankrollCents: 107_20,
  clock: { deviceNow: new Date('2026-11-09T09:00:00Z') },
  isStale: false,
  offsetOf: utc,
  ...over,
});

describe('buildDayView', () => {
  it('plans today like design 02', () => {
    const v = buildDayView(input({}));
    expect(v.day).toBe('2026-11-09');
    expect(v.cards.map((c) => c.stakeCents)).toEqual([167, 112, 224]);
    expect(v).toMatchObject({
      toFollowCount: 3,
      toFollowStakeCents: 503,
      frozenCount: 0,
      totalStakeCents: 503,
      depleted: false,
      followBlock: null,
    });
    expect(v.skipped.map((k) => k.reason)).toEqual([
      'low_confidence',
      'odds_out_of_range',
      'missing_data',
      'below_threshold',
      'no_edge',
    ]);
  });

  it('frozen bets keep their database values and feed team codes', () => {
    const all = signals();
    const ars = all.find((s) => s.signal_id.includes('ARS'))!;
    const v = buildDayView(input({ bets: [betOf(ars, { odds: 9.9, stakeCents: 333 })] }));
    const card = v.cards.find((c) => c.signalId === ars.signal_id)!;
    expect(card).toMatchObject({ frozen: true, odds: 9.9, stakeCents: 333, homeCode: 'ARS' });
    expect(v.frozenCount).toBe(1);
    expect(v.toFollowCount).toBe(2);
  });

  it('blocks following when stale, depleted, nothing is left, or on other days', () => {
    expect(buildDayView(input({ isStale: true })).followBlock).toBe('stale');
    expect(buildDayView(input({ baseBankrollCents: 10_00 })).followBlock).toBe('depleted');
    expect(buildDayView(input({ signals: [] })).followBlock).toBe('nothing_to_follow');
    expect(buildDayView(input({ slot: 'tomorrow' })).followBlock).toBe('read_only');
  });

  it('yesterday lists frozen bets, unfollowed recommendations and feed skips', () => {
    const v = buildDayView(
      input({ slot: 'yesterday', clock: { deviceNow: new Date('2026-11-10T09:00:00Z') } }),
    );
    expect(v.day).toBe('2026-11-09');
    expect(v.cards).toHaveLength(0);
    expect(v.skipped.filter((k) => k.reason === 'not_followed')).toHaveLength(3);
    expect(v.skipped.some((k) => k.reason === 'no_edge')).toBe(true);

    const bay = signals().find((s) => s.signal_id.includes('BAY'))!;
    const w = buildDayView(
      input({
        slot: 'yesterday',
        bets: [betOf(bay)],
        clock: { deviceNow: new Date('2026-11-10T09:00:00Z') },
      }),
    );
    expect(w.cards.map((c) => c.signalId)).toEqual([bay.signal_id]);
    expect(w.skipped.some((k) => k.signalId === bay.signal_id)).toBe(false);
  });

  it('has a label for every reason', () => {
    for (const label of Object.values(SKIP_LABELS)) expect(label.length).toBeGreaterThan(0);
  });
});
