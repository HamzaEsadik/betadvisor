import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useTheme, type ColorName, type TypeName } from '@/src/theme';

export interface TextProps extends RNTextProps {
  variant?: TypeName;
  color?: ColorName;
}

/** Text with a type-scale variant and a theme color. */
export function Text({ variant = 'body', color = 'ink', style, ...rest }: TextProps) {
  const theme = useTheme();
  return <RNText style={[theme.type[variant], { color: theme.colors[color] }, style]} {...rest} />;
}
