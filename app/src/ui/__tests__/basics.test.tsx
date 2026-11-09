import { fireEvent, screen } from '@testing-library/react-native';

import { darkColors, lightColors } from '@/src/theme';
import { renderWithTheme } from '@/src/test/render';
import { Button } from '../Button';
import { Chip } from '../Chip';
import { EdgeBadge } from '../EdgeBadge';
import { FormStrip } from '../FormStrip';
import { ProbabilityBar } from '../ProbabilityBar';
import { STATUS, StatusPill, type BetStatus } from '../StatusPill';
import { TeamBadge } from '../TeamBadge';
import { MAX_FONT_SCALE, Text } from '../Text';
import { flat, touchHeight } from './helpers';

const hidden = { includeHiddenElements: true } as const;

describe('Button', () => {
  it('shows its text, fires onPress and exposes a button role', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<Button onPress={onPress}>Follow advice</Button>);
    const btn = screen.getByRole('button', { name: 'Follow advice' });
    await fireEvent.press(btn);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(touchHeight(btn)).toBeGreaterThanOrEqual(48);
  });

  it('does not fire when disabled and reports the disabled state', async () => {
    const onPress = jest.fn();
    await renderWithTheme(
      <Button disabled onPress={onPress}>
        Follow advice
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Follow advice' });
    expect(btn).toBeDisabled();
    await fireEvent.press(btn);
    expect(onPress).not.toHaveBeenCalled();
    expect(flat(btn).backgroundColor).toBe(darkColors.surfaceRaised);
  });

  it('renders the icon and keeps a 48 dp target at size sm', async () => {
    await renderWithTheme(
      <Button size="sm" icon="rotate-ccw" variant="secondary">
        Reset
      </Button>,
    );
    expect(screen.getByTestId('icon-rotate-ccw', hidden)).toBeOnTheScreen();
    expect(touchHeight(screen.getByRole('button', { name: 'Reset' }))).toBeGreaterThanOrEqual(48);
  });

  it.each([
    ['primary', darkColors.brand],
    ['secondary', 'transparent'],
  ] as const)('%s uses the design background', async (variant, bg) => {
    await renderWithTheme(<Button variant={variant}>Go</Button>);
    expect(flat(screen.getByRole('button')).backgroundColor).toBe(bg);
  });
});

describe('Chip', () => {
  it('shows the count, reports selection and fires onPress', async () => {
    const onPress = jest.fn();
    await renderWithTheme(
      <Chip selected count={3} onPress={onPress}>
        Today
      </Chip>,
    );
    const chip = screen.getByRole('button', { name: 'Today, 3' });
    expect(chip).toBeSelected();
    expect(screen.getByText('3')).toBeOnTheScreen();
    await fireEvent.press(chip);
    expect(onPress).toHaveBeenCalled();
    expect(touchHeight(chip)).toBeGreaterThanOrEqual(48);
    expect(flat(chip).backgroundColor).toBe(darkColors.brand);
  });

  it('is unselected by default', async () => {
    await renderWithTheme(<Chip>Tomorrow</Chip>);
    expect(screen.getByRole('button', { name: 'Tomorrow' })).not.toBeSelected();
  });
});

describe('StatusPill', () => {
  const statuses = Object.keys(STATUS) as BetStatus[];

  it('has a distinct icon and text for every status', () => {
    const icons = statuses.map((s) => STATUS[s].icon);
    const labels = statuses.map((s) => STATUS[s].label);
    expect(new Set(icons).size).toBe(statuses.length);
    expect(new Set(labels).size).toBe(statuses.length);
  });

  it.each(statuses)('renders %s with its icon, text and label', async (status) => {
    await renderWithTheme(<StatusPill status={status} />);
    expect(screen.getByLabelText(`Status: ${STATUS[status].label}`)).toBeOnTheScreen();
    expect(screen.getByText(STATUS[status].label, hidden)).toBeOnTheScreen();
    expect(screen.getByTestId(`icon-${STATUS[status].icon}`, hidden)).toBeOnTheScreen();
  });

  it('colors won and lost from the palette', async () => {
    await renderWithTheme(<StatusPill status="won" />, 'light');
    expect(flat(screen.getByTestId('status-won')).backgroundColor).toBe(lightColors.winSoft);
    await renderWithTheme(<StatusPill status="lost" />, 'light');
    expect(flat(screen.getByTestId('status-lost')).backgroundColor).toBe(lightColors.lossSoft);
  });

  it('accepts a custom label', async () => {
    await renderWithTheme(<StatusPill status="open" label="Pending" />);
    expect(screen.getByLabelText('Status: Pending')).toBeOnTheScreen();
  });
});

describe('EdgeBadge', () => {
  it('formats the edge with one decimal', async () => {
    await renderWithTheme(<EdgeBadge edge={0.092} />);
    expect(screen.getByLabelText('+9.2% edge')).toBeOnTheScreen();
    expect(screen.getByTestId('icon-trending-up', hidden)).toBeOnTheScreen();
  });
});

describe('TeamBadge', () => {
  it('shows the code, or three letters of the name, hidden from screen readers', async () => {
    await renderWithTheme(<TeamBadge code="ARS" name="Arsenal" />);
    expect(screen.getByText('ARS', hidden)).toBeOnTheScreen();
    expect(screen.queryByText('ARS')).toBeNull();
    await renderWithTheme(<TeamBadge name="1. FC Köln" size="md" />);
    expect(screen.getByText('FCK', hidden)).toBeOnTheScreen();
  });
});

describe('FormStrip', () => {
  it('shows each letter and reads the form out in words', async () => {
    await renderWithTheme(<FormStrip form="wwdlw" label="Arsenal" />);
    expect(screen.getByLabelText('Arsenal form: win, win, draw, loss, win')).toBeOnTheScreen();
    expect(screen.getAllByText('W', hidden)).toHaveLength(3);
    expect(screen.getAllByText('L', hidden)).toHaveLength(1);
  });

  it('handles an empty form', async () => {
    await renderWithTheme(<FormStrip form="" />);
    expect(screen.getByLabelText('Form: none')).toBeOnTheScreen();
  });
});

describe('ProbabilityBar', () => {
  it('shows both percentages and sizes the fills', async () => {
    await renderWithTheme(<ProbabilityBar model={0.52} book={0.476} />);
    expect(screen.getByLabelText('Model probability 52%, bookmaker 48%')).toBeOnTheScreen();
    expect(screen.getByText('52%', hidden)).toBeOnTheScreen();
    expect(JSON.stringify(screen.toJSON())).toContain('"width":"52%"');
  });

  it('clamps fills to 0..100%', async () => {
    await renderWithTheme(<ProbabilityBar model={1.4} book={-0.1} compact />);
    const json = JSON.stringify(screen.toJSON());
    expect(json).toContain('"width":"100%"');
    expect(json).toContain('"width":"0%"');
  });
});

describe('Text', () => {
  it('scales with the system font size up to a cap', async () => {
    await renderWithTheme(<Text>Hello</Text>);
    const t = screen.getByText('Hello');
    expect(t.props.allowFontScaling).toBe(true);
    expect(t.props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE);
  });
});
