/**
 * A minimal synchronous SQL interface. The app wraps `expo-sqlite` (`expoDriver.ts`); Jest wraps
 * `better-sqlite3` (`testDriver.ts`) so the real SQL, constraints and triggers run in tests.
 *
 * The interface is synchronous on purpose: a transaction is then one uninterrupted block of JS,
 * so no other write can interleave with it (NFR-R2). Every statement is small.
 */

export type SqlValue = string | number | null;
export type SqlParams = readonly SqlValue[];

export interface RunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface SqlDriver {
  /** Runs one or more statements without parameters (DDL, PRAGMA). */
  exec(sql: string): void;
  run(sql: string, params?: SqlParams): RunResult;
  get<T>(sql: string, params?: SqlParams): T | undefined;
  all<T>(sql: string, params?: SqlParams): T[];
  /**
   * Runs `fn` atomically: commits if it returns, rolls back if it throws. Nested calls use
   * savepoints, so a service can call another service. `fn` must be synchronous.
   */
  transaction<T>(fn: () => T): T;
}

/** Builds `transaction` on top of `exec`, with savepoints for nested calls. */
export function createTransaction(exec: (sql: string) => void): SqlDriver['transaction'] {
  let depth = 0;
  return function transaction<T>(fn: () => T): T {
    const savepoint = depth === 0 ? null : `sp_${depth}`;
    exec(savepoint === null ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${savepoint}`);
    depth += 1;
    let out: T;
    try {
      out = fn();
      if (out instanceof Promise) {
        out.catch(() => undefined);
        throw new TypeError('transaction callbacks must be synchronous');
      }
    } catch (error) {
      depth -= 1;
      exec(savepoint === null ? 'ROLLBACK' : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
      throw error;
    }
    depth -= 1;
    exec(savepoint === null ? 'COMMIT' : `RELEASE ${savepoint}`);
    return out;
  };
}
