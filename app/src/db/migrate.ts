/** `PRAGMA user_version`-based migration runner. Each migration runs in its own transaction. */
import type { SqlDriver } from './driver';
import { MIGRATIONS, type Migration } from './migrations';

export function schemaVersion(db: SqlDriver): number {
  return db.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
}

/** Applies the pending migrations and returns the versions applied. */
export function migrate(db: SqlDriver, migrations: readonly Migration[] = MIGRATIONS): number[] {
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) throw new Error(`migration ${m.name} has version ${m.version}`);
  });
  const current = schemaVersion(db);
  if (current > migrations.length) {
    throw new Error(`database schema ${current} is newer than this app (${migrations.length})`);
  }
  const applied: number[] = [];
  for (const m of migrations.slice(current)) {
    db.transaction(() => {
      db.exec(m.sql);
      db.exec(`PRAGMA user_version = ${m.version}`);
    });
    applied.push(m.version);
  }
  return applied;
}

/** Connection setup every driver needs, then migrations. */
export function prepareDatabase(db: SqlDriver): SqlDriver {
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  migrate(db);
  return db;
}
