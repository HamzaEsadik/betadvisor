import { assertStakeSettings, scheduleSettings, settingsAt } from './settings';
import { DEFAULT_STAKE_SETTINGS, type StakeSettings } from './types';

const D = DEFAULT_STAKE_SETTINGS;
const TIGHT: StakeSettings = { perBetCap: 0.02, dailyCap: 0.1, minStakeCents: 200 };
const NOW = new Date('2026-11-09T10:00:00Z');
const TOMORROW = new Date('2026-11-10T00:00:00Z');

describe('settingsAt', () => {
  it('uses the scheduled settings from their start instant on', () => {
    const s = { settings: D, next: { from: TOMORROW.toISOString(), settings: TIGHT } };
    expect(settingsAt(s, NOW)).toEqual(D);
    expect(settingsAt(s, '2026-11-09T23:59:59.999Z')).toEqual(D);
    expect(settingsAt(s, TOMORROW)).toEqual(TIGHT);
    expect(settingsAt({ settings: D, next: null }, TOMORROW)).toEqual(D);
  });
});

describe('scheduleSettings', () => {
  it('schedules a change from the given instant', () => {
    expect(scheduleSettings({ settings: D, next: null }, TIGHT, NOW, TOMORROW)).toEqual({
      settings: D,
      next: { from: '2026-11-10T00:00:00.000Z', settings: TIGHT },
    });
  });

  it('replaces a pending change, and choosing the current settings clears it', () => {
    const pending = { settings: D, next: { from: TOMORROW.toISOString(), settings: TIGHT } };
    const other = { ...TIGHT, minStakeCents: 50 };
    expect(scheduleSettings(pending, other, NOW, TOMORROW).next?.settings).toEqual(other);
    expect(scheduleSettings(pending, D, NOW, TOMORROW)).toEqual({ settings: D, next: null });
  });

  it('promotes a change whose day has come before scheduling the next one', () => {
    const due = { settings: D, next: { from: '2026-11-09T00:00:00Z', settings: TIGHT } };
    const later = new Date('2026-11-11T00:00:00Z');
    expect(scheduleSettings(due, D, NOW, later)).toEqual({
      settings: TIGHT,
      next: { from: later.toISOString(), settings: D },
    });
    expect(scheduleSettings(due, TIGHT, NOW, later)).toEqual({ settings: TIGHT, next: null });
  });

  it('refuses a start in the past and unusable settings', () => {
    expect(() => scheduleSettings({ settings: D, next: null }, TIGHT, NOW, NOW)).toThrow('future');
    expect(() => assertStakeSettings({ ...D, perBetCap: 0 })).toThrow('perBetCap');
    expect(() => assertStakeSettings({ ...D, perBetCap: 1.5 })).toThrow('perBetCap');
    expect(() => assertStakeSettings({ ...D, dailyCap: 0 })).toThrow('dailyCap must');
    expect(() => assertStakeSettings({ ...D, perBetCap: 0.2, dailyCap: 0.1 })).toThrow('below');
    expect(() => assertStakeSettings({ ...D, minStakeCents: 0 })).toThrow('minStakeCents');
    expect(() => assertStakeSettings({ ...D, minStakeCents: 1.5 })).toThrow();
    expect(() => assertStakeSettings(D)).not.toThrow();
  });
});
