/** Reset budget sheet (design 05): FR-S3 to FR-S6, with the FR-S5 confirmation. */
import { useState } from 'react';
import { View } from 'react-native';

import { fromCents, formatMoney } from '@/src/domain/money';
import { validateBudget } from '@/src/domain/session';
import { BottomSheet, BudgetInput, Button, Text } from '@/src/ui';
import { makeStyles } from '@/src/ui/styles';
import { budgetErrorText } from '../setup/SetupScreen';
import type { SessionRow } from './model';

export const RESET_PRESETS = [100, 300, 500, 1000] as const;

interface Props {
  /** The active session; the sheet is closed when null. */
  row: SessionRow | null;
  currency: string;
  onCancel: () => void;
  /** Throws to report a failure. */
  onConfirm: (budgetCents: number) => void;
}

export function ResetSheet({ row, currency, onCancel, onConfirm }: Props) {
  return (
    <BottomSheet visible={row !== null} onClose={onCancel} testID="reset-sheet">
      {row !== null && (
        <Body key={row.session.id} row={row} currency={currency} {...{ onCancel, onConfirm }} />
      )}
    </BottomSheet>
  );
}

function Body({ row, currency, onCancel, onConfirm }: Props & { row: SessionRow }) {
  const s = useStyles();
  const [value, setValue] = useState(() => {
    const amount = fromCents(row.session.startingBudgetCents);
    return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  });
  const [failure, setFailure] = useState<string | null>(null);
  const budget = validateBudget(value);
  const error = budget.ok ? undefined : budgetErrorText(budget.error, currency);
  const name = `Session ${row.number}`;

  const confirm = () => {
    if (!budget.ok) return;
    try {
      onConfirm(budget.cents);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <View style={s.intro}>
        <Text variant="titleMd" accessibilityRole="header">
          Reset budget
        </Text>
        <Text color="inkMuted">{`This closes ${name} and starts a new session. Nothing is deleted.`}</Text>
      </View>
      <View style={s.table}>
        <View style={[s.line, s.divider]}>
          <Text>Current bankroll</Text>
          <Text variant="odds" style={s.num} testID="reset-bankroll">
            {formatMoney(row.bankrollCents, currency)}
          </Text>
        </View>
        <View style={s.line}>
          <View style={s.label}>
            <Text>Open bets</Text>
            <Text variant="caption" color="inkMuted">
              {`Archived with ${name} and still settled for the record`}
            </Text>
          </View>
          <Text variant="odds" style={s.num} testID="reset-open-bets">
            {String(row.openBets)}
          </Text>
        </View>
      </View>
      <BudgetInput
        label="New starting budget"
        value={value}
        currency={currency}
        presets={RESET_PRESETS}
        error={error}
        onChange={setValue}
        testID="reset-budget-input"
      />
      {failure !== null && (
        <Text variant="caption" color="loss" accessibilityRole="alert">
          {failure}
        </Text>
      )}
      <View style={s.buttons}>
        <Button full disabled={!budget.ok} onPress={confirm} testID="reset-confirm">
          Archive and start new
        </Button>
        <Button full variant="secondary" onPress={onCancel} testID="reset-cancel">
          Cancel
        </Button>
      </View>
    </>
  );
}

const useStyles = makeStyles((t) => ({
  intro: { gap: t.space[1] },
  table: {
    backgroundColor: t.colors.bg,
    borderWidth: 1,
    borderColor: t.colors.line,
    borderRadius: t.radius.md,
  },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: t.space[3],
    paddingVertical: t.space[3],
    paddingHorizontal: t.space[4],
  },
  divider: { borderBottomWidth: 1, borderBottomColor: t.colors.line },
  label: { flex: 1 },
  num: { fontVariant: ['tabular-nums'] },
  buttons: { gap: t.space[2] },
}));
