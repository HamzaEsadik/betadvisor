export interface Migration {
  /** Becomes `PRAGMA user_version` once applied. Versions are 1, 2, 3, ... in order. */
  version: number;
  name: string;
  sql: string;
}
