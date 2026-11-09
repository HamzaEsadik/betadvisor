/** First-launch state (NFR-U2) and the Setup action (FR-S1). */
import type { SqlDriver } from '@/src/db/driver';
import { repos } from '@/src/db/repos';
import { createSession } from '@/src/db/services';
import type { SessionRecord } from '@/src/db/repos';

/** Settings key holding when the disclaimer was accepted. */
export const DISCLAIMER_KEY = 'disclaimer_accepted_at';

/** Setup is shown until there is an active session and the disclaimer has been accepted. */
export function needsSetup(db: SqlDriver): boolean {
  const r = repos(db);
  return (
    r.sessions.getActive() === undefined || r.settings.get<string>(DISCLAIMER_KEY) === undefined
  );
}

/** Records the disclaimer acceptance and starts the first session, in one transaction. */
export function startFirstSession(db: SqlDriver, budgetCents: number, now: Date): SessionRecord {
  return db.transaction(() => {
    const r = repos(db);
    r.settings.set(DISCLAIMER_KEY, now.toISOString());
    return r.sessions.getActive() ?? createSession(db, budgetCents, now);
  });
}
