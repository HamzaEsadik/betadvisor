import { useLocalSearchParams } from 'expo-router';

import { BetDetailScreen } from '@/src/features/signal/BetDetailScreen';

export default function SignalRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BetDetailScreen signalId={id} />;
}
