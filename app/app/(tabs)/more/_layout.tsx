import { Stack } from 'expo-router';

/** More, Settings and About stack inside the More tab, so the tab bar stays (designs 06, 07, 15). */
export default function MoreLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
