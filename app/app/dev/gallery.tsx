import { Redirect } from 'expo-router';

import { Gallery } from '@/src/features/dev/Gallery';

/** Component gallery for the Part 17 emulator check. Dev builds only. */
export default function GalleryRoute() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Gallery />;
}
