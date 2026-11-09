import { Pressable, View } from 'react-native';

import { useTheme } from '@/src/theme';
import { BottomSheet, Icon, Text } from '@/src/ui';
import { makeStyles } from '@/src/ui/styles';

export interface Option<T> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface Props<T> {
  title: string | null;
  note?: string;
  options: readonly Option<T>[];
  selected: T | undefined;
  onSelect: (value: T) => void;
  onClose: () => void;
}

/** A bottom sheet with a single-choice list (Settings pickers). */
export function OptionSheet<T extends string | number>(p: Props<T>) {
  const theme = useTheme();
  const s = useStyles();
  return (
    <BottomSheet
      visible={p.title !== null}
      onClose={p.onClose}
      title={p.title ?? undefined}
      testID="option-sheet"
    >
      <View accessibilityRole="radiogroup">
        {p.options.map((o) => {
          const checked = o.value === p.selected;
          return (
            <Pressable
              key={String(o.value)}
              testID={`option-${o.value}`}
              accessibilityRole="radio"
              accessibilityLabel={o.label}
              accessibilityState={{ checked, disabled: o.disabled === true }}
              disabled={o.disabled}
              onPress={() => p.onSelect(o.value)}
              style={[s.row, o.disabled === true && s.disabled]}
            >
              <Text variant={checked ? 'bodyStrong' : 'body'}>{o.label}</Text>
              {checked && <Icon name="check" size={20} color={theme.colors.brandInk} />}
            </Pressable>
          );
        })}
      </View>
      {p.note !== undefined && (
        <Text variant="caption" color="inkSubtle" style={s.note}>
          {p.note}
        </Text>
      )}
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.line,
  },
  disabled: { opacity: 0.4 },
  note: { paddingTop: t.space[3] },
}));
