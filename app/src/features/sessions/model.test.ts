import type { SessionRecord } from '@/src/db/repos';
import { utc } from '@/src/db/testUtils';
import { DEFAULT_STAKE_SETTINGS } from '@/src/domain/types';
import { sessionDates, sessionNumbers } from './model';

const session = (id: number, startedAt: string, endedAt: string | null): SessionRecord => ({
  id,
  startingBudgetCents: 100_00,
  startedAt,
  endedAt,
  finalBankrollCents: endedAt === null ? null : 90_00,
  status: endedAt === null ? 'active' : 'closed',
  settings: { ...DEFAULT_STAKE_SETTINGS },
  stats: null,
});

describe('sessions model (FR-S7)', () => {
  it('formats the design 04 date ranges', () => {
    expect(sessionDates(session(2, '2026-10-12T08:00:00Z', null), utc)).toBe('12 Oct 2026 – today');
    expect(sessionDates(session(1, '2026-09-14T08:00:00Z', '2026-10-11T20:00:00Z'), utc)).toBe(
      '14 Sep – 11 Oct 2026',
    );
    expect(sessionDates(session(1, '2025-12-20T08:00:00Z', '2026-01-03T20:00:00Z'), utc)).toBe(
      '20 Dec 2025 – 3 Jan 2026',
    );
    expect(sessionDates(session(1, '2026-11-09T08:00:00Z', '2026-11-09T20:00:00Z'), utc)).toBe(
      '9 Nov 2026',
    );
  });

  it('numbers sessions in start order whatever the list order', () => {
    const list = [session(7, 'c', null), session(3, 'a', 'b'), session(5, 'b', 'c')];
    expect([...sessionNumbers(list)]).toEqual([
      [3, 1],
      [5, 2],
      [7, 3],
    ]);
  });
});
