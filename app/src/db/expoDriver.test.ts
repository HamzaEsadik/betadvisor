/** Checks the expo-sqlite adapter against a fake `SQLiteDatabase` backed by better-sqlite3. */
import { openExpoDriver } from './expoDriver';
import { prepareDatabase } from './migrate';

jest.mock('expo-sqlite', () => {
  const Sqlite = jest.requireActual<typeof import('better-sqlite3')>('better-sqlite3');
  return {
    openDatabaseSync: jest.fn((name: string) => {
      const db = new Sqlite(':memory:');
      return {
        databaseName: name,
        execSync: (sql: string) => db.exec(sql),
        runSync: (sql: string, params: unknown[]) => {
          const r = db.prepare(sql).run(...params);
          return { changes: r.changes, lastInsertRowId: Number(r.lastInsertRowid) };
        },
        getFirstSync: (sql: string, params: unknown[]) => db.prepare(sql).get(...params) ?? null,
        getAllSync: (sql: string, params: unknown[]) => db.prepare(sql).all(...params),
      };
    }),
  };
});

it('maps the SqlDriver calls onto expo-sqlite', () => {
  const db = prepareDatabase(openExpoDriver());
  db.exec('CREATE TABLE t (v INTEGER)');
  expect(db.run('INSERT INTO t VALUES (?)', [7])).toEqual({ changes: 1, lastInsertRowId: 1 });
  expect(db.run('INSERT INTO t VALUES (8)')).toEqual({ changes: 1, lastInsertRowId: 2 });
  expect(db.get<{ v: number }>('SELECT v FROM t WHERE v = ?', [7])).toEqual({ v: 7 });
  expect(db.get('SELECT v FROM t WHERE v = 0')).toBeUndefined();
  expect(db.get('SELECT 1 AS one')).toEqual({ one: 1 });
  expect(db.all<{ v: number }>('SELECT v FROM t ORDER BY v')).toEqual([{ v: 7 }, { v: 8 }]);
  expect(db.all('SELECT v FROM t WHERE v > ?', [7])).toEqual([{ v: 8 }]);
  expect(() =>
    db.transaction(() => {
      db.run('INSERT INTO t VALUES (9)');
      throw new Error('crash');
    }),
  ).toThrow('crash');
  expect(db.all('SELECT v FROM t')).toHaveLength(2);
});
