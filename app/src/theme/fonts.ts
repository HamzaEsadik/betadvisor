import {
  Barlow_400Regular,
  Barlow_500Medium,
  Barlow_600SemiBold,
  Barlow_700Bold,
} from '@expo-google-fonts/barlow';
import {
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
} from '@expo-google-fonts/barlow-condensed';
import { useFonts } from 'expo-font';

import { fonts } from './tokens';

export const fontSources = {
  [fonts.sans400]: Barlow_400Regular,
  [fonts.sans500]: Barlow_500Medium,
  [fonts.sans600]: Barlow_600SemiBold,
  [fonts.sans700]: Barlow_700Bold,
  [fonts.display600]: BarlowCondensed_600SemiBold,
  [fonts.display700]: BarlowCondensed_700Bold,
};

/** Loads Barlow 400/500/600/700 and Barlow Condensed 600/700. */
export function useAppFonts(): [loaded: boolean, error: Error | null] {
  return useFonts(fontSources);
}
