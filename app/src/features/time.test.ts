import { hoursBetween, localTime, relativeDay } from './time';

const utc = () => 0;
const plus2 = () => -120;

describe('time helpers', () => {
  it('formats local clock times', () => {
    expect(localTime('2026-11-09T18:30:00Z', utc)).toBe('18:30');
    expect(localTime('2026-11-09T23:05:00Z', plus2)).toBe('01:05');
    expect(localTime('2026-11-09T18:30:00Z')).toMatch(/^\d\d:\d\d$/);
  });

  it('names the day relative to today', () => {
    expect(relativeDay('2026-11-09T12:00:00Z', '2026-11-09', utc)).toBe('Today');
    expect(relativeDay('2026-11-08T12:00:00Z', '2026-11-09', utc)).toBe('Yesterday');
    expect(relativeDay('2026-11-10T12:00:00Z', '2026-11-09', utc)).toBe('Tomorrow');
    expect(relativeDay('2026-11-12T12:00:00Z', '2026-11-09', utc)).toBe('Thu 12 Nov');
    expect(relativeDay('2026-11-09T23:30:00Z', '2026-11-10', plus2)).toBe('Today');
  });

  it('counts whole hours', () => {
    expect(hoursBetween('2026-11-08T07:00:00Z', new Date('2026-11-09T09:59:00Z'))).toBe(26);
  });
});
