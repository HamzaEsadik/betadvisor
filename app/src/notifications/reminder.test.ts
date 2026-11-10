/** Part 15: the daily reminder (FR-N1) over the `expo-notifications` manual mock. */
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';

import { freshDb } from '../db/testUtils';
import { startAppServices } from '../features/app/useAppServices';
import { readPref, writePref } from '../features/settings/prefs';
import {
  REMINDER_CHANNEL,
  REMINDER_ID,
  REMINDER_URL,
  cancelReminder,
  enableReminder,
  installNotificationHandler,
  parseClock,
  routeOf,
  scheduleReminder,
  syncReminder,
} from './reminder';
import { notificationsMock } from './testMock';

const { mockReset, mockState } = notificationsMock;

jest.mock('expo-background-task', () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
  getStatusAsync: jest.fn(() => Promise.resolve(2)),
  registerTaskAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskDefined: jest.fn(() => false),
  isTaskRegisteredAsync: jest.fn(() => Promise.resolve(true)),
}));

beforeEach(() => {
  mockReset();
  jest.clearAllMocks();
});

describe('scheduleReminder', () => {
  it('uses a daily trigger at the chosen local time on the reminder channel', async () => {
    await scheduleReminder('07:30');
    expect(mockState.channels.get(REMINDER_CHANNEL)).toMatchObject({
      name: 'Daily advice',
      importance: AndroidImportance.DEFAULT,
    });
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: REMINDER_ID,
      content: { title: 'BetAdvisor', body: 'New advice is ready', data: { url: REMINDER_URL } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 7,
        minute: 30,
        channelId: REMINDER_CHANNEL,
      },
    });
  });

  it('cancels the old reminder before scheduling the new one', async () => {
    await scheduleReminder('07:30');
    await scheduleReminder('21:00');
    const cancel = jest.mocked(Notifications.cancelScheduledNotificationAsync);
    const schedule = jest.mocked(Notifications.scheduleNotificationAsync);
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(cancel.mock.invocationCallOrder[1]!).toBeLessThan(schedule.mock.invocationCallOrder[1]!);
    expect(mockState.scheduled.size).toBe(1);
    expect(mockState.scheduled.get(REMINDER_ID)?.trigger).toMatchObject({ hour: 21, minute: 0 });
    await cancelReminder();
    expect(mockState.scheduled.size).toBe(0);
  });

  it('rejects a malformed time instead of guessing', async () => {
    expect(parseClock('00:05')).toEqual({ hour: 0, minute: 5 });
    await expect(scheduleReminder('7:30')).rejects.toThrow('bad reminder time');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe('enableReminder', () => {
  it('creates the channel before asking (Android 13+), then schedules', async () => {
    await expect(enableReminder('08:00')).resolves.toBe(true);
    const channel = jest.mocked(Notifications.setNotificationChannelAsync);
    const request = jest.mocked(Notifications.requestPermissionsAsync);
    expect(channel.mock.invocationCallOrder[0]!).toBeLessThan(request.mock.invocationCallOrder[0]!);
    expect(mockState.scheduled.has(REMINDER_ID)).toBe(true);
  });

  it('does not prompt when permission is already granted', async () => {
    mockState.granted = true;
    await expect(enableReminder('08:00')).resolves.toBe(true);
    expect(mockState.requests).toBe(0);
  });

  it('denied: schedules nothing; a permanent denial does not prompt again', async () => {
    mockState.grantOnRequest = false;
    await expect(enableReminder('08:00')).resolves.toBe(false);
    await expect(enableReminder('08:00')).resolves.toBe(false);
    expect(mockState.requests).toBe(1);
    expect(mockState.scheduled.size).toBe(0);
  });
});

describe('syncReminder (app start)', () => {
  it('never prompts; schedules only with permission', async () => {
    await expect(syncReminder(true, '07:30')).resolves.toBe(false);
    expect(mockState.requests).toBe(0);
    expect(mockState.scheduled.size).toBe(0);

    mockState.granted = true;
    await expect(syncReminder(true, '07:30')).resolves.toBe(true);
    expect(mockState.scheduled.has(REMINDER_ID)).toBe(true);

    await expect(syncReminder(false, '07:30')).resolves.toBe(false);
    expect(mockState.scheduled.size).toBe(0);
  });

  it('startAppServices turns the preference off when the permission was revoked', async () => {
    const db = freshDb();
    writePref(db, 'notificationsEnabled', true);
    await startAppServices(db);
    expect(readPref(db, 'notificationsEnabled')).toBe(false);

    mockState.granted = true;
    writePref(db, 'notificationsEnabled', true);
    await startAppServices(db);
    expect(readPref(db, 'notificationsEnabled')).toBe(true);
    expect(mockState.scheduled.has(REMINDER_ID)).toBe(true);
    expect(mockState.handler).not.toBeNull();
  });
});

describe('notification handling', () => {
  it('shows the reminder while the app is open, without sound', async () => {
    installNotificationHandler();
    const handler = mockState.handler as Notifications.NotificationHandler;
    await expect(
      handler.handleNotification({} as Notifications.Notification),
    ).resolves.toMatchObject({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
    });
  });

  it('a tap on the reminder routes to Today; other responses route nowhere', () => {
    const response = (url: unknown, action = Notifications.DEFAULT_ACTION_IDENTIFIER) =>
      ({
        actionIdentifier: action,
        notification: { request: { content: { data: { url } } } },
      }) as unknown as Notifications.NotificationResponse;
    expect(routeOf(response(REMINDER_URL))).toBe('/');
    expect(routeOf(response('/ledger'))).toBeNull();
    expect(routeOf(response(REMINDER_URL, 'dismiss'))).toBeNull();
    expect(routeOf(null)).toBeNull();
  });
});
