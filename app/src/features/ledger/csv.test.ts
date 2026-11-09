import { readFileSync } from 'fs';
import { join } from 'path';

import { csvField, csvFileName, CSV_HEADER, ledgerCsv } from './csv';
import type { LedgerBet } from './model';

const base: Omit<LedgerBet, 'id'> = {
  sessionId: 2,
  signalId: '',
  signalVersion: 1,
  matchId: '',
  league: '',
  homeTeam: '',
  awayTeam: '',
  kickoffAt: '',
  market: '1X2',
  selection: 'HOME',
  odds: 0,
  modelProb: 0,
  impliedProb: 0,
  edge: 0,
  stakeFraction: 0,
  stakeCents: 0,
  bankrollBeforeCents: 0,
  bankrollAfterCents: 0,
  createdAt: '',
  status: 'open',
  settledAt: null,
  payoutCents: null,
  profitCents: null,
  closingOdds: null,
  reviewFlag: false,
  day: '',
};

/** Newest first, as the ledger lists them. Names with commas, quotes and a line break. */
const BETS: LedgerBet[] = [
  {
    ...base,
    id: 14,
    signalId: '2026-11-09_FL1_PSG-OM_1X2_AWAY',
    signalVersion: 2,
    matchId: 'FL1_20261109_PSG_OM',
    league: 'Ligue 1',
    homeTeam: 'Paris, Saint-Germain',
    awayTeam: 'Olympique "OM" Marseille',
    kickoffAt: '2026-11-09T20:00:00Z',
    selection: 'AWAY',
    odds: 3.6,
    modelProb: 0.31,
    impliedProb: 0.2778,
    edge: 0.116,
    stakeFraction: 0.018,
    stakeCents: 180,
    bankrollBeforeCents: 107_20,
    bankrollAfterCents: 105_40,
    createdAt: '2026-11-09T07:05:00Z',
  },
  {
    ...base,
    id: 13,
    signalId: '2026-11-08_PL_ARS-CHE_1X2_HOME',
    matchId: 'PL_20261108_ARS_CHE',
    league: 'Premier League',
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    kickoffAt: '2026-11-08T17:30:00Z',
    odds: 2.1,
    modelProb: 0.52,
    impliedProb: 0.4762,
    edge: 0.092,
    stakeFraction: 0.021,
    stakeCents: 224,
    bankrollBeforeCents: 105_00,
    bankrollAfterCents: 109_70,
    createdAt: '2026-11-08T07:00:00Z',
    status: 'won',
    settledAt: '2026-11-08T19:40:00Z',
    payoutCents: 470,
    profitCents: 246,
    closingOdds: 2.05,
  },
  {
    ...base,
    id: 12,
    signalId: '2026-11-07_BL1_BAY-BMG_1X2_DRAW',
    matchId: 'BL1_20261107_BAY_BMG',
    league: 'Bundesliga',
    homeTeam: 'Bayern',
    awayTeam: 'Borussia Mönchengladbach\nII',
    kickoffAt: '2026-11-07T14:30:00Z',
    selection: 'DRAW',
    odds: 4.2,
    modelProb: 0.27,
    impliedProb: 0.2381,
    edge: 0.134,
    stakeFraction: 0.011,
    stakeCents: 112,
    bankrollBeforeCents: 106_12,
    bankrollAfterCents: 106_12,
    createdAt: '2026-11-07T07:00:00Z',
    status: 'void',
    settledAt: '2026-11-07T18:00:00Z',
    payoutCents: 112,
    profitCents: 0,
    reviewFlag: true,
  },
];

describe('ledger CSV (FR-L3)', () => {
  it('matches the golden file byte for byte', () => {
    const golden = readFileSync(join(__dirname, '__fixtures__', 'ledger.golden.csv'), 'utf8');
    expect(ledgerCsv(BETS)).toBe(golden);
  });

  it('has every bet column', () => {
    for (const key of Object.keys(base).filter((k) => k !== 'day')) {
      const snake = key
        .replace(/Cents$/, '')
        .replace(/Id$/, '_id')
        .replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
      expect(CSV_HEADER).toContain(snake);
    }
    expect(CSV_HEADER).toContain('bet_id');
  });

  it('quotes fields per RFC 4180', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('two\r\nlines')).toBe('"two\r\nlines"');
    expect(csvField(null)).toBe('');
    expect(csvField(1.5)).toBe('1.5');
    expect(csvField(false)).toBe('false');
  });

  it('an empty ledger is just the header', () => {
    expect(ledgerCsv([])).toBe(`${CSV_HEADER.join(',')}\r\n`);
  });

  it('names the file after the session and day', () => {
    expect(csvFileName(2, '2026-11-09')).toBe('betadvisor-session-2-2026-11-09.csv');
  });
});
