import { Tabs } from 'expo-router';

import type { IconName } from '@/src/ui/Icon';
import { RouterTabBar } from '@/src/ui/TabBar';

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Today', icon: 'calendar-days' },
  { name: 'ledger', title: 'Ledger', icon: 'list-ordered' },
  { name: 'performance', title: 'Performance', icon: 'chart-line' },
  { name: 'sessions', title: 'Sessions', icon: 'layers' },
  { name: 'more', title: 'More', icon: 'settings' },
];

const ICONS: Readonly<Record<string, IconName>> = Object.fromEntries(
  TABS.map((t) => [t.name, t.icon]),
);

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <RouterTabBar {...props} icons={ICONS} />}
    >
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title }} />
      ))}
    </Tabs>
  );
}
