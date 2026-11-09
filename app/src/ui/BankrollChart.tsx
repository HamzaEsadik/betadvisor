import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { maxDrawdown } from '@/src/domain/metrics';
import { formatMoney } from '@/src/domain/money';
import { fonts, useTheme } from '@/src/theme';
import { makeStyles } from './styles';
import { Text } from './Text';

export interface BankrollChartProps {
  /** Bankroll after each settled bet, integer cents, oldest first. */
  points: readonly number[];
  /** Starting budget, integer cents (the dashed base line). */
  start: number;
  height?: number;
  startLabel?: string;
  endLabel?: string;
  currency?: string;
  /** Initial width before layout (the design board width). */
  width?: number;
  emptyText?: string;
}

const PAD = { l: 8, r: 8, t: 12, b: 18 };

export interface ChartGeometry {
  line: string;
  area: string;
  baseY: number;
  last: { x: number; y: number };
  /** The max drawdown band, or null when the curve never falls. */
  band: { x: number; width: number } | null;
}

/** Pure geometry, so it can be tested without rendering (same maths as the design). */
export function chartGeometry(
  points: readonly number[],
  start: number,
  width: number,
  height: number,
): ChartGeometry | null {
  if (points.length === 0) return null;
  let lo = Math.min(start, ...points);
  let hi = Math.max(start, ...points);
  const span = hi - lo || 1;
  lo -= span * 0.12;
  hi += span * 0.12;
  const n = points.length;
  const x = (i: number) => PAD.l + (width - PAD.l - PAD.r) * (n === 1 ? 0.5 : i / (n - 1));
  const y = (v: number) => PAD.t + (height - PAD.t - PAD.b) * (1 - (v - lo) / (hi - lo));
  const line = points
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(' ');
  const bottom = height - PAD.b;
  const area = `${line} L${x(n - 1).toFixed(1)} ${bottom} L${x(0).toFixed(1)} ${bottom} Z`;
  const dd = maxDrawdown(points);
  const band =
    dd.amountCents > 0
      ? { x: x(dd.peakIndex), width: Math.max(x(dd.troughIndex) - x(dd.peakIndex), 2) }
      : null;
  return { line, area, baseY: y(start), last: { x: x(n - 1), y: y(points[n - 1]!) }, band };
}

/** `.ba-chart`: bankroll line, dashed start line, drawdown band, start/end labels. */
export function BankrollChart({
  points,
  start,
  height = 150,
  startLabel = 'Start',
  endLabel = 'Today',
  currency,
  width: initialWidth = 320,
  emptyText = 'No settled bets yet',
}: BankrollChartProps) {
  const theme = useTheme();
  const s = useStyles();
  const [width, setWidth] = useState(initialWidth);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== width) setWidth(w);
  };

  const g = chartGeometry(points, start, width, height);
  if (g === null) {
    return (
      <View
        testID="bankroll-chart-empty"
        accessible
        accessibilityLabel={`Bankroll curve: ${emptyText}`}
        style={[s.empty, { height }]}
      >
        <Text variant="caption" color="inkMuted">
          {emptyText}
        </Text>
      </View>
    );
  }
  const c = theme.colors;
  const first = formatMoney(points[0]!, currency);
  const last = formatMoney(points[points.length - 1]!, currency);
  const label = { fill: c.inkSubtle, fontSize: 11, fontFamily: fonts.sans500 };
  return (
    <View
      onLayout={onLayout}
      testID="bankroll-chart"
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Bankroll curve, from ${first} to ${last}`}
    >
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {g.band !== null && (
          <Rect
            testID="chart-drawdown"
            x={g.band.x}
            y={PAD.t}
            width={g.band.width}
            height={height - PAD.t - PAD.b}
            fill={c.lossSoft}
          />
        )}
        <Path d={g.area} fill={c.winSoft} stroke="none" />
        <Line
          testID="chart-base"
          x1={PAD.l}
          x2={width - PAD.r}
          y1={g.baseY}
          y2={g.baseY}
          stroke={c.lineStrong}
          strokeWidth={1}
          strokeDasharray="4 4"
        />
        <Path
          testID="chart-line"
          d={g.line}
          fill="none"
          stroke={c.ink}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Circle cx={g.last.x} cy={g.last.y} r={4} fill={c.ink} stroke={c.bg} strokeWidth={2} />
        <SvgText x={PAD.l} y={height - 3} {...label}>
          {startLabel}
        </SvgText>
        <SvgText x={width - PAD.r} y={height - 3} textAnchor="end" {...label}>
          {endLabel}
        </SvgText>
      </Svg>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: t.colors.line,
  },
}));
