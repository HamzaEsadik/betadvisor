import { screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

export type El = ReturnType<typeof screen.getByRole>;

/** Smallest touch dimension of a host element: its min/height plus the hit slop on both sides. */
export function touchHeight(el: El): number {
  const style = StyleSheet.flatten(el.props.style) ?? {};
  const h = Math.max(Number(style.minHeight ?? 0), Number(style.height ?? 0));
  const slop = el.props.hitSlop;
  const extra =
    typeof slop === 'number'
      ? slop * 2
      : slop
        ? Number(slop.top ?? 0) + Number(slop.bottom ?? 0)
        : 0;
  return h + extra;
}

export function flat(el: El) {
  return StyleSheet.flatten(el.props.style) ?? {};
}
