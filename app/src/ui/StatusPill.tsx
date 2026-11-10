import { View } from 'react-native';

import type { ColorName } from '@/src/theme';
import { useTheme } from '@/src/theme';
import { Icon, type IconName } from './Icon';
import { makeStyles } from './styles';
import { Text } from './Text';

export type BetStatus = 'open' | 'won' | 'lost' | 'void' | 'review';

/** Every status has its own icon and text, so it never relies on color alone (SRS 7.1). */
export const STATUS: Readonly<
  Record<BetStatus, { icon: IconName; label: string; ink: ColorName; bg: ColorName }>
> = {
  open: { icon: 'clock', label: 'Open', ink: 'inkMuted', bg: 'surfaceRaised' },
  won: { icon: 'check', label: 'Won', ink: 'win', bg: 'winSoft' },
  lost: { icon: 'x', label: 'Lost', ink: 'loss', bg: 'lossSoft' },
  void: { icon: 'minus', label: 'Void', ink: 'inkMuted', bg: 'surfaceRaised' },
  review: { icon: 'triangle-alert', label: 'Needs review', ink: 'warn', bg: 'warnSoft' },
};

export interface StatusPillProps {
  status: BetStatus;
  /** Overrides the default status text. */
  label?: string;
}

/** `.ba-pill-*`: bet status with icon, text and tone. */
export function StatusPill({ status, label }: StatusPillProps) {
  const theme = useTheme();
  const s = useStyles();
  const spec = STATUS[status];
  const text = label ?? spec.label;
  return (
    <View
      accessible
      accessibilityLabel={`Status: ${text}`}
      testID={`status-${status}`}
      style={[s.pill, { backgroundColor: theme.colors[spec.bg] }]}
    >
      <Icon name={spec.icon} size={14} strokeWidth={2} color={theme.colors[spec.ink]} />
      <Text variant="caption" color={spec.ink}>
        {text}
      </Text>
    </View>
  );
}

/** A neutral pill with text only (skip reasons, "Closed"). */
export function Pill({ children, icon }: { children: string; icon?: IconName }) {
  const theme = useTheme();
  const s = useStyles();
  return (
    <View style={[s.pill, icon === undefined && s.textOnly]}>
      {icon !== undefined && (
        <Icon name={icon} size={14} strokeWidth={2} color={theme.colors.inkMuted} />
      )}
      <Text variant="caption" color="inkMuted" numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: t.space[1],
    paddingVertical: 2,
    paddingLeft: 6,
    paddingRight: t.space[2],
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.surfaceRaised,
  },
  textOnly: { paddingLeft: t.space[2] },
}));
