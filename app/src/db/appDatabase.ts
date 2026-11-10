/**
 * The on-device database, opened and migrated once per JS runtime. The UI and the background
 * task share this handle, so a task that runs while the app is open never opens a second
 * connection.
 */
import type { SqlDriver } from './driver';
import { openExpoDriver } from './expoDriver';
import { prepareDatabase } from './migrate';

let db: SqlDriver | null = null;

export function appDatabase(): SqlDriver {
  db ??= prepareDatabase(openExpoDriver());
  return db;
}
