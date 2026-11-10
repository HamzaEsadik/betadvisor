/**
 * App entry. FR-N2: the settlement task must be defined whenever the bundle loads, including the
 * headless runtime Android starts for WorkManager when the app process is dead. expo-router only
 * evaluates `app/_layout.tsx` when it renders UI, which never happens headless, so the task is
 * defined here. The whole bundle evaluates before Android hands it a task, so order is safe.
 */
import 'expo-router/entry';

import { defineSettlementTask } from './src/background/task';
import { settlementTaskDeps } from './src/features/app/createAppEnv';

defineSettlementTask(settlementTaskDeps);
