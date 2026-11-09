/** Hooks that read the active session and build a day view from the database and the feed. */
import { useEffect, useMemo, useReducer } from 'react';

import { useFeed, useFeedStore } from '@/src/api/FeedProvider';
import { repos, type BetRecord, type SessionRecord } from '@/src/db/repos';
import { daySlots, dayStartUtc, type DaySlot } from '@/src/domain/day';
import { settingsAt } from '@/src/domain/settings';
import { referenceNow } from '@/src/domain/stakes';
import { useAppEnv } from '../app/AppEnv';
import { buildDayView, type DayView } from './model';

export interface SessionSnapshot {
  session: SessionRecord;
  bets: BetRecord[];
  bankrollCents: number;
  openBets: number;
  openStakeCents: number;
}

/** The active session with its bets and bankroll; null before Setup. */
export function useSessionSnapshot(): SessionSnapshot | null {
  const { db, revision } = useAppEnv();
  return useMemo(() => {
    const r = repos(db);
    const session = r.sessions.getActive();
    if (!session) return null;
    const bets = r.bets.listBySession(session.id);
    const open = bets.filter((b) => b.status === 'open');
    return {
      session,
      bets,
      bankrollCents: r.bankroll.current(session.id),
      openBets: open.length,
      openStakeCents: open.reduce((t, b) => t + b.stakeCents, 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `revision` signals a database write
  }, [db, revision]);
}

/** Re-renders every minute so kickoff and staleness checks follow the clock. */
export function useMinuteTick(): void {
  const store = useFeedStore();
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const id = setInterval(() => {
      store.recheck();
      tick();
    }, 60_000);
    return () => clearInterval(id);
  }, [store]);
}

/** The day view for a chip, or null before Setup. */
export function useDayView(slot: DaySlot, snapshot: SessionSnapshot | null): DayView | null {
  const { db, offsetOf } = useAppEnv();
  const feed = useFeed();
  const store = useFeedStore();
  if (!snapshot) return null;
  const clock = store.clock();
  const day = daySlots(referenceNow(clock), offsetOf)[slot];
  const dayStart = dayStartUtc(day, offsetOf);
  const { session } = snapshot;
  const base =
    slot === 'tomorrow'
      ? snapshot.bankrollCents
      : repos(db).bankroll.atDayStart(session.id, dayStart.toISOString());
  return buildDayView({
    slot,
    signals: feed.signals?.signals ?? [],
    bets: snapshot.bets,
    // A change made in Settings applies from the next day (design 07).
    settings: settingsAt({ settings: session.settings, next: session.nextSettings }, dayStart),
    baseBankrollCents: base,
    clock,
    isStale: feed.isStale,
    offsetOf,
  });
}
