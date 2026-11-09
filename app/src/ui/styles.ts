import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';

import { useTheme, type Theme } from '@/src/theme';

/**
 * Themed stylesheet hook: `const useStyles = makeStyles((t) => ({ ... }))`. Each theme's sheet is
 * built once and cached, so components do not rebuild styles on every render.
 */
type NamedStyles = Record<string, ViewStyle | TextStyle | ImageStyle>;

export function makeStyles<T extends NamedStyles>(
  factory: (theme: Theme) => T & NamedStyles,
): () => T {
  const cache = new WeakMap<Theme, T>();
  return function useStyles(): T {
    const theme = useTheme();
    let sheet = cache.get(theme);
    if (sheet === undefined) {
      sheet = StyleSheet.create(factory(theme));
      cache.set(theme, sheet);
    }
    return sheet;
  };
}

/** Tap targets are at least 48 dp (SRS 7.1); smaller visuals extend their touch area with this. */
export function hitSlopFor(height: number, minimum = 48): number {
  return Math.max(0, Math.ceil((minimum - height) / 2));
}

/** The card surface shared by SignalCard, SessionCard and others (`.ba-card`). */
export function cardStyle(theme: Theme) {
  return {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.line,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.space[4],
    ...theme.shadows.card,
  } as const;
}
