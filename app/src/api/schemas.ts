/**
 * Zod mirrors of `schemas/*.schema.json` (NFR-S3). `schemas.test.ts` runs every `feed-samples`
 * file (plus targeted mutations) through both these schemas and Ajv, so the two cannot drift.
 * Every object is strict: an unknown field is a contract change and is rejected.
 */
import { z } from 'zod';

const UTC_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?Z$/;
const MODEL_VERSION_RE = /^[a-z0-9-]+-[0-9]+\.[0-9]+\.[0-9]+$/;
const LEAGUE_CODES = ['PL', 'PD', 'BL1', 'FL1'] as const;
const MATCH_ID_RE = /^(PL|PD|BL1|FL1)_[0-9]{8}_[A-Z0-9]{2,5}_[A-Z0-9]{2,5}$/;
const SIGNAL_ID_RE =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}_(PL|PD|BL1|FL1)_[A-Z0-9]{2,5}-[A-Z0-9]{2,5}_1X2_(HOME|DRAW|AWAY)$/;

/** UTC timestamp with a `Z` suffix that is also a real calendar date and time. */
const utcDateTime = z.string().regex(UTC_RE).pipe(z.iso.datetime());
const modelVersion = z.string().regex(MODEL_VERSION_RE);
const probability = z.number().gt(0).lt(1);
const odds = z.number().gt(1).lte(1000);
const selection = z.enum(['HOME', 'DRAW', 'AWAY']);

function unique<T>(items: readonly T[]): boolean {
  return new Set(items).size === items.length;
}

const absences = z
  .array(z.string().min(1).max(80))
  .refine(unique, { message: 'items must be unique' });

const context = z
  .strictObject({
    home_form: z.string().regex(/^[WDL]{0,5}$/),
    away_form: z.string().regex(/^[WDL]{0,5}$/),
    availability_status: z.enum(['reported', 'unknown']),
    injuries_home: absences,
    injuries_away: absences,
    lineup_confirmed: z.boolean(),
    summary: z.string().min(1).max(280),
  })
  .superRefine((c, ctx) => {
    if (c.availability_status !== 'unknown') return;
    for (const key of ['injuries_home', 'injuries_away'] as const) {
      if (c[key].length > 0) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'no absences allowed when availability is unknown',
        });
      }
    }
  });

export const feedSkipReason = z.enum([
  'no_edge',
  'below_threshold',
  'odds_out_of_range',
  'missing_data',
  'low_confidence',
]);

export const qualityFlag = z.enum([
  'low_data',
  'stale_odds',
  'form_incomplete',
  'single_bookmaker',
]);

export const signalSchema = z
  .strictObject({
    signal_id: z.string().regex(SIGNAL_ID_RE),
    version: z.int().min(1),
    versioned_at: utcDateTime,
    supersedes: z.strictObject({ version: z.int().min(1), versioned_at: utcDateTime }).nullable(),
    match_id: z.string().regex(MATCH_ID_RE),
    league: z.enum(['Premier League', 'La Liga', 'Bundesliga', 'Ligue 1']),
    league_code: z.enum(LEAGUE_CODES),
    home_team: z.string().min(1).max(60),
    away_team: z.string().min(1).max(60),
    home_code: z.string().regex(/^[A-Z0-9]{2,5}$/),
    away_code: z.string().regex(/^[A-Z0-9]{2,5}$/),
    kickoff_at: utcDateTime,
    market: z.literal('1X2'),
    selection,
    odds,
    bookmaker: z.string().min(1).max(60),
    odds_fetched_at: utcDateTime,
    model_prob: probability,
    implied_prob: probability,
    edge: z.number().gte(-1),
    stake_fraction: z.number().gte(0).lte(1),
    recommended: z.boolean(),
    skip_reason: feedSkipReason.nullable(),
    quality_flags: z.array(qualityFlag).refine(unique, { message: 'items must be unique' }),
    context,
  })
  .superRefine((s, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (s.recommended) {
      if (s.skip_reason !== null) issue('skip_reason', 'recommended signals have no skip reason');
      if (!(s.stake_fraction > 0)) issue('stake_fraction', 'recommended stake must be > 0');
      if (!(s.edge > 0)) issue('edge', 'recommended edge must be > 0');
    } else {
      if (s.skip_reason === null) issue('skip_reason', 'skipped signals need a skip reason');
      if (s.stake_fraction !== 0) issue('stake_fraction', 'skipped stake must be 0');
    }
    if ((s.version === 1) !== (s.supersedes === null)) {
      issue('supersedes', 'supersedes is null exactly when version is 1');
    }
    if (s.context.availability_status === 'unknown' && !s.quality_flags.includes('low_data')) {
      issue('quality_flags', 'unknown availability needs the low_data flag');
    }
  });

export const signalsFeedSchema = z.strictObject({
  schema_version: z.literal(1),
  generated_at: utcDateTime,
  model_version: modelVersion,
  signals: z.array(signalSchema),
});

const goals = z.int().min(0).max(99);

export const resultSchema = z
  .strictObject({
    match_id: z.string().regex(MATCH_ID_RE),
    status: z.enum(['FINISHED', 'POSTPONED', 'CANCELLED', 'ABANDONED']),
    home_goals: goals.nullable(),
    away_goals: goals.nullable(),
    closing_odds: z.strictObject({ HOME: odds, DRAW: odds, AWAY: odds }).nullable(),
  })
  .superRefine((r, ctx) => {
    if (r.status !== 'FINISHED') return;
    for (const key of ['home_goals', 'away_goals'] as const) {
      if (r[key] === null) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'finished matches need a score' });
      }
    }
  });

export const resultsFeedSchema = z.strictObject({
  schema_version: z.literal(1),
  generated_at: utcDateTime,
  results: z.array(resultSchema),
});

const SOURCE_KEY_RE = /^[a-z][a-z0-9_]*$/;
const REQUIRED_SOURCES = ['fixtures', 'odds', 'injuries', 'results'] as const;

export const sourceHealthSchema = z.strictObject({
  status: z.enum(['ok', 'degraded', 'failed', 'disabled']),
  checked_at: utcDateTime,
  detail: z.string().min(1).max(300).nullable(),
});

export const metaFeedSchema = z.strictObject({
  schema_version: z.literal(1),
  generated_at: utcDateTime,
  model_version: modelVersion,
  min_app_version: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/),
  notice: z.string().min(1).max(500).nullable(),
  sources_health: z
    .record(z.string().regex(SOURCE_KEY_RE), sourceHealthSchema)
    .superRefine((h, ctx) => {
      for (const key of REQUIRED_SOURCES) {
        if (!Object.hasOwn(h, key)) {
          ctx.addIssue({ code: 'custom', path: [], message: `missing source "${key}"` });
        }
      }
    }),
});

export type Signal = z.infer<typeof signalSchema>;
export type SignalsFeed = z.infer<typeof signalsFeedSchema>;
export type Result = z.infer<typeof resultSchema>;
export type ResultsFeed = z.infer<typeof resultsFeedSchema>;
export type MetaFeed = z.infer<typeof metaFeedSchema>;
export type SourceHealth = z.infer<typeof sourceHealthSchema>;

export type FeedKind = 'signals' | 'results' | 'meta';

export interface FeedDocs {
  signals: SignalsFeed;
  results: ResultsFeed;
  meta: MetaFeed;
}

export const FEED_SCHEMAS: { [K in FeedKind]: z.ZodType<FeedDocs[K]> } = {
  signals: signalsFeedSchema,
  results: resultsFeedSchema,
  meta: metaFeedSchema,
};

export type ParseOutcome<T> =
  { ok: true; data: T } | { ok: false; error: string; path: (string | number)[] | null };

/** Parses raw JSON text against the feed schema. Never throws. */
export function parseFeed<K extends FeedKind>(kind: K, text: string): ParseOutcome<FeedDocs[K]> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `invalid JSON: ${(e as Error).message}`, path: null };
  }
  const r = FEED_SCHEMAS[kind].safeParse(json);
  if (r.success) return { ok: true, data: r.data };
  const first = r.error.issues[0];
  const path = first ? first.path.map((p) => (typeof p === 'symbol' ? String(p) : p)) : [];
  return { ok: false, error: z.prettifyError(r.error), path };
}
