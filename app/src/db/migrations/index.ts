import { migration001 } from './001_init';
import { migration002 } from './002_session_settings';
import type { Migration } from './types';

export type { Migration } from './types';

export const MIGRATIONS: readonly Migration[] = [migration001, migration002];
