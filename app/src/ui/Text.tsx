import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useTheme, type ColorName, type TypeName } from '@/src/theme';

/**
 * Largest font scale honoured for system font size (Dynamic Type). Beyond it fixed-size layouts
 * such as the tab bar and the stat tiles would clip.
 */
export const MAX_FONT_SCALE = 1.5;

/** Large display numbers (bankroll, budget input) already fill the width, so they scale less. */
export const MAX_FONT_SCALE_DISPLAY = 1.2;

const NO_LINE_HEIGHT = { lineHeight: undefined };

export interface TextProps extends RNTextProps {
  variant?: TypeName;
  color?: ColorName;
}

/** Text with a type-scale variant, a theme color and a capped font scale. */
export function Text({
  variant = 'body',
  color = 'ink',
  style,
  allowFontScaling = true,
  maxFontSizeMultiplier,
  adjustsFontSizeToFit,
  ...rest
}: TextProps) {
  const theme = useTheme();
  const cap =
    maxFontSizeMultiplier ?? (variant === 'bankrollXl' ? MAX_FONT_SCALE_DISPLAY : MAX_FONT_SCALE);
  return (
    <RNText
      allowFontScaling={allowFontScaling}
      maxFontSizeMultiplier={cap}
      adjustsFontSizeToFit={adjustsFontSizeToFit}
      style={[
        theme.type[variant],
        // Android only shrinks text to fit when no line height is set.
        ...(adjustsFontSizeToFit ? [NO_LINE_HEIGHT] : []),
        { color: theme.colors[color] },
        style,
      ]}
      {...rest}
    />
  );
}
