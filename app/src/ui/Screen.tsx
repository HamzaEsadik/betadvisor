import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme } from '@/src/theme';

interface ScreenProps {
  children: ReactNode;
  edges?: Edge[];
  testID?: string;
}

/** Full-screen themed container that respects edge-to-edge system bar insets. */
export function Screen({ children, edges = ['top'], testID }: ScreenProps) {
  const theme = useTheme();
  return (
    <SafeAreaView
      testID={testID}
      edges={edges}
      style={[styles.root, { backgroundColor: theme.colors.bg }]}
    >
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
