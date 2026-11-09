import { useCallback, useMemo } from 'react';

import { useThemeMode } from '@/src/theme';
import { useAppEnv } from '../app/AppEnv';
import { readPrefs, writePref, type Prefs } from './prefs';

/** The preferences, re-read after every database write, and a setter that saves one. */
export function usePrefs(): [Prefs, <K extends keyof Prefs>(key: K, value: Prefs[K]) => void] {
  const { db, revision, invalidate } = useAppEnv();
  const { setMode } = useThemeMode();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `revision` signals a database write
  const prefs = useMemo(() => readPrefs(db), [db, revision]);
  const set = useCallback(
    <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
      writePref(db, key, value);
      if (key === 'theme') setMode(value as Prefs['theme']);
      invalidate();
    },
    [db, invalidate, setMode],
  );
  return [prefs, set];
}
