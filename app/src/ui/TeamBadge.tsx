import { View } from 'react-native';

import { fonts } from '@/src/theme';
import { code3 } from './format';
import { makeStyles } from './styles';
import { Text } from './Text';

export interface TeamBadgeProps {
  code?: string;
  name?: string;
  size?: 'sm' | 'md';
}

/** `.ba-badge`: round team code badge. Decorative: the team name is always shown next to it. */
export function TeamBadge({ code, name, size = 'sm' }: TeamBadgeProps) {
  const s = useStyles();
  return (
    <View
      style={[s.badge, size === 'md' && s.md]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text color="onHero" style={[s.text, size === 'md' && s.textMd]} maxFontSizeMultiplier={1}>
        {code ?? code3(name)}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  badge: {
    width: t.sizes.badgeSm,
    height: t.sizes.badgeSm,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.hero,
    alignItems: 'center',
    justifyContent: 'center',
  },
  md: { width: t.sizes.badgeMd, height: t.sizes.badgeMd },
  text: { fontFamily: fonts.display700, fontSize: 11, lineHeight: 13, letterSpacing: 0.44 },
  textMd: { fontSize: 14, lineHeight: 16, letterSpacing: 0.56 },
}));
