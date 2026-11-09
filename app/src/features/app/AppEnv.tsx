/**
 * The app's dependencies (database, clock, time zone) as React context, plus a revision counter
 * screens read the database against: after a write, `invalidate()` makes every reader re-query.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { SqlDriver } from '@/src/db/driver';
import type { OffsetFn } from '@/src/domain/day';

export interface AppEnv {
  db: SqlDriver;
  /** Device time. Kickoff checks go through `FeedStore.clock()` (§9.5). */
  now: () => Date;
  /** Pins the time zone in tests; the device zone otherwise. */
  offsetOf?: OffsetFn;
  /** Currency symbol (a setting from Part 14). */
  currency: string;
}

interface AppEnvValue extends AppEnv {
  /** Bumped after every database write. */
  revision: number;
  invalidate: () => void;
}

const AppEnvContext = createContext<AppEnvValue | null>(null);

export function AppEnvProvider({ env, children }: { env: AppEnv; children: ReactNode }) {
  const [revision, setRevision] = useState(0);
  const invalidate = useCallback(() => setRevision((r) => r + 1), []);
  const value = useMemo(() => ({ ...env, revision, invalidate }), [env, revision, invalidate]);
  return <AppEnvContext.Provider value={value}>{children}</AppEnvContext.Provider>;
}

export function useAppEnv(): AppEnvValue {
  const env = useContext(AppEnvContext);
  if (!env) throw new Error('useAppEnv must be used inside <AppEnvProvider>');
  return env;
}
