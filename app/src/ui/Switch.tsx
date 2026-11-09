import { Pressable, View } from 'react-native';

import { hitSlopFor, makeStyles } from './styles';

export interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
  testID?: string;
}

const HEIGHT = 32;

/** `.switch` (design 07): an on/off toggle, 52 × 32 with a 48 dp touch target. */
export function Switch({
  value,
  onValueChange,
  accessibilityLabel,
  disabled,
  testID,
}: SwitchProps) {
  const s = useStyles();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: disabled === true }}
      disabled={disabled}
      hitSlop={hitSlopFor(HEIGHT)}
      onPress={() => onValueChange(!value)}
      style={[s.track, value ? s.on : s.off, disabled === true && s.disabled]}
    >
      <View style={[s.knob, value ? s.knobOn : s.knobOff]} />
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  track: { width: 52, height: HEIGHT, borderRadius: t.radius.pill, justifyContent: 'center' },
  on: { backgroundColor: t.colors.brand },
  off: {
    backgroundColor: t.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: t.colors.lineStrong,
  },
  disabled: { opacity: 0.5 },
  knob: { position: 'absolute', width: 24, height: 24, borderRadius: t.radius.pill },
  knobOn: { right: 4, backgroundColor: t.colors.onBrand },
  knobOff: { left: 3, backgroundColor: t.colors.inkSubtle },
}));
