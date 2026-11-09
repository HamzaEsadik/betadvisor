import { useEffect } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/src/theme';
import { Icon } from '@/src/ui/Icon';
import { makeStyles } from '@/src/ui/styles';
import { Text } from '@/src/ui/Text';

export const TOAST_MS = 4000;

interface ToastProps {
  message: string | null;
  onHide: () => void;
}

/** A short confirmation above the footer, announced to screen readers. */
export function Toast({ message, onHide }: ToastProps) {
  const theme = useTheme();
  const s = useStyles();
  useEffect(() => {
    if (message === null) return;
    const id = setTimeout(onHide, TOAST_MS);
    return () => clearTimeout(id);
  }, [message, onHide]);
  if (message === null) return null;
  return (
    <View testID="toast" style={s.toast} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <Icon name="check" size={18} color={theme.colors.win} />
      <Text variant="bodyStrong" style={s.text}>
        {message}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  toast: {
    position: 'absolute',
    left: t.space[4],
    right: t.space[4],
    bottom: t.space[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space[2],
    padding: t.space[3],
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: t.colors.lineStrong,
    ...t.shadows.card,
  },
  text: { flex: 1 },
}));
