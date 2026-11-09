import { Tabs } from 'expo-router';

import { useTheme } from '@/src/theme';
import { Icon, type IconName } from '@/src/ui/Icon';

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Today', icon: 'calendar-days' },
  { name: 'ledger', title: 'Ledger', icon: 'list-ordered' },
  { name: 'performance', title: 'Performance', icon: 'chart-line' },
  { name: 'sessions', title: 'Sessions', icon: 'layers' },
  { name: 'more', title: 'More', icon: 'settings' },
];

export default function TabLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.brandInk,
        tabBarInactiveTintColor: theme.colors.inkSubtle,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.line,
        },
        tabBarLabelStyle: theme.type.caption,
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color }) => <Icon name={tab.icon} size={22} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
