import { fireEvent, screen } from '@testing-library/react-native';

import { darkColors } from '@/src/theme';
import { renderWithTheme } from '@/src/test/render';
import { Switch } from '../Switch';
import { flat, touchHeight } from './helpers';

describe('Switch', () => {
  it('toggles, exposes its state and has a 48 dp target', async () => {
    const onValueChange = jest.fn();
    await renderWithTheme(
      <Switch value accessibilityLabel="Daily notification" onValueChange={onValueChange} />,
    );
    const sw = screen.getByRole('switch', { name: 'Daily notification' });
    expect(sw.props.accessibilityState).toEqual({ checked: true, disabled: false });
    expect(flat(sw).backgroundColor).toBe(darkColors.brand);
    expect(touchHeight(sw)).toBeGreaterThanOrEqual(48);
    await fireEvent.press(sw);
    expect(onValueChange).toHaveBeenCalledWith(false);
  });

  it('shows off and does nothing when disabled', async () => {
    const onValueChange = jest.fn();
    await renderWithTheme(
      <Switch
        value={false}
        disabled
        accessibilityLabel="Choose bets individually"
        onValueChange={onValueChange}
      />,
    );
    const sw = screen.getByRole('switch');
    expect(sw.props.accessibilityState).toEqual({ checked: false, disabled: true });
    expect(flat(sw).backgroundColor).toBe(darkColors.surfaceRaised);
    await fireEvent.press(sw);
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
