import { Link, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/src/theme';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';

export default function NotFoundScreen() {
  const theme = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <Screen>
        <View style={[styles.body, { padding: theme.space[5], gap: theme.space[4] }]}>
          <Text variant="headline">This screen does not exist.</Text>
          <Link href="/">
            <Text color="brandInk">Go to Today</Text>
          </Link>
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
