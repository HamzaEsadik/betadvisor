/** Settings (design 07): staking caps, FR-B5, reminders, display and data refresh. */
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { useFeed, useFeedStore } from '@/src/api/FeedProvider';
import { repos } from '@/src/db/repos';
import { scheduleStakeSettings } from '@/src/db/services';
import { dayKeyOf } from '@/src/domain/day';
import { formatMoney } from '@/src/domain/money';
import {
  PERMISSION_DENIED_TEXT,
  cancelReminder,
  enableReminder,
  scheduleReminder,
} from '@/src/notifications/reminder';
import type { StakeSettings } from '@/src/domain/types';
import { useTheme, type ThemeMode } from '@/src/theme';
import { AppBar, Banner, Icon, Screen, Switch, Text, format } from '@/src/ui';
import { makeStyles } from '@/src/ui/styles';
import { useAppEnv } from '../app/AppEnv';
import { Toast } from '../common/Toast';
import { dayLabel, localTime, relativeDay } from '../time';
import { OptionSheet, type Option } from './OptionSheet';
import { CURRENCIES, type Prefs } from './prefs';
import { usePrefs } from './usePrefs';

export const PER_BET_CAPS = [0.01, 0.02, 0.03, 0.05, 0.1] as const;
export const DAILY_CAPS = [0.05, 0.1, 0.15, 0.2, 0.3] as const;
export const MIN_STAKES_CENTS = [50, 100, 200, 500] as const;
export const NOTIFICATION_TIMES: readonly string[] = Array.from({ length: 13 }, (_, i) => {
  const minutes = 6 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${minutes % 60 === 0 ? '00' : '30'}`;
});

export const THEME_LABELS: Readonly<Record<ThemeMode, string>> = {
  dark: 'Dark',
  light: 'Light',
  system: 'Match system',
};

type Picker = 'perBetCap' | 'dailyCap' | 'minStake' | 'time' | 'currency' | 'theme';

const capLabel = (x: number) => `${format.pct(x)} of bankroll`;

export function SettingsScreen() {
  const s = useStyles();
  const router = useRouter();
  const { db, now, offsetOf, currency, revision, invalidate } = useAppEnv();
  const feed = useFeed();
  const store = useFeedStore();
  const [prefs, setPref] = usePrefs();
  const [picker, setPicker] = useState<Picker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reminderNote, setReminderNote] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `revision` signals a database write
  const session = useMemo(() => repos(db).sessions.getActive() ?? null, [db, revision]);
  if (session === null) return null;

  const at = now();
  const today = dayKeyOf(at, offsetOf);
  // A change still to come shows as the chosen value; one whose day has come is in force.
  const pending =
    session.nextSettings !== null && Date.parse(session.nextSettings.from) > at.getTime()
      ? session.nextSettings
      : null;
  const inForce =
    session.nextSettings !== null && pending === null
      ? session.nextSettings.settings
      : session.settings;
  const chosen: StakeSettings = pending?.settings ?? inForce;
  const money = (c: number) => formatMoney(c, currency);

  const saveStakes = (patch: Partial<StakeSettings>) => {
    setPicker(null);
    try {
      scheduleStakeSettings(db, { ...chosen, ...patch }, at, offsetOf);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    invalidate();
  };

  const pick = <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPicker(null);
    setPref(key, value);
  };

  // FR-N1: permission is asked for only here; denied leaves the switch off with an explanation.
  const toggleReminder = async (on: boolean) => {
    setReminderNote(null);
    try {
      if (!on) {
        setPref('notificationsEnabled', false);
        await cancelReminder();
      } else if (await enableReminder(prefs.notificationTime)) {
        setPref('notificationsEnabled', true);
      } else {
        setReminderNote(PERMISSION_DENIED_TEXT);
      }
    } catch (e) {
      setReminderNote(
        `Could not schedule the reminder: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  };

  const pickTime = async (time: string) => {
    pick('notificationTime', time);
    if (!prefs.notificationsEnabled) return;
    try {
      await scheduleReminder(time);
    } catch (e) {
      setReminderNote(
        `Could not schedule the reminder: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  };

  const refresh = async () => {
    const state = await store.refresh();
    setToast(state.isOffline ? 'Could not reach the server. Showing saved data.' : 'Data updated');
  };

  const fetched = feed.lastFetchedAt;
  const lastUpdated = feed.isRefreshing
    ? 'Refreshing…'
    : fetched === null
      ? 'Not updated yet'
      : `Last updated ${relativeDay(fetched, today, offsetOf).toLowerCase()} ${localTime(fetched, offsetOf)}`;

  const sheet = sheetFor(picker);

  return (
    <Screen testID="screen-settings">
      <AppBar title="Settings" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={s.body}>
        <Section title="Staking">
          <Row
            testID="row-per-bet-cap"
            label="Per-bet cap"
            value={capLabel(chosen.perBetCap)}
            onPress={() => setPicker('perBetCap')}
          />
          <Row
            testID="row-daily-cap"
            label="Daily exposure cap"
            value={capLabel(chosen.dailyCap)}
            onPress={() => setPicker('dailyCap')}
          />
          <Row
            testID="row-min-stake"
            label="Minimum stake"
            value={money(chosen.minStakeCents)}
            onPress={() => setPicker('minStake')}
          />
          <View style={s.srow}>
            <View style={s.grow}>
              <Text variant="bodyStrong">Choose bets individually</Text>
              <Text variant="caption" color="inkMuted">
                Pick which recommended bets Follow advice freezes
              </Text>
            </View>
            <Switch
              testID="switch-choose"
              accessibilityLabel="Choose bets individually"
              value={prefs.chooseIndividually}
              onValueChange={(v) => setPref('chooseIndividually', v)}
            />
          </View>
        </Section>
        <Text variant="caption" color="inkSubtle" style={s.note} testID="caps-note">
          {pending === null
            ? 'Caps apply to advice from the next day. Frozen bets never change.'
            : `New caps apply from ${dayLabel(dayKeyOf(pending.from, offsetOf))}. Today's advice keeps ${format.pct(inForce.perBetCap)} per bet, ${format.pct(inForce.dailyCap)} per day and a ${money(inForce.minStakeCents)} minimum. Frozen bets never change.`}
        </Text>
        {error !== null && (
          <Banner tone="warn" title="Could not save">
            {error}
          </Banner>
        )}

        <Section title="Reminders">
          <View style={s.srow}>
            <Text variant="bodyStrong">Daily notification</Text>
            <Switch
              testID="switch-notifications"
              accessibilityLabel="Daily notification"
              value={prefs.notificationsEnabled}
              onValueChange={(v) => void toggleReminder(v)}
            />
          </View>
          {reminderNote !== null && (
            <Text variant="caption" color="warn" style={s.note} testID="reminder-note">
              {reminderNote}
            </Text>
          )}
          <Row
            testID="row-notification-time"
            label="Notification time"
            value={prefs.notificationTime}
            disabled={!prefs.notificationsEnabled}
            onPress={() => setPicker('time')}
          />
        </Section>

        <Section title="Display">
          <Row
            testID="row-currency"
            label="Currency symbol"
            value={`${prefs.currency} (display only)`}
            onPress={() => setPicker('currency')}
          />
          <Row
            testID="row-theme"
            label="Theme"
            value={THEME_LABELS[prefs.theme]}
            onPress={() => setPicker('theme')}
          />
        </Section>

        <Section title="Data">
          <Row
            testID="row-refresh"
            label="Refresh data"
            caption={lastUpdated}
            icon="rotate-ccw"
            disabled={feed.isRefreshing}
            onPress={() => void refresh()}
          />
        </Section>
      </ScrollView>
      <OptionSheet<string | number>
        title={sheet?.title ?? null}
        note={sheet?.note}
        options={sheet?.options ?? []}
        selected={sheet?.selected}
        onSelect={(v) => sheet?.onSelect(v)}
        onClose={() => setPicker(null)}
      />
      <Toast message={toast} onHide={hideToast} />
    </Screen>
  );

  function sheetFor(p: Picker | null): {
    title: string;
    note?: string;
    options: Option<string | number>[];
    selected: string | number;
    onSelect: (v: string | number) => void;
  } | null {
    const fromTomorrow = 'Applies to advice from the next day. Frozen bets never change.';
    switch (p) {
      case 'perBetCap':
        return {
          title: 'Per-bet cap',
          note: fromTomorrow,
          options: PER_BET_CAPS.map((v) => ({
            value: v,
            label: capLabel(v),
            disabled: v > chosen.dailyCap,
          })),
          selected: chosen.perBetCap,
          onSelect: (v) => saveStakes({ perBetCap: Number(v) }),
        };
      case 'dailyCap':
        return {
          title: 'Daily exposure cap',
          note: fromTomorrow,
          options: DAILY_CAPS.map((v) => ({
            value: v,
            label: capLabel(v),
            disabled: v < chosen.perBetCap,
          })),
          selected: chosen.dailyCap,
          onSelect: (v) => saveStakes({ dailyCap: Number(v) }),
        };
      case 'minStake':
        return {
          title: 'Minimum stake',
          note: fromTomorrow,
          options: MIN_STAKES_CENTS.map((v) => ({ value: v, label: money(v) })),
          selected: chosen.minStakeCents,
          onSelect: (v) => saveStakes({ minStakeCents: Number(v) }),
        };
      case 'time':
        return {
          title: 'Notification time',
          options: NOTIFICATION_TIMES.map((v) => ({ value: v, label: v })),
          selected: prefs.notificationTime,
          onSelect: (v) => void pickTime(String(v)),
        };
      case 'currency':
        return {
          title: 'Currency symbol',
          note: 'Display only. Amounts are not converted.',
          options: CURRENCIES.map((v) => ({ value: v, label: v })),
          selected: prefs.currency,
          onSelect: (v) => pick('currency', v as Prefs['currency']),
        };
      case 'theme':
        return {
          title: 'Theme',
          options: (Object.keys(THEME_LABELS) as ThemeMode[]).map((v) => ({
            value: v,
            label: THEME_LABELS[v],
          })),
          selected: prefs.theme,
          onSelect: (v) => pick('theme', v as ThemeMode),
        };
      default:
        return null;
    }
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const s = useStyles();
  return (
    <>
      <Text variant="overline" color="inkSubtle" accessibilityRole="header" style={s.overline}>
        {title}
      </Text>
      <View style={s.group}>{children}</View>
    </>
  );
}

interface RowProps {
  label: string;
  value?: string;
  caption?: string;
  icon?: 'rotate-ccw';
  disabled?: boolean;
  onPress: () => void;
  testID: string;
}

function Row({ label, value, caption, icon, disabled, onPress, testID }: RowProps) {
  const theme = useTheme();
  const s = useStyles();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={[label, value, caption].filter(Boolean).join(', ')}
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [s.srow, pressed && s.pressed, disabled === true && s.dim]}
    >
      <View style={s.grow}>
        <Text variant="bodyStrong">{label}</Text>
        {caption !== undefined && (
          <Text variant="caption" color="inkMuted">
            {caption}
          </Text>
        )}
      </View>
      <View style={s.val}>
        {value !== undefined && (
          <Text color="inkMuted" style={s.num}>
            {value}
          </Text>
        )}
        <Icon name={icon ?? 'chevron-right'} size={20} color={theme.colors.inkMuted} />
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  body: {
    gap: t.space[2],
    paddingHorizontal: t.space[4],
    paddingTop: t.space[2],
    paddingBottom: t.space[6],
  },
  overline: { marginTop: t.space[2] },
  group: {
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.line,
    borderRadius: t.radius.lg,
    overflow: 'hidden',
    ...t.shadows.card,
  },
  srow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: t.space[3],
    minHeight: 52,
    paddingVertical: 6,
    paddingHorizontal: t.space[4],
    borderBottomWidth: 1,
    borderBottomColor: t.colors.line,
  },
  pressed: { backgroundColor: t.colors.surfaceRaised },
  dim: { opacity: 0.5 },
  grow: { flex: 1 },
  val: { flexDirection: 'row', alignItems: 'center', gap: t.space[1] },
  num: { fontVariant: ['tabular-nums'] },
  note: { paddingHorizontal: t.space[1], paddingBottom: t.space[2] },
}));
