import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { themes, type Scheme, type Theme } from './tokens';

/** User preference. `system` follows the device setting; the design defaults to dark. */
export type ThemeMode = 'system' | 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function resolveScheme(mode: ThemeMode, system: string | null | undefined): Scheme {
  if (mode !== 'system') return mode;
  return system === 'light' ? 'light' : 'dark';
}

interface ThemeProviderProps {
  children: ReactNode;
  /** Initial mode; persisted in Settings from Part 14. */
  initialMode?: ThemeMode;
}

export function ThemeProvider({ children, initialMode = 'system' }: ThemeProviderProps) {
  const system = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>(initialMode);
  const scheme = resolveScheme(mode, system);
  const value = useMemo(() => ({ theme: themes[scheme], mode, setMode }), [scheme, mode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

export function useTheme(): Theme {
  return useThemeContext().theme;
}

export function useThemeMode(): Pick<ThemeContextValue, 'mode' | 'setMode'> {
  const { mode, setMode } = useThemeContext();
  return { mode, setMode };
}
