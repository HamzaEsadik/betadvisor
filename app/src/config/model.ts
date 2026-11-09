/**
 * Decision rules the pipeline applies before a signal reaches the app (pipeline
 * `decision/config.py`, SRS 6.3). The feed does not publish them, so About shows these values.
 * Keep them in step with `DecisionConfig`.
 */
export const MODEL_RULES = Object.freeze({
  /** A selection is a candidate only if model probability × odds − 1 is at least this. */
  minEdge: 0.04,
  /** Fraction of the Kelly stake. */
  kellyMultiplier: 0.25,
  minOdds: 1.4,
  maxOdds: 6.0,
});

/** The hosts the data comes from: the only web addresses the app may show (NFR-L2). */
export const DATA_SOURCE_HOSTS = [
  'the-odds-api.com',
  'football-data.org',
  'football-data.co.uk',
  'api-football.com',
] as const;
