import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { FeedProvider } from '@/src/api/FeedProvider';
import { AppEnvProvider } from '@/src/features/app/AppEnv';
import { createAppEnv } from '@/src/features/app/createAppEnv';
import { RootNavigator } from '@/src/features/app/RootNavigator';
import { ThemeProvider, useAppFonts } from '@/src/theme';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  anchor: '(tabs)',
};

// Keep the splash screen up until the fonts are loaded.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useAppFonts();
  // Opened once; a failing migration throws into the ErrorBoundary (loud, never a silent reset).
  const [{ env, feed }] = useState(createAppEnv);

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) void SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppEnvProvider env={env}>
          <FeedProvider store={feed}>
            <RootNavigator />
          </FeedProvider>
        </AppEnvProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
