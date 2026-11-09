import { screen } from '@testing-library/react-native';

import { renderWithTheme } from '@/src/test/render';
import { Gallery } from './Gallery';

type Node = { type: string; props: Record<string, unknown>; children: (Node | string)[] | null };

function walk(node: Node | Node[] | null, visit: (n: Node) => void) {
  if (node === null) return;
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  visit(node);
  for (const c of node.children ?? []) if (typeof c !== 'string') walk(c, visit);
}

describe('dev gallery', () => {
  it('renders every component in dark and light', async () => {
    await renderWithTheme(<Gallery />);
    expect(screen.getByTestId('gallery-dark')).toBeOnTheScreen();
    expect(screen.getByTestId('gallery-light')).toBeOnTheScreen();
    expect(screen.getAllByText('Follow advice')).toHaveLength(2);
    expect(screen.getAllByTestId('bankroll-chart-empty')).toHaveLength(2);
    expect(screen.getAllByTestId('bankroll-chart')).toHaveLength(6);
  });

  it('gives every interactive element a role and a label', async () => {
    await renderWithTheme(<Gallery schemes={['dark']} />);
    const offenders: string[] = [];
    let interactive = 0;
    walk(screen.toJSON() as Node | Node[] | null, (n) => {
      const pressable = typeof n.props.onClick === 'function';
      const input = n.type === 'TextInput';
      if (!pressable && !input) return;
      interactive++;
      const label = n.props.accessibilityLabel;
      if (typeof label !== 'string' || label === '') offenders.push(`${n.type} without label`);
      if (pressable && typeof n.props.accessibilityRole !== 'string') {
        offenders.push(`${String(label)} without role`);
      }
    });
    expect(interactive).toBeGreaterThan(20);
    expect(offenders).toEqual([]);
  });
});
