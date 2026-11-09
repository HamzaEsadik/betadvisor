/** Date filter (FR-L2): presets plus an inclusive From / To range of local days. */
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { addDays, type DayKey } from '@/src/domain/day';
import { useTheme } from '@/src/theme';
import { BottomSheet, Button, Chip, Text } from '@/src/ui';
import { makeStyles } from '@/src/ui/styles';
import { DATE_PRESETS, presetRange, type DateRange } from './model';

/** `""` → null; a real calendar day `YYYY-MM-DD` → itself; anything else → undefined. */
export function parseDay(text: string): DayKey | null | undefined {
  const t = text.trim();
  if (t === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return undefined;
  return addDays(t, 0) === t ? t : undefined;
}

export function rangeError(fromText: string, toText: string): string | null {
  const from = parseDay(fromText);
  const to = parseDay(toText);
  if (from === undefined || to === undefined) return 'Use dates like 2026-11-09.';
  if (from !== null && to !== null && from > to) return 'The start date is after the end date.';
  return null;
}

interface Props {
  visible: boolean;
  value: DateRange;
  today: DayKey;
  onClose: () => void;
  onApply: (range: DateRange) => void;
}

export function DateRangeSheet(p: Props) {
  // Remount on each opening so the fields start from the current filter.
  return p.visible ? <SheetBody key={`${p.value.from}-${p.value.to}`} {...p} /> : null;
}

function SheetBody({ value, today, onClose, onApply }: Props) {
  const theme = useTheme();
  const s = useStyles();
  const [from, setFrom] = useState(value.from ?? '');
  const [to, setTo] = useState(value.to ?? '');
  const error = rangeError(from, to);

  const field = (label: string, text: string, onChange: (v: string) => void, testID: string) => (
    <View style={s.field}>
      <Text variant="overline" color="inkSubtle">
        {label}
      </Text>
      <TextInput
        testID={testID}
        accessibilityLabel={`${label} date`}
        value={text}
        onChangeText={onChange}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={theme.colors.inkSubtle}
        inputMode="numeric"
        maxLength={10}
        style={[theme.type.body, s.input]}
      />
    </View>
  );

  return (
    <BottomSheet visible onClose={onClose} title="Filter by date" testID="date-sheet">
      <View style={s.presets}>
        {DATE_PRESETS.map((p) => (
          <Chip
            key={p.key}
            testID={`date-${p.key}`}
            onPress={() => onApply(presetRange(p.key, today))}
          >
            {p.label}
          </Chip>
        ))}
      </View>
      <View style={s.row}>
        {field('From', from, setFrom, 'date-from')}
        {field('To', to, setTo, 'date-to')}
      </View>
      {error !== null && (
        <Text variant="caption" color="loss" accessibilityRole="alert">
          {error}
        </Text>
      )}
      <View style={s.buttons}>
        <Button
          full
          disabled={error !== null}
          testID="date-apply"
          onPress={() => onApply({ from: parseDay(from) ?? null, to: parseDay(to) ?? null })}
        >
          Apply
        </Button>
        <Button full variant="secondary" onPress={onClose}>
          Cancel
        </Button>
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] },
  row: { flexDirection: 'row', gap: t.space[3] },
  field: { flex: 1, gap: t.space[1] },
  input: {
    minHeight: t.sizes.tapMin,
    paddingHorizontal: t.space[3],
    color: t.colors.ink,
    backgroundColor: t.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: t.colors.lineStrong,
    borderRadius: t.radius.md,
  },
  buttons: { gap: t.space[2] },
}));
