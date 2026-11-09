import { Pressable, View } from 'react-native';

import { useTheme } from '@/src/theme';
import { Icon } from './Icon';
import { makeStyles } from './styles';
import { Text } from './Text';

export type BannerTone = 'warn' | 'info' | 'neutral';

export interface BannerProps {
  tone?: BannerTone;
  title?: string;
  children?: string;
  /** Action button text, e.g. `"Retry"` or `"Reset"`. */
  action?: string;
  onAction?: () => void;
  testID?: string;
}

/** `.ba-banner`: stale data, offline, depleted bankroll and other notices. */
export function Banner({ tone = 'info', title, children, action, onAction, testID }: BannerProps) {
  const theme = useTheme();
  const s = useStyles();
  const ink = tone === 'warn' ? theme.colors.warn : theme.colors.ink;
  return (
    <View
      testID={testID}
      accessibilityRole={tone === 'warn' ? 'alert' : 'summary'}
      accessibilityLiveRegion={tone === 'warn' ? 'assertive' : 'polite'}
      style={[s.banner, s[tone]]}
    >
      <Icon name={tone === 'warn' ? 'triangle-alert' : 'info'} size={20} color={ink} />
      <View style={s.text}>
        {title !== undefined && (
          <Text variant="bodyStrong" style={{ color: ink }}>
            {title}
          </Text>
        )}
        {children !== undefined && (
          <Text variant="caption" style={{ color: ink }}>
            {children}
          </Text>
        )}
      </View>
      {action !== undefined && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action}
          onPress={onAction}
          style={s.action}
        >
          <Text variant="bodyStrong" style={[s.actionText, { color: ink }]}>
            {action}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: t.space[3],
    paddingVertical: t.space[3],
    paddingHorizontal: t.space[4],
    borderRadius: t.radius.md,
  },
  warn: { backgroundColor: t.colors.warnSoft },
  info: { backgroundColor: t.colors.surfaceRaised },
  neutral: { backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.line },
  text: { flex: 1, gap: 2 },
  action: {
    minHeight: t.sizes.tapMin,
    minWidth: t.sizes.tapMin,
    paddingHorizontal: t.space[2],
    marginVertical: -t.space[3],
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { textDecorationLine: 'underline' },
}));
