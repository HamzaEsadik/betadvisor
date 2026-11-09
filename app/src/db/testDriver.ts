/** `SqlDriver` over `better-sqlite3` (dev dependency), for Jest. Never imported by app code. */
import Database from 'better-sqlite3';

import { createTransaction, type SqlDriver, type SqlParams } from './driver';

export function openTestDriver(path = ':memory:'): SqlDriver & { close(): void } {
  const db = new Database(path);
  const exec = (sql: string) => {
    db.exec(sql);
  };
  return {
    exec,
    run(sql, params: SqlParams = []) {
      const r = db.prepare(sql).run(...params);
      return { changes: r.changes, lastInsertRowId: Number(r.lastInsertRowid) };
    },
    get<T>(sql: string, params: SqlParams = []) {
      return db.prepare(sql).get(...params) as T | undefined;
    },
    all<T>(sql: string, params: SqlParams = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    transaction: createTransaction(exec),
    close() {
      db.close();
    },
  };
}
