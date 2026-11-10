/**
 * FR-N1: the optional daily "New advice is ready" reminder, a local notification on its own
 * Android channel. Permission (`POST_NOTIFICATIONS`, Android 13+) is asked for only when the user
 * turns the reminder on. Exact alarms are not requested, so it may arrive a few minutes late.
 */
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';

import type { ClockTime } from '../features/settings/prefs';

export const REMINDER_ID = 'daily-advice';
export const REMINDER_CHANNEL = 'daily-advice';
/** The route a tap on the reminder opens: Today. */
export const REMINDER_URL = '/' as const;

export const PERMISSION_DENIED_TEXT =
  'Notifications are blocked for BetAdvisor. Allow them in Android Settings › Apps › BetAdvisor › Notifications to get the daily reminder.';

export function parseClock(time: ClockTime): { hour: number; minute: number } {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!m) throw new Error(`bad reminder time ${JSON.stringify(time)}`);
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

/** Android 13+ shows the permission prompt only once a channel exists, so this comes first. */
export async function ensureChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
    name: 'Daily advice',
    description: 'A daily reminder that new advice is ready',
    importance: AndroidImportance.DEFAULT,
  });
}

/** Asks for permission if it is not granted yet. Returns whether notifications may be posted. */
export async function requestPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export async function cancelReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
}

/** Replaces any scheduled reminder with one at `time` every day (device local time). */
export async function scheduleReminder(time: ClockTime): Promise<void> {
  const { hour, minute } = parseClock(time);
  await ensureChannel();
  await cancelReminder();
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: 'BetAdvisor',
      body: 'New advice is ready',
      data: { url: REMINDER_URL },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: REMINDER_CHANNEL,
    },
  });
}

/** The user turned the reminder on. False when permission is denied (the toggle stays off). */
export async function enableReminder(time: ClockTime): Promise<boolean> {
  await ensureChannel();
  if (!(await requestPermission())) return false;
  await scheduleReminder(time);
  return true;
}

/**
 * App start: re-applies the stored preference without prompting. Returns whether the reminder is
 * on; false when the user has since revoked the permission in Android settings.
 */
export async function syncReminder(enabled: boolean, time: ClockTime): Promise<boolean> {
  if (!enabled) {
    await cancelReminder();
    return false;
  }
  if (!(await Notifications.getPermissionsAsync()).granted) {
    await cancelReminder();
    return false;
  }
  await scheduleReminder(time);
  return true;
}

/** Shows the reminder even when the app is open. */
export function installNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: () =>
      Promise.resolve({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
  });
}

/** The route a notification response asks for, if it is one of ours. */
export function routeOf(
  response: Notifications.NotificationResponse | null,
): typeof REMINDER_URL | null {
  if (response === null) return null;
  if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null;
  const url: unknown = response.notification.request.content.data?.url;
  return url === REMINDER_URL ? REMINDER_URL : null;
}
