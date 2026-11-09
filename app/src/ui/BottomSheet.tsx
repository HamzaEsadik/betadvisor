import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/src/theme';
import { makeStyles } from './styles';
import { Text } from './Text';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  testID?: string;
}

const OFFSCREEN = 600;
const DURATION = 220;

/** Modal sheet that slides up from the bottom (design 05). Back button and scrim tap close it. */
export function BottomSheet({ visible, onClose, title, children, testID }: BottomSheetProps) {
  const theme = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const [offset] = useState(() => new Animated.Value(OFFSCREEN));
  // Mount as soon as it opens (state adjusted during render); unmount once it has slid out.
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    Animated.timing(offset, {
      toValue: visible ? 0 : OFFSCREEN,
      duration: DURATION,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, offset]);

  if (!mounted) return null;
  return (
    <Modal
      transparent
      visible
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={s.root}>
        <Pressable
          testID="sheet-scrim"
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={[s.scrim, { backgroundColor: theme.colors.scrim }]}
        />
        <Animated.View
          testID={testID}
          accessibilityViewIsModal
          style={[
            s.sheet,
            theme.shadows.sheet,
            { paddingBottom: theme.space[6] + insets.bottom, transform: [{ translateY: offset }] },
          ]}
        >
          <View style={s.handle} />
          {title !== undefined && (
            <Text variant="titleMd" accessibilityRole="header">
              {title}
            </Text>
          )}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  sheet: {
    backgroundColor: t.colors.surface,
    borderTopLeftRadius: t.radius.xl,
    borderTopRightRadius: t.radius.xl,
    paddingHorizontal: t.space[5],
    paddingTop: t.space[3],
    gap: t.space[4],
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.lineStrong,
  },
}));
