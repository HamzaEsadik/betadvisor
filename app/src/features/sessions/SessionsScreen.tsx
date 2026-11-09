/** Sessions (design 04) with the Reset sheet (design 05): FR-S3 to FR-S7. */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { resetSession } from '@/src/db/services';
import { AppBar, Button, Screen, SessionCard, Text } from '@/src/ui';
import { makeStyles } from '@/src/ui/styles';
import { useAppEnv } from '../app/AppEnv';
import { Toast } from '../common/Toast';
import { useFocusRevision } from '../common/useFocusRevision';
import { listSessionRows, sessionDates, type SessionRow } from './model';
import { ResetSheet } from './ResetSheet';

export function SessionsScreen() {
  const s = useStyles();
  const router = useRouter();
  const { db, now, offsetOf, currency, revision, invalidate } = useAppEnv();
  const params = useLocalSearchParams<{ reset?: string }>();
  const [resetOpen, setResetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  const focused = useFocusRevision();
  // `revision` signals a database write; focus re-reads what changed elsewhere (settlement).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => listSessionRows(db), [db, revision, focused]);
  const active = rows.find((r) => r.session.status === 'active') ?? null;
  const closed = rows.filter((r) => r.session.status === 'closed');

  // Today's "Reset budget" (design 11) arrives with `?reset=1` and opens the sheet directly.
  const sheetOpen = resetOpen || params.reset === '1';
  const closeSheet = () => {
    setResetOpen(false);
    if (params.reset !== undefined) router.setParams({ reset: undefined });
  };

  const confirm = (budgetCents: number) => {
    resetSession(db, budgetCents, now());
    closeSheet();
    setToast(`Session ${active?.number} archived · Session ${rows.length + 1} started`);
    invalidate();
  };

  const card = (r: SessionRow) => (
    <SessionCard
      key={r.session.id}
      testID={`session-${r.number}`}
      title={`Session ${r.number}`}
      status={r.session.status}
      dates={sessionDates(r.session, offsetOf)}
      startBudget={r.session.startingBudgetCents}
      finalBankroll={r.bankrollCents}
      roi={r.roi}
      bets={r.bets}
      currency={currency}
      onReset={r.session.status === 'active' ? () => setResetOpen(true) : undefined}
    />
  );

  return (
    <Screen testID="screen-sessions">
      <AppBar title="Sessions" large />
      <ScrollView contentContainerStyle={s.body}>
        {active !== null && (
          <>
            <Text variant="overline" color="inkSubtle" accessibilityRole="header">
              Active
            </Text>
            {card(active)}
          </>
        )}
        {closed.length > 0 && (
          <Text variant="overline" color="inkSubtle" accessibilityRole="header" style={s.gap}>
            Closed
          </Text>
        )}
        {closed.map((r) => (
          <View key={r.session.id} style={s.closed}>
            {card(r)}
            <SessionLinks row={r} />
          </View>
        ))}
        <Text variant="caption" color="inkSubtle" style={s.gap}>
          Resetting archives the active session. Bets and history from closed sessions are never
          deleted.
        </Text>
      </ScrollView>
      <ResetSheet
        row={sheetOpen ? active : null}
        currency={currency}
        onCancel={closeSheet}
        onConfirm={confirm}
      />
      <Toast message={toast} onHide={hideToast} />
    </Screen>
  );
}

/** "View session N performance" (design 04) and the session's ledger. */
function SessionLinks({ row }: { row: SessionRow }) {
  const s = useStyles();
  const router = useRouter();
  const session = String(row.session.id);
  return (
    <View style={s.links}>
      <Button
        variant="ghost"
        size="sm"
        icon="chart-line"
        testID={`session-${row.number}-performance`}
        onPress={() => router.push({ pathname: '/performance', params: { session } })}
      >
        {`View session ${row.number} performance`}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        icon="list-ordered"
        testID={`session-${row.number}-ledger`}
        onPress={() => router.push({ pathname: '/ledger', params: { session } })}
      >
        Ledger
      </Button>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  body: {
    gap: t.space[3],
    paddingHorizontal: t.space[4],
    paddingTop: t.space[1],
    paddingBottom: t.space[6],
  },
  gap: { marginTop: t.space[3] },
  closed: { gap: t.space[2] },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] },
}));
