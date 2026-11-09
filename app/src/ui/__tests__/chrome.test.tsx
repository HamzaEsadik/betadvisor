import { act, fireEvent, screen } from '@testing-library/react-native';
import { Text as RNText } from 'react-native';

import { darkColors } from '@/src/theme';
import { renderWithTheme } from '@/src/test/render';
import { AppBar } from '../AppBar';
import { Banner } from '../Banner';
import { BottomSheet } from '../BottomSheet';
import { BudgetInput, DEFAULT_BUDGET_HINT } from '../BudgetInput';
import { RouterTabBar, TabBar } from '../TabBar';
import { flat, touchHeight } from './helpers';

const hidden = { includeHiddenElements: true } as const;

describe('Banner', () => {
  it('is an alert with the warn icon and fires its action', async () => {
    const onAction = jest.fn();
    await renderWithTheme(
      <Banner
        tone="warn"
        title="Data is 26 hours old"
        action="Retry"
        onAction={onAction}
        testID="b"
      >
        Following is paused.
      </Banner>,
    );
    // Containers are not focusable, so the role is checked as a prop (TalkBack reads the live region).
    expect(screen.getByTestId('b').props.accessibilityRole).toBe('alert');
    expect(screen.getByTestId('b').props.accessibilityLiveRegion).toBe('assertive');
    expect(screen.getByText('Data is 26 hours old')).toBeOnTheScreen();
    expect(screen.getByText('Following is paused.')).toBeOnTheScreen();
    expect(screen.getByTestId('icon-triangle-alert', hidden)).toBeOnTheScreen();
    const action = screen.getByRole('button', { name: 'Retry' });
    expect(touchHeight(action)).toBeGreaterThanOrEqual(48);
    await fireEvent.press(action);
    expect(onAction).toHaveBeenCalled();
    expect(flat(screen.getByTestId('b')).backgroundColor).toBe(darkColors.warnSoft);
  });

  it('defaults to an info summary without action', async () => {
    await renderWithTheme(<Banner testID="b">Offline</Banner>);
    expect(screen.getByTestId('b').props.accessibilityRole).toBe('summary');
    expect(screen.getByTestId('icon-info', hidden)).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('has a bordered neutral tone', async () => {
    await renderWithTheme(<Banner tone="neutral" title="No bets today" testID="b" />);
    expect(flat(screen.getByTestId('b')).borderColor).toBe(darkColors.line);
  });
});

const ITEMS = [
  { key: 'today', label: 'Today', icon: 'calendar-days' as const },
  { key: 'ledger', label: 'Ledger', icon: 'list-ordered' as const },
];

describe('TabBar', () => {
  it('marks the active tab and reports presses', async () => {
    const onChange = jest.fn();
    await renderWithTheme(
      <TabBar items={ITEMS} active="today" onChange={onChange} bottomInset={24} />,
    );
    expect(screen.getByTestId('tabbar').props.accessibilityRole).toBe('tablist');
    expect(screen.getByRole('tab', { name: 'Today' })).toBeSelected();
    const ledger = screen.getByRole('tab', { name: 'Ledger' });
    expect(ledger).not.toBeSelected();
    expect(touchHeight(ledger)).toBeGreaterThanOrEqual(48);
    await fireEvent.press(ledger);
    expect(onChange).toHaveBeenCalledWith('ledger');
    expect(flat(screen.getByTestId('tabbar')).height).toBe(64 + 24);
  });
});

describe('RouterTabBar', () => {
  function setup(defaultPrevented = false) {
    const emit = jest.fn(() => ({ defaultPrevented }));
    const navigateToTab = jest.fn();
    const props = {
      state: {
        index: 0,
        routes: [
          { key: 'index-1', name: 'index' },
          { key: 'ledger-1', name: 'ledger' },
          { key: 'x-1', name: 'unknown' },
        ],
      },
      descriptors: {
        'index-1': { options: { title: 'Today' } },
        'ledger-1': { options: { title: 'Ledger' } },
        'x-1': { options: {} },
      },
      emitter: { emit },
      navigateToTab,
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
      icons: { index: 'calendar-days', ledger: 'list-ordered' },
    } as unknown as Parameters<typeof RouterTabBar>[0];
    return { props, emit, navigateToTab };
  }

  it('maps routes to tabs and navigates on press', async () => {
    const { props, emit, navigateToTab } = setup();
    await renderWithTheme(<RouterTabBar {...props} />);
    expect(screen.getByRole('tab', { name: 'Today' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'unknown' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'Ledger' }));
    expect(emit).toHaveBeenCalledWith({
      type: 'tabPress',
      target: 'ledger-1',
      canPreventDefault: true,
    });
    expect(navigateToTab).toHaveBeenCalledWith('ledger-1');
    navigateToTab.mockClear();
    await fireEvent.press(screen.getByRole('tab', { name: 'Today' }));
    expect(navigateToTab).not.toHaveBeenCalled();
  });

  it('respects a prevented tabPress', async () => {
    const { props, navigateToTab } = setup(true);
    await renderWithTheme(<RouterTabBar {...props} />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Ledger' }));
    expect(navigateToTab).not.toHaveBeenCalled();
  });
});

describe('AppBar', () => {
  it('shows a header, subtitle, back button and actions', async () => {
    const onBack = jest.fn();
    const onBell = jest.fn();
    await renderWithTheme(
      <AppBar
        title="Today"
        subtitle="Sun 9 Nov"
        large
        onBack={onBack}
        actions={[{ icon: 'bell', label: 'Notifications', onPress: onBell }]}
      />,
    );
    expect(screen.getByRole('header', { name: 'Today' })).toBeOnTheScreen();
    expect(screen.getByText('Sun 9 Nov')).toBeOnTheScreen();
    const back = screen.getByRole('button', { name: 'Back' });
    const bell = screen.getByRole('button', { name: 'Notifications' });
    expect(touchHeight(back)).toBe(48);
    expect(touchHeight(bell)).toBe(48);
    await fireEvent.press(back);
    await fireEvent.press(bell);
    expect(onBack).toHaveBeenCalled();
    expect(onBell).toHaveBeenCalled();
  });

  it('has no buttons by default', async () => {
    await renderWithTheme(<AppBar title="Ledger" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('BudgetInput', () => {
  it('reports typed text and preset presses', async () => {
    const onChange = jest.fn();
    await renderWithTheme(
      <BudgetInput value="100" presets={[50, 100, 300, 1000]} onChange={onChange} />,
    );
    expect(screen.getByText(DEFAULT_BUDGET_HINT)).toBeOnTheScreen();
    const input = screen.getByLabelText('Starting budget');
    expect(input.props.keyboardType).toBe('decimal-pad');
    await fireEvent.changeText(input, '250');
    expect(onChange).toHaveBeenLastCalledWith('250');
    const preset = screen.getByRole('button', { name: 'Set budget to $1,000.00' });
    await fireEvent.press(preset);
    expect(onChange).toHaveBeenLastCalledWith('1000');
    expect(screen.getByRole('button', { name: 'Set budget to $100.00' })).toBeSelected();
    expect(touchHeight(preset)).toBeGreaterThanOrEqual(48);
  });

  it('shows the error in place of the hint', async () => {
    await renderWithTheme(<BudgetInput value="5" error="Minimum budget is $10.00" currency="€" />);
    expect(screen.getByRole('alert', { name: 'Minimum budget is $10.00' })).toBeOnTheScreen();
    expect(screen.queryByText(DEFAULT_BUDGET_HINT)).toBeNull();
    expect(screen.getByText('€')).toBeOnTheScreen();
    expect(screen.getByLabelText('Starting budget').props.accessibilityHint).toBe(
      'Minimum budget is $10.00',
    );
  });
});

describe('BottomSheet', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('renders nothing when hidden', async () => {
    await renderWithTheme(
      <BottomSheet visible={false} onClose={jest.fn()}>
        <RNText>Body</RNText>
      </BottomSheet>,
    );
    expect(screen.queryByText('Body')).toBeNull();
  });

  it('shows title and content, closes from the scrim, and unmounts after sliding out', async () => {
    const onClose = jest.fn();
    const ui = (visible: boolean) => (
      <BottomSheet visible={visible} onClose={onClose} title="Reset budget" testID="sheet">
        <RNText>Body</RNText>
      </BottomSheet>
    );
    const { rerender } = await renderWithTheme(ui(true));
    expect(screen.getByRole('header', { name: 'Reset budget' })).toBeOnTheScreen();
    expect(screen.getByText('Body')).toBeOnTheScreen();
    // The scrim sits outside the modal sheet, so screen readers skip it (they close with Back).
    const scrim = screen.getByTestId('sheet-scrim', hidden);
    expect(scrim.props.accessibilityLabel).toBe('Close');
    await fireEvent.press(scrim);
    expect(onClose).toHaveBeenCalledTimes(1);
    await rerender(ui(false));
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.queryByText('Body')).toBeNull();
  });
});
