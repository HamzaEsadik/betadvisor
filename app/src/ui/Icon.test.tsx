import { screen } from '@testing-library/react-native';

import { darkColors, lightColors } from '@/src/theme';
import { renderWithTheme } from '@/src/test/render';
import { Icon, ICON_NAMES } from './Icon';
import { ICONS } from './icons';

describe('Icon', () => {
  it('has every icon of the design ICONS map', () => {
    expect(ICON_NAMES).toHaveLength(22);
    expect(ICON_NAMES).toEqual(
      expect.arrayContaining(['calendar-days', 'list-ordered', 'chart-line', 'layers', 'settings']),
    );
  });

  it.each(ICON_NAMES)('renders %s with all its shapes', async (name) => {
    await renderWithTheme(<Icon name={name} />);
    // Decorative icons are hidden from accessibility, so hidden elements must be included.
    const svg = screen.getByTestId(`icon-${name}`, { includeHiddenElements: true });
    const group = svg.children[0];
    expect(typeof group).not.toBe('string');
    expect(typeof group !== 'string' && group.children).toHaveLength(ICONS[name].length);
  });

  it('defaults to size 20 and the theme ink color', async () => {
    await renderWithTheme(<Icon name="check" />, 'light');
    const json = JSON.stringify(screen.toJSON());
    expect(json).toContain('"width":20');
    expect(json).not.toContain(darkColors.ink);
    await renderWithTheme(<Icon name="check" color={lightColors.win} size={32} />, 'light');
    expect(JSON.stringify(screen.toJSON())).toContain('"width":32');
  });

  it('is exposed to screen readers only when labelled', async () => {
    await renderWithTheme(<Icon name="lock" label="Frozen" />);
    expect(screen.getByLabelText('Frozen')).toBeOnTheScreen();
    await renderWithTheme(<Icon name="lock" />);
    expect(screen.queryByLabelText('Frozen')).toBeNull();
  });
});
