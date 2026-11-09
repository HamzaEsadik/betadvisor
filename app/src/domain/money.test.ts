import {
  assertCents,
  formatMoney,
  formatMoneyLocale,
  formatOdds,
  formatPercent,
  formatSignedMoney,
  fromCents,
  mulCents,
  roundCents,
  toCents,
} from './money';

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

describe('cents arithmetic', () => {
  it('roundCents rounds half away from zero and ignores float noise', () => {
    expect(roundCents(224.048)).toBe(224);
    expect(roundCents(0.5)).toBe(1);
    expect(roundCents(-0.5)).toBe(-1);
    expect(roundCents(-0.4)).toBe(0);
    expect(Object.is(roundCents(-0.4), 0)).toBe(true);
    // 1.005 dollars is 100.49999999999999 cents in floats.
    expect(roundCents(1.005 * 100)).toBe(101);
    expect(() => roundCents(Number.NaN)).toThrow(RangeError);
    expect(() => roundCents(Infinity)).toThrow(RangeError);
  });

  it('toCents / fromCents / mulCents', () => {
    expect(toCents(107.2)).toBe(10720);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(fromCents(10720)).toBe(107.2);
    expect(() => fromCents(1.5)).toThrow(RangeError);
    expect(mulCents(10720, 0.0209)).toBe(224);
    expect(mulCents(224, 2.1)).toBe(470);
    expect(() => mulCents(1.5, 2)).toThrow(RangeError);
  });
});

describe('locale formatting (NFR-U3)', () => {
  it('formats money with locale separators and the chosen symbol', () => {
    expect(formatMoneyLocale(123456, 'en-US')).toBe('$1,234.56');
    expect(formatMoneyLocale(-503, 'en-US', '€')).toBe('-€5.03');
    expect(formatMoneyLocale(123456, 'de-DE', '€')).toBe('€1.234,56');
  });

  it('formats odds and percentages', () => {
    expect(formatOdds(2.1, 'en-US')).toBe('2.10');
    expect(formatOdds(2.1, 'fr-FR')).toBe('2,10');
    expect(formatPercent(0.092, 'en-US')).toBe('9.2%');
    expect(formatPercent(0.15, 'en-US', 0)).toBe('15%');
  });
});
