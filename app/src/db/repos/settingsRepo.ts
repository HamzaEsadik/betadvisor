import type { SqlDriver } from '../driver';

/** App-wide preferences as JSON values (theme, currency, reminder time, ...). */
export function settingsRepo(db: SqlDriver) {
  return {
    get<T>(key: string): T | undefined {
      const r = db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
      return r === undefined ? undefined : (JSON.parse(r.value) as T);
    },

    set(key: string, value: unknown): void {
      const json = JSON.stringify(value);
      if (json === undefined) throw new TypeError(`setting ${key}: value is not JSON`);
      db.run(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [key, json],
      );
    },

    remove(key: string): void {
      db.run('DELETE FROM settings WHERE key = ?', [key]);
    },

    all(): Record<string, unknown> {
      const out: Record<string, unknown> = {};
      for (const r of db.all<{ key: string; value: string }>('SELECT key, value FROM settings')) {
        out[r.key] = JSON.parse(r.value);
      }
      return out;
    },
  };
}

export type SettingsRepo = ReturnType<typeof settingsRepo>;
