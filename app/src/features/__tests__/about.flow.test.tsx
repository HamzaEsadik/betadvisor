/** Part 14: About (design 15), NFR-L1 to NFR-L3, NFR-U2, and the no-links scan (NFR-L2). */
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { scenario } from '@/src/api/testServer';
import { DATA_SOURCE_HOSTS } from '@/src/config/model';
import { renderApp } from './harness';
import { seedBets } from './ledgerSeed';

const AT = '2026-11-09T09:00:00Z';
const ARS = '2026-11-09_PL_ARS-CHE_1X2_HOME';

async function navigate(path: string) {
  await act(async () => {
    router.navigate(path as never);
  });
}

async function openAbout() {
  const app = await renderApp({ at: AT, budgetCents: 100_00 });
  await navigate('/more/about');
  expect(screen.getByTestId('screen-about')).toBeTruthy();
  return app;
}

/** Every string the user can see or hear: text nodes and accessibility labels. */
function allText(): string[] {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (node === null || node === undefined) return;
    if (typeof node === 'string') return void out.push(node);
    if (Array.isArray(node)) return node.forEach(walk);
    const n = node as { props?: Record<string, unknown>; children?: unknown };
    for (const key of ['accessibilityLabel', 'accessibilityHint', 'placeholder', 'value']) {
      const v = n.props?.[key];
      if (typeof v === 'string') out.push(v);
    }
    walk(n.children);
  };
  walk(screen.toJSON());
  return out;
}

/** Web addresses and host names (`example.com`, `https://…`, `www.…`). */
const URL_RE =
  /\b(?:https?:\/\/|www\.)\S+|\b(?:[a-z0-9-]+\.)+(?:com|org|net|io|co\.uk|uk|bet|app|dev)\b/gi;

function hostsShown(): string[] {
  return allText().flatMap((t) => t.match(URL_RE) ?? []);
}

describe('About', () => {
  it('shows the disclaimer, the current thresholds and the versions (design 15)', async () => {
    await openAbout();
    expect(screen.getByTestId('about-disclaimer')).toHaveTextContent(
      /This app uses virtual money for educational purposes\. It is not financial, investment, or gambling advice\./,
    );
    expect(screen.getByTestId('about-step-2')).toHaveTextContent(
      /is at least 4% and the odds are between 1\.40 and 6\.00\./,
    );
    expect(screen.getByTestId('about-step-3')).toHaveTextContent(
      'Stakes are a quarter of the Kelly fraction, capped at 5% of your bankroll per bet and 15% per day, with a $1.00 minimum. Every other match is skipped, with the reason shown.',
    );
    expect(
      screen.getByLabelText('Injuries and suspensions: API-Football (api-football.com)'),
    ).toBeTruthy();
    expect(screen.getByTestId('about-responsible')).toHaveTextContent(
      'If gambling is a problem for you or someone you know, seek help from a local support organization.',
    );
    expect(screen.getByTestId('version-app')).toHaveTextContent('0.1.0');
    expect(screen.getByTestId('version-model')).toHaveTextContent('dc-elo-0.1.0');
    expect(screen.getByTestId('version-feed-schema')).toHaveTextContent('1');
    expect(screen.getByText(/Odds at a real bookmaker may differ\./)).toBeTruthy();
  });

  it('the thresholds follow Settings once a change is in force', async () => {
    const app = await renderApp({ at: AT, budgetCents: 100_00 });
    await navigate('/more/settings');
    await fireEvent.press(screen.getByTestId('row-per-bet-cap'));
    await fireEvent.press(screen.getByTestId('option-0.02'));
    await navigate('/more/about');
    expect(screen.getByTestId('about-step-3')).toHaveTextContent(/capped at 5% of your bankroll/);
    app.setNow('2026-11-10T09:00:00Z');
    await navigate('/more');
    await navigate('/more/about');
    expect(screen.getByTestId('about-step-3')).toHaveTextContent(/capped at 2% of your bankroll/);
  });

  it('says when the injuries source was unavailable', async () => {
    const files = scenario('day1-normal');
    const meta = JSON.parse(files.meta) as { sources_health: Record<string, object> };
    meta.sources_health.injuries = {
      status: 'disabled',
      checked_at: '2026-11-09T07:00:00Z',
      detail: 'no API key',
    };
    await renderApp({
      at: AT,
      budgetCents: 100_00,
      feed: { ...files, meta: JSON.stringify(meta) },
    });
    await navigate('/more/about');
    expect(
      screen.getByLabelText(/^Injuries and suspensions: .*Unavailable in the latest run/),
    ).toBeTruthy();
  });
});

describe('NFR-L2: no bookmaker links', () => {
  it('the only web addresses on any screen are the data-source hosts', async () => {
    const app = await renderApp({ at: AT, budgetCents: 100_00 });
    seedBets(app.db, [
      { kickoffAt: '2026-11-08T14:00:00Z', status: 'won', odds: 2.4, closingOdds: 2.2 },
      { kickoffAt: '2026-11-08T17:00:00Z', status: 'lost' },
    ]);
    // Tab screens stay mounted, so each scan also covers the screens opened before it.
    const seen: Record<string, string[]> = {};
    const scan = (name: string) => {
      const text = allText();
      expect(text.length).toBeGreaterThan(5);
      seen[name] = hostsShown();
    };

    await navigate('/');
    scan('today');
    await navigate(`/signal/${ARS}`);
    scan('bet detail');
    for (const path of [
      '/ledger',
      '/performance',
      '/sessions',
      '/more',
      '/more/settings',
      '/more/about',
    ]) {
      await navigate(path);
      scan(path);
    }
    await navigate('/sessions');
    await fireEvent.press(screen.getByText('Reset budget'));
    scan('reset sheet');

    const all = Object.values(seen).flat();
    for (const host of all) expect(DATA_SOURCE_HOSTS).toContain(host.toLowerCase());
    // The scan does find hosts: About lists the sources.
    expect(seen['/more/about']).toEqual(
      expect.arrayContaining(['the-odds-api.com', 'football-data.org', 'football-data.co.uk']),
    );
    // Before About was opened, no screen showed any address.
    for (const name of ['today', 'bet detail', '/ledger', '/performance', '/sessions', '/more']) {
      expect({ name, hosts: seen[name] }).toEqual({ name, hosts: [] });
    }
  });

  it('the scan recognises addresses', () => {
    const found =
      'Bet at https://www.bookie.example/x or bookie.com, odds 2.10, model dc-elo-0.1.0'.match(
        URL_RE,
      );
    expect(found).toEqual(['https://www.bookie.example/x', 'bookie.com']);
  });

  it('Setup (first launch) shows no addresses either', async () => {
    await renderApp({ at: AT });
    expect(screen.getByTestId('screen-setup')).toBeTruthy();
    expect(hostsShown()).toEqual([]);
  });
});
