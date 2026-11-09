import { View } from 'react-native';

import { pct } from './format';
import { makeStyles } from './styles';
import { Text } from './Text';

export interface ProbabilityBarProps {
  /** Model probability (0 to 1). */
  model: number;
  /** Bookmaker implied probability (0 to 1). */
  book: number;
  compact?: boolean;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** `.ba-prob`: model vs bookmaker probability bars. */
export function ProbabilityBar({ model, book, compact = false }: ProbabilityBarProps) {
  const s = useStyles();
  const rows = [
    { label: 'Model', value: model, fill: s.fillModel },
    { label: 'Book', value: book, fill: s.fillBook },
  ];
  return (
    <View
      accessible
      accessibilityLabel={`Model probability ${pct(model)}, bookmaker ${pct(book)}`}
      style={[s.root, compact && s.compact]}
    >
      {rows.map((r) => (
        <View key={r.label} style={s.row}>
          <Text variant="overline" color="inkMuted" style={s.label}>
            {r.label}
          </Text>
          <View style={[s.track, compact && s.trackCompact]}>
            <View style={[s.fill, r.fill, { width: `${clamp01(r.value) * 100}%` }]} />
          </View>
          <Text variant="caption" style={s.value}>
            {pct(r.value)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space[2], flex: 1 },
  compact: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.space[2] },
  label: { width: 44 },
  track: {
    flex: 1,
    height: 8,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.surfaceRaised,
    overflow: 'hidden',
  },
  trackCompact: { height: 6 },
  fill: { height: '100%', borderRadius: t.radius.pill },
  fillModel: { backgroundColor: t.colors.brandInk },
  fillBook: { backgroundColor: t.colors.inkSubtle },
  value: { width: 36, textAlign: 'right', fontVariant: ['tabular-nums'] },
}));
