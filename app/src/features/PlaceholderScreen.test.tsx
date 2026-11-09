import { screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { darkColors, lightColors, resolveScheme } from '@/src/theme';
import { renderWithTheme } from '@/src/test/render';
import { PlaceholderScreen } from './PlaceholderScreen';

describe('themed screen', () => {
  it.each([
    ['dark', darkColors],
    ['light', lightColors],
  ] as const)('renders in %s mode with that palette', async (mode, colors) => {
    await renderWithTheme(<PlaceholderScreen title="Today" icon="calendar-days" part={12} />, mode);
    const root = StyleSheet.flatten(screen.getByTestId('screen-today').props.style);
    expect(root.backgroundColor).toBe(colors.bg);
    const title = StyleSheet.flatten(screen.getByText('Today').props.style);
    expect(title.color).toBe(colors.ink);
    expect(title.fontFamily).toBe('BarlowCondensed_600SemiBold');
    expect(
      screen.getByTestId('icon-calendar-days', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
  });
});

describe('resolveScheme', () => {
  it('follows the system in system mode and defaults to dark', () => {
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', null)).toBe('dark');
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });
});
