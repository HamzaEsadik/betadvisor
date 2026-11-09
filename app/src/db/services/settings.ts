/** Design 07: staking settings changed in Settings apply to advice from the next local day. */
import { addDays, dayKeyOf, dayStartUtc, type OffsetFn } from '../../domain/day';
import { scheduleSettings } from '../../domain/settings';
import type { StakeSettings } from '../../domain/types';
import type { SqlDriver } from '../driver';
import { repos, type SessionRecord } from '../repos';

/** When a change made at `now` takes effect: the start of the next local day. */
export function nextDayStart(now: Date, offsetOf?: OffsetFn): Date {
  return dayStartUtc(addDays(dayKeyOf(now, offsetOf), 1), offsetOf);
}

/**
 * Schedules new staking settings for the active session from the next local day. Frozen bets
 * never change (NFR-I1), and today's advice keeps today's settings.
 */
export function scheduleStakeSettings(
  db: SqlDriver,
  wanted: StakeSettings,
  now: Date,
  offsetOf?: OffsetFn,
): SessionRecord {
  return db.transaction(() => {
    const r = repos(db);
    const session = r.sessions.getActive();
    if (!session) throw new Error('no active session');
    const next = scheduleSettings(
      { settings: session.settings, next: session.nextSettings },
      wanted,
      now,
      nextDayStart(now, offsetOf),
    );
    r.sessions.updateSettings(session.id, next);
    return r.sessions.getById(session.id)!;
  });
}
