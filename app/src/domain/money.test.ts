import { assertCents, formatMoney, formatSignedMoney } from './money';

describe('formatMoney', () => {
  it.each([
    [0, '$0.00'],
    [5, '$0.05'],
    [503, '$5.03'],
    [-503, '-$5.03'],
    [100000, '$1,000.00'],
    [123456789, '$1,234,567.89'],
  ])('%i cents → %s', (cents, text) => {
    expect(formatMoney(cents)).toBe(text);
  });

  it('uses the given currency symbol', () => {
    expect(formatMoney(250, '€')).toBe('€2.50');
  });

  it('rejects non-integer cents', () => {
    expect(() => formatMoney(1.5)).toThrow(RangeError);
    expect(() => assertCents(Number.NaN)).toThrow(RangeError);
  });
});

describe('formatSignedMoney', () => {
  it('adds + only to positive amounts', () => {
    expect(formatSignedMoney(120)).toBe('+$1.20');
    expect(formatSignedMoney(0)).toBe('$0.00');
    expect(formatSignedMoney(-120)).toBe('-$1.20');
  });
});
