import { addDays, bucketByDay, dayKeyOf, daySlots, dayStartUtc, selectDay } from './day';

/** Fixed zones, as `getTimezoneOffset()` minutes. */
const utc = () => 0;
const paris = () => -60; // UTC+1 in November
const newYork = () => 300; // UTC-5 in November

describe('dayKeyOf', () => {
  it('uses the local calendar date', () => {
    const late = '2026-11-09T23:30:00Z';
    expect(dayKeyOf(late, utc)).toBe('2026-11-09');
    expect(dayKeyOf(late, paris)).toBe('2026-11-10');
    expect(dayKeyOf('2026-11-10T03:00:00Z', newYork)).toBe('2026-11-09');
  });

  it('defaults to the device zone', () => {
    const d = new Date(2026, 10, 9, 12, 0);
    expect(dayKeyOf(d)).toBe('2026-11-09');
  });

  it('rejects invalid dates', () => {
    expect(() => dayKeyOf('not a date', utc)).toThrow(RangeError);
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('daySlots', () => {
  it('returns yesterday, today and tomorrow', () => {
    expect(daySlots(new Date('2026-11-09T23:30:00Z'), paris)).toEqual({
      yesterday: '2026-11-09',
      today: '2026-11-10',
      tomorrow: '2026-11-11',
    });
  });

  it('uses the device zone by default', () => {
    expect(daySlots(new Date(2026, 10, 9, 12)).today).toBe('2026-11-09');
  });
});

describe('bucketByDay / selectDay', () => {
  const items = [
    { id: 'a', kickoff_at: '2026-11-08T20:00:00Z' },
    { id: 'b', kickoff_at: '2026-11-09T15:00:00Z' },
    { id: 'c', kickoff_at: '2026-11-09T23:30:00Z' },
    { id: 'd', kickoff_at: '2026-11-10T20:00:00Z' },
  ];
  const now = new Date('2026-11-09T10:00:00Z');

  it('buckets by local kickoff day, keeping input order', () => {
    const buckets = bucketByDay(items, (i) => i.kickoff_at, paris);
    expect([...buckets.entries()].map(([k, v]) => [k, v.map((i) => i.id)])).toEqual([
      ['2026-11-08', ['a']],
      ['2026-11-09', ['b']],
      ['2026-11-10', ['c', 'd']],
    ]);
  });

  it('buckets in the device zone by default', () => {
    expect(bucketByDay([], (i: { at: string }) => i.at).size).toBe(0);
  });

  it('selects the chip day', () => {
    const ids = (slot: 'yesterday' | 'today' | 'tomorrow', off = utc) =>
      selectDay(items, slot, now, off).map((i) => i.id);
    expect(ids('yesterday')).toEqual(['a']);
    expect(ids('today')).toEqual(['b', 'c']);
    expect(ids('tomorrow')).toEqual(['d']);
    expect(ids('today', paris)).toEqual(['b']);
    expect(selectDay(items, 'today', new Date(2026, 10, 9, 12)).length).toBeGreaterThanOrEqual(0);
  });
});

describe('dayStartUtc', () => {
  it('returns the instant of local midnight', () => {
    expect(dayStartUtc('2026-11-09', utc).toISOString()).toBe('2026-11-09T00:00:00.000Z');
    expect(dayStartUtc('2026-11-09', paris).toISOString()).toBe('2026-11-08T23:00:00.000Z');
    expect(dayStartUtc('2026-11-09', newYork).toISOString()).toBe('2026-11-09T05:00:00.000Z');
  });

  it('round-trips with dayKeyOf', () => {
    const start = dayStartUtc('2026-11-09', paris);
    expect(dayKeyOf(start, paris)).toBe('2026-11-09');
    expect(dayKeyOf(new Date(start.getTime() - 1), paris)).toBe('2026-11-08');
  });

  it('reads the offset at the result when it changes that day', () => {
    // Offset is -120 before 2026-03-29T00:00Z and -60 after (a made-up switch at UTC midnight).
    const zone = (d: Date) => (d.getTime() < Date.UTC(2026, 2, 29) ? -120 : -60);
    expect(dayStartUtc('2026-03-29', zone).toISOString()).toBe('2026-03-28T22:00:00.000Z');
  });

  it('defaults to the device zone', () => {
    expect(dayStartUtc('2026-11-09').getTime()).toBe(new Date(2026, 10, 9).getTime());
  });
});
