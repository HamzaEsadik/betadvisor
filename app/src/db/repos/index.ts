import type { SqlDriver } from '../driver';
import { bankrollRepo } from './bankrollRepo';
import { betsRepo } from './betsRepo';
import { cacheRepo } from './cacheRepo';
import { sessionsRepo } from './sessionsRepo';
import { settingsRepo } from './settingsRepo';

export * from './bankrollRepo';
export * from './betsRepo';
export * from './cacheRepo';
export * from './sessionsRepo';
export * from './settingsRepo';

export function repos(db: SqlDriver) {
  return {
    sessions: sessionsRepo(db),
    bets: betsRepo(db),
    bankroll: bankrollRepo(db),
    cache: cacheRepo(db),
    settings: settingsRepo(db),
  };
}

export type Repos = ReturnType<typeof repos>;
