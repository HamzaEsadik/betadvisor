import { appVersion, feedBaseUrl, resolveFeedBaseUrl } from './feed';

// jest-expo's Constants has an empty expoConfig; use the real app.json.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: jest.requireActual('../../app.json').expo },
}));

describe('resolveFeedBaseUrl', () => {
  const extra = { feedBaseUrl: 'https://hamzaesadik.github.io/betadvisor/feed/' };

  it('uses app.json extra', () => {
    expect(resolveFeedBaseUrl({ extra, isDev: false })).toBe(extra.feedBaseUrl);
  });

  it('adds a trailing slash', () => {
    expect(resolveFeedBaseUrl({ extra: { feedBaseUrl: 'https://x.dev/feed' }, isDev: false })).toBe(
      'https://x.dev/feed/',
    );
  });

  it('honours the dev override only in dev builds', () => {
    const devOverride = 'http://10.0.2.2:8787/day1-normal';
    expect(resolveFeedBaseUrl({ extra, devOverride, isDev: true })).toBe(`${devOverride}/`);
    expect(resolveFeedBaseUrl({ extra, devOverride, isDev: false })).toBe(extra.feedBaseUrl);
  });

  it('fails loudly without a URL, or with plain HTTP in a release build', () => {
    expect(() => resolveFeedBaseUrl({ extra: {}, isDev: false })).toThrow(/missing/);
    expect(() => resolveFeedBaseUrl({ extra: null, isDev: true })).toThrow(/missing/);
    expect(() =>
      resolveFeedBaseUrl({ extra: { feedBaseUrl: 'http://x.dev/' }, isDev: false }),
    ).toThrow(/HTTPS/);
  });

  it('reads the real app config', () => {
    expect(feedBaseUrl()).toBe('https://hamzaesadik.github.io/betadvisor/feed/');
    expect(appVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
