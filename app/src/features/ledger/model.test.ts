import type { BankrollEntry, BetRecord } from '@/src/db/repos';
import { utc } from '@/src/db/testUtils';
import { rangeError, parseDay } from './DateRangeSheet';
import {
  ALL_DATES,
  applyFilter,
  dayHeader,
  groupByDay,
  leaguesOf,
  ledgerBets,
  NO_FILTER,
  pickName,
  presetRange,
  rangeLabel,
  rowDate,
  statusCounts,
  type LedgerBet,
} from './model';

const TODAY = '2026-11-09';

function bet(id: number, over: Partial<BetRecord> = {}): BetRecord {
  return {
    id,
    sessionId: 1,
    signalId: `s${id}`,
    signalVersion: 1,
    matchId: `m${id}`,
    league: 'Premier League',
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    kickoffAt: '2026-11-09T20:00:00Z',
    market: '1X2',
    selection: 'HOME',
    odds: 2.1,
    modelProb: 0.55,
    impliedProb: 0.48,
    edge: 0.1,
    stakeFraction: 0.02,
    stakeCents: 224,
    bankrollBeforeCents: 10_720,
    createdAt: '2026-11-09T09:00:00Z',
    status: 'open',
    settledAt: null,
    payoutCents: null,
    profitCents: null,
    closingOdds: null,
    reviewFlag: false,
    ...over,
  };
}

const entry = (id: number, betId: number | null, bankrollCents: number): BankrollEntry => ({
  id,
  sessionId: 1,
  at: '2026-11-09T09:00:00Z',
  deltaCents: 0,
  bankrollCents,
  reason: betId === null ? 'start' : 'stake',
  betId,
});

/** The design 13 ledger: 7 bets over three days. */
function designBets(): LedgerBet[] {
  const bets = [
    bet(1, {
      league: 'Ligue 1',
      kickoffAt: '2026-11-07T20:00:00Z',
      status: 'void',
      profitCents: 0,
    }),
    bet(2, {
      league: 'La Liga',
      kickoffAt: '2026-11-07T16:15:00Z',
      status: 'won',
      profitCents: 253,
    }),
    bet(3, {
      league: 'La Liga',
      kickoffAt: '2026-11-08T14:00:00Z',
      status: 'lost',
      profitCents: -180,
    }),
    bet(4, { kickoffAt: '2026-11-08T17:30:00Z', status: 'won', profitCents: 208 }),
    bet(5, { league: 'Bundesliga', kickoffAt: '2026-11-09T18:30:00Z' }),
    bet(6, { kickoffAt: '2026-11-09T20:00:00Z' }),
    bet(7, { league: 'La Liga', kickoffAt: '2026-11-09T21:00:00Z' }),
  ];
  const history = [
    entry(1, null, 10_000),
    ...bets.map((b, i) => entry(i + 2, b.id, 10_000 + b.id)),
  ];
  return ledgerBets(bets, history, utc);
}

describe('ledgerBets', () => {
  it('sorts newest kickoff first and attaches day and bankroll after', () => {
    const rows = designBets();
    expect(rows.map((b) => b.id)).toEqual([7, 6, 5, 4, 3, 1, 2]);
    expect(rows[0]).toMatchObject({ day: '2026-11-09', bankrollAfterCents: 10_007 });
  });

  it('uses the latest entry of a bet (its settlement)', () => {
    const rows = ledgerBets([bet(1)], [entry(1, 1, 9_000), entry(2, 1, 9_500)], utc);
    expect(rows[0]!.bankrollAfterCents).toBe(9_500);
  });

  it('breaks kickoff ties by newest id', () => {
    const rows = ledgerBets([bet(1), bet(2)], [entry(1, 1, 1), entry(2, 2, 2)], utc);
    expect(rows.map((b) => b.id)).toEqual([2, 1]);
  });

  it('fails loudly on a bet without a bankroll entry', () => {
    expect(() => ledgerBets([bet(1)], [], utc)).toThrow('bet 1 has no bankroll entry');
  });
});

describe('filters (FR-L2)', () => {
  const rows = designBets();
  const ids = (f: Parameters<typeof applyFilter>[1]) => applyFilter(rows, f).map((b) => b.id);

  it('no filter keeps everything', () => {
    expect(ids(NO_FILTER)).toHaveLength(7);
  });

  it('filters by status, league and date alone', () => {
    expect(ids({ ...NO_FILTER, status: 'open' })).toEqual([7, 6, 5]);
    expect(ids({ ...NO_FILTER, league: 'La Liga' })).toEqual([7, 3, 2]);
    expect(ids({ ...NO_FILTER, dates: { from: '2026-11-08', to: '2026-11-08' } })).toEqual([4, 3]);
  });

  it('combines the filters with AND', () => {
    expect(ids({ status: 'open', league: 'La Liga', dates: ALL_DATES })).toEqual([7]);
    expect(ids({ status: 'won', league: 'La Liga', dates: ALL_DATES })).toEqual([2]);
    expect(
      ids({ status: 'all', league: 'La Liga', dates: { from: '2026-11-08', to: null } }),
    ).toEqual([7, 3]);
    expect(
      ids({ status: 'won', league: 'La Liga', dates: { from: null, to: '2026-11-07' } }),
    ).toEqual([2]);
    expect(ids({ status: 'lost', league: 'Bundesliga', dates: ALL_DATES })).toEqual([]);
  });

  it('status counts follow league and date but not status', () => {
    expect(statusCounts(rows, NO_FILTER)).toEqual({ all: 7, open: 3, won: 2, lost: 1, void: 1 });
    expect(statusCounts(rows, { ...NO_FILTER, status: 'won', league: 'La Liga' })).toEqual({
      all: 3,
      open: 1,
      won: 1,
      lost: 1,
      void: 0,
    });
  });

  it('lists leagues by bet count, then name', () => {
    expect(leaguesOf(rows)).toEqual(['La Liga', 'Premier League', 'Bundesliga', 'Ligue 1']);
  });
});

describe('dates', () => {
  it('presets are inclusive local-day ranges', () => {
    expect(presetRange('all', TODAY)).toEqual(ALL_DATES);
    expect(presetRange('today', TODAY)).toEqual({ from: TODAY, to: TODAY });
    expect(presetRange('last7', TODAY)).toEqual({ from: '2026-11-03', to: TODAY });
    expect(presetRange('last30', TODAY)).toEqual({ from: '2026-10-11', to: TODAY });
  });

  it('labels ranges', () => {
    expect(rangeLabel(ALL_DATES, TODAY)).toBe('All dates');
    expect(rangeLabel(presetRange('last7', TODAY), TODAY)).toBe('Last 7 days');
    expect(rangeLabel({ from: '2026-11-01', to: '2026-11-01' }, TODAY)).toBe('Sun 1 Nov');
    expect(rangeLabel({ from: '2026-11-01', to: '2026-11-04' }, TODAY)).toBe(
      'Sun 1 Nov – Wed 4 Nov',
    );
    expect(rangeLabel({ from: '2026-11-01', to: null }, TODAY)).toBe('From Sun 1 Nov');
    expect(rangeLabel({ from: null, to: '2026-11-01' }, TODAY)).toBe('Until Sun 1 Nov');
  });

  it('parses typed days and reports range errors', () => {
    expect(parseDay('')).toBeNull();
    expect(parseDay(' 2026-11-09 ')).toBe('2026-11-09');
    expect(parseDay('2026-02-30')).toBeUndefined();
    expect(parseDay('9 Nov')).toBeUndefined();
    expect(rangeError('', '')).toBeNull();
    expect(rangeError('2026-11-01', '2026-11-09')).toBeNull();
    expect(rangeError('2026-11-10', '2026-11-09')).toBe('The start date is after the end date.');
    expect(rangeError('nope', '')).toBe('Use dates like 2026-11-09.');
  });
});

describe('grouping and labels (design 13)', () => {
  it('puts a header before each day and marks the first and last row', () => {
    const items = groupByDay(designBets(), TODAY);
    expect(
      items.filter((i) => i.type === 'header').map((i) => i.type === 'header' && i.title),
    ).toEqual(['Today · Mon 9 Nov', 'Sun 8 Nov', 'Sat 7 Nov']);
    const today = items.slice(1, 4).map((i) => (i.type === 'bet' ? [i.first, i.last] : null));
    expect(today).toEqual([
      [true, false],
      [false, false],
      [false, true],
    ]);
    expect(groupByDay([], TODAY)).toEqual([]);
  });

  it('formats headers and row dates', () => {
    expect(dayHeader('2026-11-08', TODAY)).toBe('Sun 8 Nov');
    const [b7, , , b4] = designBets();
    expect(rowDate(b7!, TODAY, utc)).toBe('Today 21:00');
    expect(rowDate(b4!, TODAY, utc)).toBe('Sun 17:30');
    const old = ledgerBets(
      [bet(9, { kickoffAt: '2026-10-12T17:30:00Z' })],
      [entry(1, 9, 1)],
      utc,
    )[0]!;
    expect(rowDate(old, TODAY, utc)).toBe('12 Oct 17:30');
  });

  it('names the pick', () => {
    expect(pickName({ selection: 'HOME', homeTeam: 'Betis', awayTeam: 'Villarreal' })).toBe(
      'Betis',
    );
    expect(pickName({ selection: 'AWAY', homeTeam: 'Bayern', awayTeam: 'Dortmund' })).toBe(
      'Dortmund',
    );
    expect(pickName({ selection: 'DRAW', homeTeam: 'A', awayTeam: 'B' })).toBe('Draw');
  });
});
