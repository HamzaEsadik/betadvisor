import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';

import { useTheme } from '@/src/theme';
import { useAppEnv } from './AppEnv';
import { needsSetup } from './session';

/**
 * The root stack. First launch (no active session or disclaimer not accepted) only reaches Setup;
 * afterwards the tabs and the bet detail route. Flipping the guard redirects automatically.
 */
export function RootNavigator() {
  const theme = useTheme();
  const { db, revision } = useAppEnv();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `revision` signals a database write
  const setup = useMemo(() => needsSetup(db), [db, revision]);

  const navTheme = useMemo(() => {
    const base = theme.scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: theme.colors.brand,
        background: theme.colors.bg,
        card: theme.colors.surface,
        text: theme.colors.ink,
        border: theme.colors.line,
      },
    };
  }, [theme]);

  return (
    <NavThemeProvider value={navTheme}>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!setup}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="signal/[id]" />
        </Stack.Protected>
        <Stack.Protected guard={setup}>
          <Stack.Screen name="setup" />
        </Stack.Protected>
      </Stack>
    </NavThemeProvider>
  );
}
