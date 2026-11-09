import { Pressable, View } from 'react-native';

import { useTheme } from '@/src/theme';
import { Icon, type IconName } from './Icon';
import { hitSlopFor, makeStyles } from './styles';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps {
  children: string;
  variant?: ButtonVariant;
  full?: boolean;
  size?: 'md' | 'sm';
  disabled?: boolean;
  icon?: IconName;
  onPress?: () => void;
  /** Defaults to the button text. */
  accessibilityLabel?: string;
  testID?: string;
}

const SM_HEIGHT = 36;

/** `.ba-btn`: primary, secondary (outlined) and ghost buttons, 48 dp tall (sm: 36 + hit slop). */
export function Button({
  children,
  variant = 'primary',
  full = false,
  size = 'md',
  disabled = false,
  icon,
  onPress,
  accessibilityLabel,
  testID,
}: ButtonProps) {
  const theme = useTheme();
  const s = useStyles();
  const c = theme.colors;
  const ink = disabled
    ? c.inkSubtle
    : variant === 'primary'
      ? c.onBrand
      : variant === 'ghost'
        ? c.brandInk
        : c.ink;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={size === 'sm' ? hitSlopFor(SM_HEIGHT) : undefined}
      style={({ pressed }) => [
        s.base,
        size === 'sm' && s.sm,
        full && s.full,
        variant === 'primary' && { backgroundColor: pressed ? c.brandPressed : c.brand },
        variant === 'secondary' && {
          borderColor: c.lineStrong,
          backgroundColor: pressed ? c.surfaceRaised : 'transparent',
        },
        variant === 'ghost' && pressed && { backgroundColor: c.surfaceRaised },
        disabled && s.disabled,
      ]}
    >
      <View style={s.content}>
        {icon !== undefined && <Icon name={icon} size={18} color={ink} />}
        <Text variant="bodyStrong" style={{ color: ink }}>
          {children}
        </Text>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  base: {
    minHeight: t.sizes.tapMin,
    paddingHorizontal: t.space[5],
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  sm: { minHeight: SM_HEIGHT, paddingHorizontal: t.space[3] },
  full: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: t.space[2] },
  disabled: { backgroundColor: t.colors.surfaceRaised, borderColor: t.colors.line },
}));
