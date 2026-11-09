import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/src/theme';
import { Icon, type IconName } from '@/src/ui/Icon';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';

interface PlaceholderScreenProps {
  title: string;
  icon: IconName;
  part: number;
}

/** Themed stand-in for a screen that a later plan part builds. */
export function PlaceholderScreen({ title, icon, part }: PlaceholderScreenProps) {
  const theme = useTheme();
  return (
    <Screen testID={`screen-${title.toLowerCase()}`}>
      <View style={[styles.body, { padding: theme.space[4], gap: theme.space[3] }]}>
        <Text variant="overline" color="inkSubtle">
          BetAdvisor
        </Text>
        <Text variant="titleLg">{title}</Text>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.line,
              borderRadius: theme.radius.lg,
              padding: theme.space[4],
              gap: theme.space[2],
            },
            theme.shadows.card,
          ]}
        >
          <Icon name={icon} size={24} color={theme.colors.brandInk} />
          <Text color="inkMuted">Built in Part {part}.</Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  card: { borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center' },
});
