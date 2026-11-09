import { Pressable, View } from 'react-native';

import { useTheme } from '@/src/theme';
import { Icon, type IconName } from './Icon';
import { makeStyles } from './styles';
import { Text } from './Text';

export interface AppBarAction {
  icon: IconName;
  label: string;
  onPress?: () => void;
}

export interface AppBarProps {
  title: string;
  subtitle?: string;
  large?: boolean;
  onBack?: () => void;
  actions?: readonly AppBarAction[];
}

/** `.ba-appbar`: screen title with optional back button and icon actions. */
export function AppBar({ title, subtitle, large = false, onBack, actions = [] }: AppBarProps) {
  const theme = useTheme();
  const s = useStyles();
  return (
    <View style={s.bar}>
      {onBack !== undefined && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={[s.iconBtn, s.back]}
        >
          <View style={s.flip}>
            <Icon name="chevron-right" size={22} color={theme.colors.ink} />
          </View>
        </Pressable>
      )}
      <View style={s.title}>
        <Text variant={large ? 'titleLg' : 'titleMd'} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {subtitle !== undefined && (
          <Text variant="caption" color="inkMuted" numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      <View style={s.actions}>
        {actions.map((a) => (
          <Pressable
            key={a.icon}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            onPress={a.onPress}
            style={s.iconBtn}
          >
            <Icon name={a.icon} size={22} color={theme.colors.ink} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space[2],
    minHeight: t.sizes.appbarH,
    paddingLeft: t.space[4],
    paddingRight: t.space[2],
    backgroundColor: t.colors.bg,
  },
  title: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row' },
  iconBtn: {
    width: t.sizes.tapMin,
    height: t.sizes.tapMin,
    borderRadius: t.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: { marginLeft: -t.space[3] },
  flip: { transform: [{ rotate: '180deg' }] },
}));
