import { useFocusEffect } from 'expo-router';
import { useCallback, useReducer } from 'react';

/**
 * A counter bumped each time the screen gains focus. Tab screens stay mounted, so a screen that
 * reads the database adds it to its memo deps to pick up writes made elsewhere (settlement).
 */
export function useFocusRevision(): number {
  const [n, bump] = useReducer((x: number) => x + 1, 0);
  useFocusEffect(useCallback(() => bump(), []));
  return n;
}
