/** Typed access to the test hooks of the `expo-notifications` manual mock. Tests only. */
import * as Notifications from 'expo-notifications';

import type * as Mock from '@/__mocks__/expo-notifications';

export const notificationsMock = Notifications as unknown as typeof Mock;
