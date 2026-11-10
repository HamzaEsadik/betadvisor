import { Pressable, View } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/tabs';

import { useTheme } from '@/src/theme';
import { Icon, type IconName } from './Icon';
import { makeStyles } from './styles';
import { Text } from './Text';

export interface TabItem {
  key: string;
  label: string;
  icon: IconName;
}

export interface TabBarProps {
  items: readonly TabItem[];
  active: string;
  onChange?: (key: string) => void;
  /** Bottom system-bar inset (edge-to-edge). */
  bottomInset?: number;
}

/** `.ba-tabbar`: the main navigation bar. */
export function TabBar({ items, active, onChange, bottomInset = 0 }: TabBarProps) {
  const theme = useTheme();
  const s = useStyles();
  return (
    <View
      testID="tabbar"
      accessibilityRole="tablist"
      style={[s.bar, { paddingBottom: bottomInset, height: theme.sizes.tabbarH + bottomInset }]}
    >
      {items.map((it) => {
        const on = it.key === active;
        const color = on ? theme.colors.brandInk : theme.colors.inkMuted;
        return (
          <Pressable
            key={it.key}
            testID={`tab-${it.key}`}
            accessibilityRole="tab"
            accessibilityLabel={it.label}
            accessibilityState={{ selected: on }}
            onPress={() => onChange?.(it.key)}
            style={s.tab}
          >
            <View style={[s.marker, on && s.markerOn]} />
            <Icon name={it.icon} size={22} color={color} />
            <Text
              variant="caption"
              style={[s.label, { color }]}
              maxFontSizeMultiplier={1.2}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {it.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Adapter used as the expo-router `<Tabs tabBar>`; icons come from the layout's tab list. */
export function RouterTabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
  insets,
  icons,
}: BottomTabBarProps & { icons: Readonly<Record<string, IconName>> }) {
  const items = state.routes.map((r) => ({
    key: r.key,
    label: descriptors[r.key]?.options.title ?? r.name,
    icon: icons[r.name] ?? 'info',
  }));
  const active = state.routes[state.index]?.key ?? '';
  const onChange = (key: string) => {
    const event = emitter.emit({ type: 'tabPress', target: key, canPreventDefault: true });
    if (key !== active && !event.defaultPrevented) navigateToTab(key);
  };
  return <TabBar items={items} active={active} onChange={onChange} bottomInset={insets.bottom} />;
}

const useStyles = makeStyles((t) => ({
  bar: {
    flexDirection: 'row',
    backgroundColor: t.colors.surface,
    borderTopWidth: 1,
    borderTopColor: t.colors.line,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: t.sizes.tapMin,
  },
  marker: {
    position: 'absolute',
    top: 0,
    width: 28,
    height: 3,
    borderRadius: t.radius.pill,
    backgroundColor: 'transparent',
  },
  markerOn: { backgroundColor: t.colors.brand },
  // At font scale > 1, "Performance" is wider than a fifth of a 411 dp screen: shrink to fit.
  label: { alignSelf: 'stretch', textAlign: 'center', paddingHorizontal: 2 },
}));
