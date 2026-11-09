/** More (design 06): links to Settings and About, and the version line. */
import { useRouter, type Href } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { useFeed } from '@/src/api/FeedProvider';
import { useTheme } from '@/src/theme';
import { AppBar, Icon, Screen, Text, type IconName } from '@/src/ui';
import { cardStyle, makeStyles } from '@/src/ui/styles';
import { useAppEnv } from '../app/AppEnv';

const LINKS: { href: Href; icon: IconName; title: string; caption: string; testID: string }[] = [
  {
    href: '/more/settings',
    icon: 'settings',
    title: 'Settings',
    caption: 'Stake caps, minimum stake, reminders, theme',
    testID: 'more-settings',
  },
  {
    href: '/more/about',
    icon: 'info',
    title: 'About',
    caption: 'How advice is made, data sources, disclaimer',
    testID: 'more-about',
  },
];

export function MoreScreen() {
  const theme = useTheme();
  const s = useStyles();
  const router = useRouter();
  const { appVersion } = useAppEnv();
  const feed = useFeed();
  const model = feed.meta?.model_version ?? feed.signals?.model_version;
  return (
    <Screen testID="screen-more">
      <AppBar title="More" large />
      <ScrollView contentContainerStyle={s.body}>
        <View style={s.card}>
          {LINKS.map((l, i) => (
            <Pressable
              key={l.title}
              testID={l.testID}
              accessibilityRole="button"
              accessibilityLabel={`${l.title}. ${l.caption}`}
              onPress={() => router.push(l.href)}
              style={({ pressed }) => [
                s.row,
                i < LINKS.length - 1 && s.divider,
                pressed && s.pressed,
              ]}
            >
              <View style={s.icon}>
                <Icon name={l.icon} size={22} color={theme.colors.brandInk} />
              </View>
              <View style={s.grow}>
                <Text variant="bodyStrong">{l.title}</Text>
                <Text variant="caption" color="inkMuted">
                  {l.caption}
                </Text>
              </View>
              <Icon name="chevron-right" size={22} color={theme.colors.inkSubtle} />
            </Pressable>
          ))}
        </View>
        <View style={s.footer}>
          <Text variant="caption" color="inkSubtle" testID="more-version">
            {`BetAdvisor ${appVersion}${model ? ` · model ${model}` : ''}`}
          </Text>
          <Text variant="caption" color="inkSubtle" style={s.center}>
            Virtual money. Results do not predict real outcomes.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  body: { gap: t.space[4], paddingHorizontal: t.space[4], paddingTop: t.space[1] },
  card: { ...cardStyle(t), padding: 0, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space[3],
    minHeight: 64,
    paddingVertical: t.space[2],
    paddingHorizontal: t.space[4],
  },
  divider: { borderBottomWidth: 1, borderBottomColor: t.colors.line },
  pressed: { backgroundColor: t.colors.surfaceRaised },
  icon: {
    width: 40,
    height: 40,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1 },
  footer: { alignItems: 'center', gap: 2, paddingTop: t.space[2] },
  center: { textAlign: 'center' },
}));
