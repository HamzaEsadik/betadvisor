import { render, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider, type ThemeMode } from '@/src/theme';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

/** Renders inside the app providers, with a fixed theme mode. */
export function renderWithTheme(
  ui: ReactElement,
  mode: ThemeMode = 'dark',
  options?: RenderOptions,
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider initialMode={mode}>{children}</ThemeProvider>
      </SafeAreaProvider>
    );
  }
  return render(ui, { wrapper: Wrapper, ...options });
}
