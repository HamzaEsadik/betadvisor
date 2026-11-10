/**
 * In-memory stand-in for `expo-notifications` (no native module under Jest). Tests drive the
 * permission answers through `mockState` and read what was scheduled from it.
 */
/* eslint-disable @typescript-eslint/require-await -- mirrors the async native API */

type Listener = (response: unknown) => void;

export const mockState = {
  granted: false,
  canAskAgain: true,
  /** What the system prompt answers. */
  grantOnRequest: true,
  requests: 0,
  channels: new Map<string, Record<string, unknown>>(),
  scheduled: new Map<string, { content: unknown; trigger: unknown }>(),
  lastResponse: null as unknown,
  listeners: new Set<Listener>(),
  handler: null as unknown,
};

export function mockReset(): void {
  mockState.granted = false;
  mockState.canAskAgain = true;
  mockState.grantOnRequest = true;
  mockState.requests = 0;
  mockState.channels.clear();
  mockState.scheduled.clear();
  mockState.lastResponse = null;
  mockState.listeners.clear();
  mockState.handler = null;
}

export enum AndroidImportance {
  DEFAULT = 5,
  HIGH = 6,
}

export enum SchedulableTriggerInputTypes {
  DAILY = 'daily',
}

export const DEFAULT_ACTION_IDENTIFIER = 'expo.modules.notifications.actions.DEFAULT';

const status = () => ({
  granted: mockState.granted,
  canAskAgain: mockState.canAskAgain,
  status: mockState.granted ? 'granted' : 'denied',
  expires: 'never',
});

export const getPermissionsAsync = jest.fn(async () => status());

export const requestPermissionsAsync = jest.fn(async () => {
  mockState.requests += 1;
  if (mockState.canAskAgain) {
    mockState.granted = mockState.grantOnRequest;
    mockState.canAskAgain = mockState.granted;
  }
  return status();
});

export const setNotificationChannelAsync = jest.fn(
  async (id: string, channel: Record<string, unknown>) => {
    mockState.channels.set(id, channel);
    return { id, ...channel };
  },
);

export const scheduleNotificationAsync = jest.fn(
  async (req: { identifier: string; content: unknown; trigger: unknown }) => {
    mockState.scheduled.set(req.identifier, { content: req.content, trigger: req.trigger });
    return req.identifier;
  },
);

export const cancelScheduledNotificationAsync = jest.fn(async (id: string) => {
  mockState.scheduled.delete(id);
});

export const setNotificationHandler = jest.fn((handler: unknown) => {
  mockState.handler = handler;
});

export const getLastNotificationResponse = jest.fn(() => mockState.lastResponse);

export const addNotificationResponseReceivedListener = jest.fn((listener: Listener) => {
  mockState.listeners.add(listener);
  return { remove: () => mockState.listeners.delete(listener) };
});

/** Simulates a tap on a notification. */
export function mockTap(response: unknown): void {
  mockState.listeners.forEach((l) => l(response));
}
