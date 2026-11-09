import { View } from 'react-native';

import { fonts, type ColorName } from '@/src/theme';
import { makeStyles } from './styles';
import { Text } from './Text';

export interface FormStripProps {
  /** Recent results, oldest first, e.g. `"WWDLW"`. */
  form: string;
  /** Team name for the accessibility label. */
  label?: string;
}

const WORD: Readonly<Record<string, string>> = { W: 'win', D: 'draw', L: 'loss' };

function tone(letter: string): { ink: ColorName; bg: 'winSoft' | 'lossSoft' | 'surfaceRaised' } {
  if (letter === 'W') return { ink: 'win', bg: 'winSoft' };
  if (letter === 'L') return { ink: 'loss', bg: 'lossSoft' };
  return { ink: 'inkMuted', bg: 'surfaceRaised' };
}

/** `.ba-form`: W/D/L squares; each carries its letter, so color is not the only cue. */
export function FormStrip({ form, label }: FormStripProps) {
  const s = useStyles();
  const letters = form.toUpperCase().split('');
  const spoken = letters.map((l) => WORD[l] ?? l).join(', ');
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${label !== undefined ? `${label} form` : 'Form'}: ${spoken || 'none'}`}
      style={s.row}
    >
      {letters.map((l, i) => {
        const tn = tone(l);
        return (
          <View key={i} style={[s.dot, s[tn.bg]]}>
            <Text color={tn.ink} style={s.letter} maxFontSizeMultiplier={1}>
              {l}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', gap: 3 },
  dot: { width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  letter: { fontFamily: fonts.sans700, fontSize: 11, lineHeight: 13 },
  winSoft: { backgroundColor: t.colors.winSoft },
  lossSoft: { backgroundColor: t.colors.lossSoft },
  surfaceRaised: { backgroundColor: t.colors.surfaceRaised },
}));
