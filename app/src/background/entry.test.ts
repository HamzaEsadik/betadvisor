/**
 * Part 17: the emulator showed the WorkManager job starting a headless JS runtime that never ran
 * the task, because the task was defined in `app/_layout.tsx`, which expo-router only evaluates
 * when it renders UI. Loading the entry alone, with no rendering, must define the task.
 */
import * as TaskManager from 'expo-task-manager';

import { SETTLEMENT_TASK } from './task';

jest.mock('expo-router/entry', () => ({}));
jest.mock('@/src/features/app/createAppEnv', () => ({ settlementTaskDeps: jest.fn() }));
jest.mock('expo-background-task', () => ({ BackgroundTaskResult: { Success: 1, Failed: 2 } }));
jest.mock('expo-task-manager', () => {
  const defined = new Set<string>();
  return {
    defineTask: jest.fn((name: string) => defined.add(name)),
    isTaskDefined: jest.fn((name: string) => defined.has(name)),
  };
});

it('the app entry defines the settlement task without rendering anything', () => {
  expect(TaskManager.isTaskDefined(SETTLEMENT_TASK)).toBe(false);
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../index');
  });
  expect(TaskManager.isTaskDefined(SETTLEMENT_TASK)).toBe(true);
});

it('package.json points the bundle at that entry', () => {
  expect(require('../../package.json').main).toBe('index.ts');
});
