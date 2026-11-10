/**
 * Device-only services started once the app is up (not in the route tests): the background
 * settlement task, the daily reminder, and opening Today from a reminder tap.
 */
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { registerSettlementTask } from '@/src/background/task';
import type { SqlDriver } from '@/src/db/driver';
import { installNotificationHandler, routeOf, syncReminder } from '@/src/notifications/reminder';
import { readPref, writePref } from '../settings/prefs';

export async function startAppServices(db: SqlDriver): Promise<void> {
  installNotificationHandler();
  await registerSettlementTask();
  const enabled = readPref(db, 'notificationsEnabled');
  const on = await syncReminder(enabled, readPref(db, 'notificationTime'));
  // Permission revoked in Android settings: show the reminder as off rather than pretend.
  if (enabled && !on) writePref(db, 'notificationsEnabled', false);
}

export function useAppServices(db: SqlDriver, onChange: () => void): void {
  useEffect(() => {
    startAppServices(db)
      .then(onChange)
      .catch((e: unknown) => console.error('starting app services failed', e));
  }, [db, onChange]);

  useEffect(() => {
    const open = (r: Notifications.NotificationResponse | null) => {
      const route = routeOf(r);
      if (route !== null) router.navigate(route);
    };
    open(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}
