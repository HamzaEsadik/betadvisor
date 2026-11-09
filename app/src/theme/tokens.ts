/**
 * Direct port of design/shared/tokens.css.
 * Dark is the default palette; light mirrors `[data-theme="light"]`.
 */
import type { TextStyle } from 'react-native';

export type ColorName =
  | 'bg'
  | 'surface'
  | 'surfaceRaised'
  | 'line'
  | 'lineStrong'
  | 'ink'
  | 'inkMuted'
  | 'inkSubtle'
  | 'brand'
  | 'brandPressed'
  | 'onBrand'
  | 'brandInk'
  | 'hero'
  | 'onHero'
  | 'win'
  | 'winSoft'
  | 'loss'
  | 'lossSoft'
  | 'warn'
  | 'warnSoft'
  | 'focus'
  | 'scrim';

export type Palette = Readonly<Record<ColorName, string>>;

export const darkColors: Palette = {
  bg: '#07142B',
  surface: '#0E2140',
  surfaceRaised: '#162E55',
  line: '#24406E',
  lineStrong: '#6A8CC2',
  ink: '#F1F6FF',
  inkMuted: '#B4C6E3',
  inkSubtle: '#8DA5CC',
  brand: '#5B9DFF',
  brandPressed: '#4488F0',
  onBrand: '#06122A',
  brandInk: '#7DB3FF',
  hero: '#1B4FBF',
  onHero: '#FFFFFF',
  win: '#3DDBB4',
  winSoft: '#0B3B38',
  loss: '#FF9A5C',
  lossSoft: '#4A2810',
  warn: '#FFC857',
  warnSoft: '#3D3110',
  focus: '#7DB3FF',
  scrim: 'rgba(3,10,24,0.66)',
};

export const lightColors: Palette = {
  bg: '#F2F6FD',
  surface: '#FFFFFF',
  surfaceRaised: '#E6EEFA',
  line: '#D2DDF0',
  lineStrong: '#5873A3',
  ink: '#0A1A33',
  inkMuted: '#41557A',
  inkSubtle: '#546A91',
  brand: '#1D5FD8',
  brandPressed: '#174DB0',
  onBrand: '#FFFFFF',
  brandInk: '#1D5FD8',
  hero: '#1B4FBF',
  onHero: '#FFFFFF',
  win: '#006B52',
  winSoft: '#D6F3EA',
  loss: '#A33F00',
  lossSoft: '#FBE5D3',
  warn: '#6B4800',
  warnSoft: '#FFF1CC',
  focus: '#1D5FD8',
  scrim: 'rgba(3,10,24,0.48)',
};

/** RN shadow props for `--shadow-card` / `--shadow-sheet` (Android uses elevation). */
export interface ShadowStyle {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  elevation: number;
}

const NO_SHADOW: ShadowStyle = {
  shadowColor: '#000000',
  shadowOpacity: 0,
  shadowRadius: 0,
  shadowOffset: { width: 0, height: 0 },
  elevation: 0,
};

export const darkShadows = {
  card: NO_SHADOW,
  sheet: {
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
  },
} as const satisfies Record<string, ShadowStyle>;

export const lightShadows = {
  card: {
    shadowColor: '#0A1A33',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sheet: {
    shadowColor: '#0A1A33',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
  },
} as const satisfies Record<string, ShadowStyle>;

export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const sizes = {
  tapMin: 48,
  appbarH: 56,
  tabbarH: 64,
  badgeSm: 28,
  badgeMd: 40,
} as const;

/** Font family names registered by `useAppFonts` (one family per weight: Android ignores fontWeight on custom fonts). */
export const fonts = {
  sans400: 'Barlow_400Regular',
  sans500: 'Barlow_500Medium',
  sans600: 'Barlow_600SemiBold',
  sans700: 'Barlow_700Bold',
  display600: 'BarlowCondensed_600SemiBold',
  display700: 'BarlowCondensed_700Bold',
} as const;

export type TypeName =
  | 'bankrollXl'
  | 'stat'
  | 'titleLg'
  | 'titleMd'
  | 'odds'
  | 'headline'
  | 'body'
  | 'bodyStrong'
  | 'caption'
  | 'overline';

/** The type classes of tokens.css as RN text styles (no color; the theme adds it). */
export const type: Readonly<Record<TypeName, TextStyle>> = {
  bankrollXl: { fontFamily: fonts.display700, fontSize: 56, lineHeight: 52 },
  stat: { fontFamily: fonts.display600, fontSize: 30, lineHeight: 30 },
  titleLg: { fontFamily: fonts.display600, fontSize: 28, lineHeight: 30 },
  titleMd: { fontFamily: fonts.display600, fontSize: 22, lineHeight: 26 },
  odds: { fontFamily: fonts.display700, fontSize: 22, lineHeight: 24 },
  headline: { fontFamily: fonts.sans600, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: fonts.sans400, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.sans600, fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: fonts.sans500, fontSize: 13, lineHeight: 18 },
  overline: {
    fontFamily: fonts.sans600,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 11 * 0.08,
    textTransform: 'uppercase',
  },
};

export type Scheme = 'dark' | 'light';

export interface Theme {
  scheme: Scheme;
  colors: Palette;
  shadows: { card: ShadowStyle; sheet: ShadowStyle };
  space: typeof space;
  radius: typeof radius;
  sizes: typeof sizes;
  type: typeof type;
}

export const themes: Readonly<Record<Scheme, Theme>> = {
  dark: { scheme: 'dark', colors: darkColors, shadows: darkShadows, space, radius, sizes, type },
  light: {
    scheme: 'light',
    colors: lightColors,
    shadows: lightShadows,
    space,
    radius,
    sizes,
    type,
  },
};
