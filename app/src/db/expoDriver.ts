/** `SqlDriver` over `expo-sqlite` (synchronous API). */
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import { createTransaction, type SqlDriver, type SqlParams } from './driver';

export const DATABASE_NAME = 'betadvisor.db';

export function wrapExpoDatabase(db: SQLiteDatabase): SqlDriver {
  const exec = (sql: string) => {
    db.execSync(sql);
  };
  return {
    exec,
    run(sql, params: SqlParams = []) {
      const r = db.runSync(sql, [...params]);
      return { changes: r.changes, lastInsertRowId: r.lastInsertRowId };
    },
    get<T>(sql: string, params: SqlParams = []) {
      return db.getFirstSync<T>(sql, [...params]) ?? undefined;
    },
    all<T>(sql: string, params: SqlParams = []) {
      return db.getAllSync<T>(sql, [...params]);
    },
    transaction: createTransaction(exec),
  };
}

export function openExpoDriver(name = DATABASE_NAME): SqlDriver {
  return wrapExpoDatabase(openDatabaseSync(name));
}
