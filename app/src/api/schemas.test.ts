/**
 * Parity between the zod mirrors and the JSON Schemas (the contract). Every `feed-samples` file
 * and a set of targeted mutations must get the same verdict from both; valid files must come out
 * of zod unchanged.
 */
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import fs from 'node:fs';
import path from 'node:path';

import type { FreezableSignal } from '../db/services/follow';
import type { MatchResult } from '../domain/types';
import { FEED_SCHEMAS, parseFeed, type FeedKind } from './schemas';

const ROOT = path.resolve(__dirname, '../../..');
const SAMPLES = path.join(ROOT, 'feed-samples');
const SCHEMAS = path.join(ROOT, 'schemas');

const ajv = new Ajv2020({ allErrors: true, strictTypes: false });
addFormats(ajv);
const validators = Object.fromEntries(
  (['signals', 'results', 'meta'] as const).map((k) => [
    k,
    ajv.compile(JSON.parse(fs.readFileSync(path.join(SCHEMAS, `${k}.schema.json`), 'utf8'))),
  ]),
) as Record<FeedKind, ReturnType<typeof ajv.compile>>;

function kindOf(file: string): FeedKind | null {
  const base = path.basename(file);
  const m = /^(signals|results|meta)[.-]/.exec(base);
  return m ? (m[1] as FeedKind) : null;
}

function sampleFiles(): string[] {
  const out: string[] = [];
  for (const dir of fs.readdirSync(SAMPLES, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const f of fs.readdirSync(path.join(SAMPLES, dir.name))) {
      if (f.endsWith('.json')) out.push(path.join(dir.name, f));
    }
  }
  return out.sort();
}

function ajvValid(kind: FeedKind, text: string): boolean {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return false;
  }
  return validators[kind](json) as boolean;
}

/** `$.signals[0].context` → ['signals', 0, 'context'] */
function jsonPath(p: string): (string | number)[] {
  return [...p.matchAll(/\.([a-z_]+)|\[(\d+)\]/g)].map((m) => (m[1] ?? Number(m[2])) as never);
}

const manifest = JSON.parse(fs.readFileSync(path.join(SAMPLES, 'manifest.json'), 'utf8')) as {
  malformed: Record<string, string | null>;
};

describe('feed-samples parity (zod vs JSON Schema)', () => {
  const files = sampleFiles();

  it('finds the sample files', () => {
    expect(files.length).toBeGreaterThanOrEqual(30);
    expect(files.every((f) => kindOf(f) !== null)).toBe(true);
  });

  it.each(files)('%s', (file) => {
    const kind = kindOf(file)!;
    const text = fs.readFileSync(path.join(SAMPLES, file), 'utf8');
    const expected = ajvValid(kind, text);
    const r = parseFeed(kind, text);
    expect(r.ok).toBe(expected);
    expect(expected).toBe(!file.startsWith('malformed/'));
    if (r.ok) expect(r.data).toEqual(JSON.parse(text));
  });

  it.each(Object.entries(manifest.malformed))(
    'malformed/%s fails at the manifest path',
    (file, at) => {
      const kind = kindOf(file)!;
      const r = parseFeed(kind, fs.readFileSync(path.join(SAMPLES, 'malformed', file), 'utf8'));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      if (at === null) {
        expect(r.path).toBeNull();
      } else {
        expect(r.path!.slice(0, jsonPath(at).length)).toEqual(jsonPath(at));
      }
    },
  );
});

const DELETE = Symbol('delete');
type Mutation = [string, (string | number)[], unknown];

function mutate(doc: unknown, at: (string | number)[], value: unknown): unknown {
  const copy = structuredClone(doc) as Record<string | number, unknown>;
  let node = copy;
  for (const key of at.slice(0, -1)) node = node[key] as Record<string | number, unknown>;
  const last = at[at.length - 1]!;
  if (value === DELETE) delete node[last];
  else node[last] = value;
  return copy;
}

function load(rel: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(SAMPLES, rel), 'utf8'));
}

const S0 = ['signals', 0];
const S1 = ['signals', 1];
const R0 = ['results', 0];

const MUTATIONS: Record<FeedKind, { base: string; cases: Mutation[] }> = {
  signals: {
    base: 'day1-normal/signals.json',
    cases: [
      ['month 13', [...S0, 'kickoff_at'], '2026-13-09T20:00:00Z'],
      ['Feb 30', [...S0, 'kickoff_at'], '2026-02-30T20:00:00Z'],
      ['Feb 29 leap year', [...S0, 'kickoff_at'], '2028-02-29T20:00:00Z'],
      ['hour 24', [...S0, 'kickoff_at'], '2026-11-09T24:00:00Z'],
      ['6-digit fraction', [...S0, 'kickoff_at'], '2026-11-09T20:00:00.123456Z'],
      ['7-digit fraction', [...S0, 'kickoff_at'], '2026-11-09T20:00:00.1234567Z'],
      ['offset', [...S0, 'kickoff_at'], '2026-11-09T20:00:00+00:00'],
      ['odds 1', [...S0, 'odds'], 1],
      ['odds 1000', [...S0, 'odds'], 1000],
      ['odds over 1000', [...S0, 'odds'], 1000.01],
      ['odds string', [...S0, 'odds'], '2.1'],
      ['model_prob 0', [...S0, 'model_prob'], 0],
      ['implied_prob 1', [...S0, 'implied_prob'], 1],
      ['skipped edge -1', [...S1, 'edge'], -1],
      ['skipped edge below -1', [...S1, 'edge'], -1.01],
      ['recommended edge 0', [...S0, 'edge'], 0],
      ['recommended stake 0', [...S0, 'stake_fraction'], 0],
      ['stake over 1', [...S0, 'stake_fraction'], 1.5],
      ['skipped without reason', [...S1, 'skip_reason'], null],
      ['unknown skip reason', [...S1, 'skip_reason'], 'kickoff_passed'],
      ['form 6 long', [...S0, 'context', 'home_form'], 'WWWWWW'],
      ['empty form', [...S0, 'context', 'home_form'], ''],
      ['lowercase selection', [...S0, 'selection'], 'home'],
      ['version 0', [...S0, 'version'], 0],
      ['version 1.5', [...S0, 'version'], 1.5],
      [
        'v1 with supersedes',
        [...S0, 'supersedes'],
        { version: 1, versioned_at: '2026-11-09T07:00:00Z' },
      ],
      ['v2 with supersedes', [...S0, 'version'], 2],
      ['duplicate flags', [...S0, 'quality_flags'], ['stale_odds', 'stale_odds']],
      ['unknown flag', [...S0, 'quality_flags'], ['nope']],
      ['duplicate injuries', [...S0, 'context', 'injuries_home'], ['A. Player', 'A. Player']],
      ['empty injury name', [...S0, 'context', 'injuries_home'], ['']],
      ['league_code SA', [...S0, 'league_code'], 'SA'],
      ['bad signal_id', [...S0, 'signal_id'], 'x'],
      ['bad match_id', [...S0, 'match_id'], 'PL_2026119_ARS_CHE'],
      ['team code too long', [...S0, 'home_code'], 'ABCDEF'],
      ['market OU', [...S0, 'market'], 'OU25'],
      ['extra top-level', ['extra'], 1],
      ['missing generated_at', ['generated_at'], DELETE],
      ['bad model_version', ['model_version'], 'dc-elo'],
      ['signals not array', ['signals'], {}],
      ['summary too long', [...S0, 'context', 'summary'], 'x'.repeat(281)],
      ['lineup string', [...S0, 'context', 'lineup_confirmed'], 'yes'],
    ],
  },
  results: {
    base: 'day1-results/results.json',
    cases: [
      ['goals 99', [...R0, 'home_goals'], 99],
      ['goals 100', [...R0, 'home_goals'], 100],
      ['goals float', [...R0, 'home_goals'], 1.5],
      ['finished null goals', [...R0, 'away_goals'], null],
      ['postponed', [...R0, 'status'], 'POSTPONED'],
      ['in play', [...R0, 'status'], 'IN_PLAY'],
      ['closing null', [...R0, 'closing_odds'], null],
      ['closing extra key', [...R0, 'closing_odds'], { HOME: 2, DRAW: 3, AWAY: 4, X: 2 }],
      ['closing odds 1', [...R0, 'closing_odds'], { HOME: 1, DRAW: 3, AWAY: 4 }],
      ['extra field', [...R0, 'note'], 'x'],
      ['schema_version 2', ['schema_version'], 2],
    ],
  },
  meta: {
    base: 'day1-normal/meta.json',
    cases: [
      [
        'extra source',
        ['sources_health', 'model'],
        { status: 'ok', checked_at: '2026-11-09T07:00:00Z', detail: null },
      ],
      [
        'bad source key',
        ['sources_health', 'Model'],
        { status: 'ok', checked_at: '2026-11-09T07:00:00Z', detail: null },
      ],
      ['missing odds source', ['sources_health', 'odds'], DELETE],
      ['empty notice', ['notice'], ''],
      ['notice', ['notice'], 'Hello'],
      ['notice too long', ['notice'], 'x'.repeat(501)],
      ['min_app_version 1.0', ['min_app_version'], '1.0'],
      ['empty detail', ['sources_health', 'odds', 'detail'], ''],
      ['detail', ['sources_health', 'odds', 'detail'], 'rate limited'],
    ],
  },
};

describe.each(Object.entries(MUTATIONS) as [FeedKind, (typeof MUTATIONS)[FeedKind]][])(
  'mutation parity: %s',
  (kind, { base, cases }) => {
    const doc = load(base);
    it.each(cases)('%s', (_name, at, value) => {
      const json = mutate(doc, at, value);
      const expected = validators[kind](json) as boolean;
      expect(FEED_SCHEMAS[kind].safeParse(json).success).toBe(expected);
    });
  },
);

describe('parsed types feed the domain and services', () => {
  it('a parsed signal is a FreezableSignal and a parsed result a MatchResult', () => {
    const s = parseFeed(
      'signals',
      fs.readFileSync(path.join(SAMPLES, 'day1-normal/signals.json'), 'utf8'),
    );
    const r = parseFeed(
      'results',
      fs.readFileSync(path.join(SAMPLES, 'day1-results/results.json'), 'utf8'),
    );
    if (!s.ok || !r.ok) throw new Error('samples must parse');
    // Compile-time checks: these assignments fail `tsc` if the shapes drift.
    const freezable: FreezableSignal[] = s.data.signals;
    const results: MatchResult[] = r.data.results;
    expect(freezable.length).toBeGreaterThan(0);
    expect(results.length).toBeGreaterThan(0);
  });
});
