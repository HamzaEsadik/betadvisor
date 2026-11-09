import { migrate, prepareDatabase, schemaVersion } from './migrate';
import { MIGRATIONS } from './migrations';
import { openTestDriver } from './testDriver';

function table() {
  const db = openTestDriver();
  db.exec('CREATE TABLE t (v INTEGER NOT NULL)');
  const values = () => db.all<{ v: number }>('SELECT v FROM t ORDER BY v').map((r) => r.v);
  return { db, values };
}

describe('transaction', () => {
  it('commits when the callback returns', () => {
    const { db, values } = table();
    const out = db.transaction(() => {
      db.run('INSERT INTO t VALUES (?)', [1]);
      return 'done';
    });
    expect(out).toBe('done');
    expect(values()).toEqual([1]);
  });

  it('rolls back everything when the callback throws (simulated crash)', () => {
    const { db, values } = table();
    expect(() =>
      db.transaction(() => {
        db.run('INSERT INTO t VALUES (?)', [1]);
        throw new Error('crash');
      }),
    ).toThrow('crash');
    expect(values()).toEqual([]);
  });

  it('uses savepoints for nested calls', () => {
    const { db, values } = table();
    db.transaction(() => {
      db.run('INSERT INTO t VALUES (1)');
      expect(() =>
        db.transaction(() => {
          db.run('INSERT INTO t VALUES (2)');
          throw new Error('inner');
        }),
      ).toThrow('inner');
      db.transaction(() => db.run('INSERT INTO t VALUES (3)'));
    });
    expect(values()).toEqual([1, 3]);
  });

  it('an outer failure undoes committed inner work', () => {
    const { db, values } = table();
    expect(() =>
      db.transaction(() => {
        db.transaction(() => db.run('INSERT INTO t VALUES (1)'));
        throw new Error('outer');
      }),
    ).toThrow('outer');
    expect(values()).toEqual([]);
    db.transaction(() => db.run('INSERT INTO t VALUES (4)'));
    expect(values()).toEqual([4]);
  });

  it('rejects async callbacks and rolls back', () => {
    const { db, values } = table();
    expect(() =>
      db.transaction(() => {
        db.run('INSERT INTO t VALUES (1)');
        return Promise.resolve();
      }),
    ).toThrow('synchronous');
    expect(values()).toEqual([]);
  });

  it('get returns undefined when there is no row', () => {
    const { db } = table();
    expect(db.get('SELECT v FROM t')).toBeUndefined();
  });
});

describe('migrate', () => {
  it('applies every migration once and records user_version', () => {
    const db = openTestDriver();
    expect(schemaVersion(db)).toBe(0);
    expect(migrate(db)).toEqual([1]);
    expect(schemaVersion(db)).toBe(MIGRATIONS.length);
    expect(migrate(db)).toEqual([]);
  });

  it('enables foreign keys', () => {
    const db = prepareDatabase(openTestDriver());
    expect(db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')?.foreign_keys).toBe(1);
    expect(() =>
      db.run(
        `INSERT INTO bankroll_history (session_id, at, delta_cents, bankroll_cents, reason)
         VALUES (99, 'x', 0, 0, 'start')`,
      ),
    ).toThrow(/FOREIGN KEY/);
  });

  it('refuses a database newer than the app', () => {
    const db = openTestDriver();
    db.exec('PRAGMA user_version = 99');
    expect(() => migrate(db)).toThrow('newer');
  });

  it('refuses migrations out of order', () => {
    const db = openTestDriver();
    expect(() => migrate(db, [{ version: 2, name: 'x', sql: '' }])).toThrow('version 2');
  });

  it('a failing migration leaves the schema untouched', () => {
    const db = openTestDriver();
    const bad = { version: 1, name: 'bad', sql: 'CREATE TABLE a (x); SELECT nope FROM missing;' };
    expect(() => migrate(db, [bad])).toThrow();
    expect(schemaVersion(db)).toBe(0);
    expect(db.get("SELECT name FROM sqlite_master WHERE name = 'a'")).toBeUndefined();
  });
});
