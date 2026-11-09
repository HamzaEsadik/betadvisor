/** About (design 15): how advice is made, data sources, NFR-L1 to NFR-L3, NFR-U2. */
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';

import { useFeed } from '@/src/api/FeedProvider';
import { MODEL_RULES } from '@/src/config/model';
import { repos } from '@/src/db/repos';
import { settingsAt } from '@/src/domain/settings';
import { DEFAULT_STAKE_SETTINGS } from '@/src/domain/types';
import { formatMoney } from '@/src/domain/money';
import { useTheme } from '@/src/theme';
import { AppBar, Banner, Icon, Screen, Text, format } from '@/src/ui';
import { cardStyle, makeStyles } from '@/src/ui/styles';
import { useAppEnv } from '../app/AppEnv';
import { RESPONSIBLE_GAMBLING_NOTE, VIRTUAL_MONEY_NOTICE } from '../setup/SetupScreen';

const KELLY_WORDS: Readonly<Record<number, string>> = { 0.25: 'a quarter', 0.5: 'half' };

export function AboutScreen() {
  const theme = useTheme();
  const s = useStyles();
  const router = useRouter();
  const { db, now, currency, appVersion, revision } = useAppEnv();
  const feed = useFeed();

  // The settings in force right now (design 07 changes apply from the next day).
  const settings = useMemo(() => {
    const session = repos(db).sessions.getActive();
    if (!session) return DEFAULT_STAKE_SETTINGS;
    return settingsAt({ settings: session.settings, next: session.nextSettings }, now());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `revision` signals a database write
  }, [db, now, revision]);

  const kelly = KELLY_WORDS[MODEL_RULES.kellyMultiplier] ?? format.pct(MODEL_RULES.kellyMultiplier);
  const injuries = feed.meta?.sources_health.injuries;
  const injuriesNote =
    injuries === undefined || injuries.status === 'ok'
      ? 'API-Football (api-football.com)'
      : 'API-Football (api-football.com). Unavailable in the latest run, so availability shows as Unknown';

  const steps = [
    'The model estimates the probability of home, draw and away for each upcoming match from team strength, form, home advantage, rest days and player availability.',
    `It compares that with the bookmaker's odds after removing the margin. A match is a candidate only if model probability × odds − 1 is at least ${format.pct(MODEL_RULES.minEdge)} and the odds are between ${format.odds(MODEL_RULES.minOdds)} and ${format.odds(MODEL_RULES.maxOdds)}.`,
    `Stakes are ${kelly} of the Kelly fraction, capped at ${format.pct(settings.perBetCap)} of your bankroll per bet and ${format.pct(settings.dailyCap)} per day, with a ${formatMoney(settings.minStakeCents, currency)} minimum. Every other match is skipped, with the reason shown.`,
  ];

  const sources: [string, string][] = [
    ['Odds', 'The Odds API (the-odds-api.com), one snapshot per league per day'],
    ['Fixtures and results', 'football-data.org'],
    ['History for the model', 'football-data.co.uk'],
    ['Injuries and suspensions', injuriesNote],
  ];

  const versions: [string, string][] = [
    ['App', appVersion],
    ['Model', feed.meta?.model_version ?? feed.signals?.model_version ?? 'Not loaded yet'],
    ['Feed schema', feed.meta ? String(feed.meta.schema_version) : 'Not loaded yet'],
  ];

  return (
    <Screen testID="screen-about">
      <AppBar title="About" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={s.body}>
        <Banner tone="info" title="Virtual money" testID="about-disclaimer">
          {VIRTUAL_MONEY_NOTICE}
        </Banner>
        <View style={s.card}>
          <Text variant="headline" accessibilityRole="header">
            How advice is made
          </Text>
          {steps.map((text, i) => (
            <View key={i} style={s.step}>
              <View style={s.num}>
                <Text variant="headline" color="brandInk">
                  {String(i + 1)}
                </Text>
              </View>
              <Text style={s.grow} testID={`about-step-${i + 1}`}>
                {text}
              </Text>
            </View>
          ))}
        </View>
        <View style={s.card}>
          <Text variant="headline" accessibilityRole="header">
            Data sources
          </Text>
          {sources.map(([k, v]) => (
            <KeyValue key={k} label={k} value={v} />
          ))}
          <Text variant="caption" color="inkSubtle">
            The app always uses the odds in the published advice at the moment you follow it. Odds
            at a real bookmaker may differ. Line movement is not tracked.
          </Text>
        </View>
        <View style={s.card}>
          <View style={s.titleRow}>
            <Icon name="shield-check" size={22} color={theme.colors.brandInk} />
            <Text variant="headline" accessibilityRole="header">
              Responsible gambling
            </Text>
          </View>
          <Text testID="about-responsible">{RESPONSIBLE_GAMBLING_NOTE}</Text>
        </View>
        <View style={s.card}>
          <Text variant="headline" accessibilityRole="header">
            Versions
          </Text>
          {versions.map(([k, v]) => (
            <KeyValue
              key={k}
              label={k}
              value={v}
              testID={`version-${k.toLowerCase().replace(' ', '-')}`}
            />
          ))}
        </View>
        <Text variant="caption" color="inkSubtle" style={s.center}>
          Results do not predict real outcomes. No account, no personal data collected.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function KeyValue({ label, value, testID }: { label: string; value: string; testID?: string }) {
  const s = useStyles();
  return (
    <View style={s.src} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text>{label}</Text>
      <Text color="inkMuted" style={s.value} testID={testID}>
        {value}
      </Text>
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
  card: { ...cardStyle(t), gap: t.space[3] },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space[3] },
  num: {
    width: 28,
    height: 28,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: t.space[2] },
  src: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: t.space[3],
    paddingBottom: t.space[2],
    borderBottomWidth: 1,
    borderBottomColor: t.colors.line,
  },
  value: { flexShrink: 1, textAlign: 'right' },
  center: { textAlign: 'center' },
}));
