import { migration001 } from './001_init';
import type { Migration } from './types';

export type { Migration } from './types';

export const MIGRATIONS: readonly Migration[] = [migration001];
