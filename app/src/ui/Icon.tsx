import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Polyline, Rect } from 'react-native-svg';

import { useTheme } from '@/src/theme';
import { ICONS, type IconElement, type IconName } from './icons';

export type { IconName } from './icons';
export { ICON_NAMES } from './icons';

export interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  /** Defaults to the theme's ink color (CSS `currentColor`). */
  color?: ColorValue;
  /** Accessible label; without it the icon is decorative and hidden from screen readers. */
  label?: string;
  testID?: string;
}

function renderElement(el: IconElement, key: number) {
  switch (el.tag) {
    case 'path':
      return <Path key={key} d={el.d} />;
    case 'circle':
      return <Circle key={key} cx={el.cx} cy={el.cy} r={el.r} />;
    case 'polyline':
      return <Polyline key={key} points={el.points} />;
    case 'rect':
      return (
        <Rect
          key={key}
          width={el.width}
          height={el.height}
          x={el.x}
          y={el.y}
          rx={el.rx}
          ry={el.ry}
        />
      );
  }
}

/** Lucide icon from the design's ICONS map, rendered with react-native-svg. */
export function Icon({ name, size = 20, strokeWidth = 1.75, color, label, testID }: IconProps) {
  const theme = useTheme();
  const elements: readonly IconElement[] = ICONS[name];
  return (
    <Svg
      testID={testID ?? `icon-${name}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? theme.colors.ink}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={label !== undefined}
      accessibilityRole={label !== undefined ? 'image' : undefined}
      accessibilityLabel={label}
      importantForAccessibility={label !== undefined ? 'yes' : 'no-hide-descendants'}
    >
      {elements.map(renderElement)}
    </Svg>
  );
}
