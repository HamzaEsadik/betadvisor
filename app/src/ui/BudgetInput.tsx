import { TextInput, View } from 'react-native';

import { toCents, formatMoney } from '@/src/domain/money';
import { useTheme } from '@/src/theme';
import { Chip } from './Chip';
import { Icon } from './Icon';
import { makeStyles } from './styles';
import { MAX_FONT_SCALE_DISPLAY, Text } from './Text';

export interface BudgetInputProps {
  label?: string;
  /** Raw text as typed (validated by `domain/session`). */
  value: string;
  currency?: string;
  /** Whole currency units, e.g. `[50, 100, 300, 1000]`. */
  presets?: readonly number[];
  hint?: string;
  error?: string;
  onChange?: (value: string) => void;
  testID?: string;
}

export const DEFAULT_BUDGET_HINT = 'Between 10 and 1,000,000. Virtual money only.';

/** `.ba-budget`: starting budget field with presets and an inline error. */
export function BudgetInput({
  label = 'Starting budget',
  value,
  currency = '$',
  presets,
  hint = DEFAULT_BUDGET_HINT,
  error,
  onChange,
  testID,
}: BudgetInputProps) {
  const theme = useTheme();
  const s = useStyles();
  const hasError = error !== undefined && error !== '';
  return (
    <View style={s.root}>
      <Text variant="overline" color="inkSubtle" nativeID="budget-label">
        {label}
      </Text>
      <View style={[s.field, hasError && s.fieldError]}>
        <Text variant="titleLg" color="inkMuted">
          {currency}
        </Text>
        <TextInput
          testID={testID ?? 'budget-input'}
          accessibilityLabel={label}
          accessibilityLabelledBy="budget-label"
          accessibilityHint={hasError ? error : hint}
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          inputMode="decimal"
          maxLength={13}
          selectionColor={theme.colors.brand}
          placeholderTextColor={theme.colors.inkSubtle}
          maxFontSizeMultiplier={MAX_FONT_SCALE_DISPLAY}
          style={[theme.type.bankrollXl, s.input]}
        />
      </View>
      {hasError ? (
        <View style={s.err} accessibilityLiveRegion="polite">
          <Icon name="x" size={14} strokeWidth={2.25} color={theme.colors.loss} />
          <Text variant="caption" color="loss" accessibilityRole="alert">
            {error}
          </Text>
        </View>
      ) : (
        <Text variant="caption" color="inkMuted">
          {hint}
        </Text>
      )}
      {presets !== undefined && (
        <View style={s.presets}>
          {presets.map((v) => (
            <Chip
              key={v}
              selected={value === String(v)}
              accessibilityLabel={`Set budget to ${formatMoney(toCents(v), currency)}`}
              onPress={() => onChange?.(String(v))}
            >
              {formatMoney(toCents(v), currency)}
            </Chip>
          ))}
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space[2] },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space[2],
    minHeight: 80,
    paddingHorizontal: t.space[4],
    backgroundColor: t.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: t.colors.lineStrong,
    borderRadius: t.radius.lg,
  },
  fieldError: { borderColor: t.colors.loss, borderWidth: 2 },
  input: { flex: 1, minWidth: 0, color: t.colors.ink, padding: 0, fontVariant: ['tabular-nums'] },
  err: { flexDirection: 'row', alignItems: 'center', gap: t.space[1] },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] },
}));
