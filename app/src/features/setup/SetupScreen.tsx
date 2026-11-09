/** Setup (designs 01 and 08): starting budget, disclaimer (NFR-U2), then the first session (FR-S1). */
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { formatMoney } from '@/src/domain/money';
import {
  MAX_BUDGET_CENTS,
  MIN_BUDGET_CENTS,
  validateBudget,
  type BudgetError,
} from '@/src/domain/session';
import { useTheme } from '@/src/theme';
import { AppBar, BudgetInput, Button, Icon, Screen, Text } from '@/src/ui';
import { cardStyle, makeStyles } from '@/src/ui/styles';
import { useAppEnv } from '../app/AppEnv';
import { startFirstSession } from '../app/session';

export const BUDGET_PRESETS = [50, 100, 300, 1000] as const;

export const DISCLAIMER =
  'This app uses virtual money for educational purposes. It is not financial, investment, or ' +
  'gambling advice. Betting involves risk and many bettors lose money. If gambling is a problem ' +
  'for you or someone you know, seek help from a local support organization.';

export function budgetErrorText(error: BudgetError, currency: string): string {
  switch (error) {
    case 'empty':
      return 'Enter a starting budget.';
    case 'not_a_number':
      return 'Enter a number, like 100 or 250.50.';
    case 'too_many_decimals':
      return 'Use at most 2 decimals.';
    case 'below_min':
      return `Enter at least ${formatMoney(MIN_BUDGET_CENTS, currency)}.`;
    case 'above_max':
      return `Enter at most ${formatMoney(MAX_BUDGET_CENTS, currency)}.`;
  }
}

export function SetupScreen() {
  const theme = useTheme();
  const s = useStyles();
  const { db, now, currency, invalidate } = useAppEnv();
  const [value, setValue] = useState('100');
  const [accepted, setAccepted] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const budget = validateBudget(value);
  const error = budget.ok ? undefined : budgetErrorText(budget.error, currency);

  const start = () => {
    if (!budget.ok || !accepted) return;
    try {
      startFirstSession(db, budget.cents, now());
      invalidate();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen testID="screen-setup" edges={['top', 'bottom']}>
      <AppBar title="BetAdvisor" />
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <View style={s.intro}>
          <Text variant="titleLg" accessibilityRole="header">
            Start with a virtual budget
          </Text>
          <Text color="inkMuted">
            Choose an amount to practise with. Every recommendation is recorded and settled against
            real results. No real money is involved.
          </Text>
        </View>
        <BudgetInput
          value={value}
          currency={currency}
          presets={BUDGET_PRESETS}
          error={error}
          onChange={setValue}
        />
        <View style={[cardStyle(theme), s.disclaimer]}>
          <View style={s.overline}>
            <Icon name="shield-check" size={22} color={theme.colors.brandInk} />
            <Text variant="overline" color="brandInk">
              Virtual money
            </Text>
          </View>
          <Text>{DISCLAIMER}</Text>
        </View>
        <Pressable
          testID="disclaimer-checkbox"
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted }}
          accessibilityLabel="I have read this and want to continue."
          onPress={() => setAccepted((a) => !a)}
          style={s.check}
        >
          <View style={[s.box, accepted && s.boxOn]}>
            {accepted && (
              <Icon name="check" size={18} strokeWidth={3} color={theme.colors.onBrand} />
            )}
          </View>
          <Text style={s.flex}>I have read this and want to continue.</Text>
        </Pressable>
        {failure !== null && (
          <Text color="loss" accessibilityRole="alert">
            {`Could not start the session: ${failure}`}
          </Text>
        )}
      </ScrollView>
      <View style={s.foot}>
        <Button full disabled={!budget.ok || !accepted} onPress={start} testID="start-session">
          Start session
        </Button>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  body: { gap: t.space[6], padding: t.space[4], paddingBottom: t.space[6] },
  intro: { gap: t.space[2] },
  disclaimer: { gap: t.space[2] },
  overline: { flexDirection: 'row', alignItems: 'center', gap: t.space[2] },
  check: { flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: t.sizes.tapMin },
  box: {
    width: 24,
    height: 24,
    borderRadius: t.radius.sm,
    borderWidth: 2,
    borderColor: t.colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: t.colors.brand, borderColor: t.colors.brand },
  flex: { flex: 1 },
  foot: { paddingHorizontal: t.space[4], paddingTop: t.space[3], paddingBottom: t.space[6] },
}));
