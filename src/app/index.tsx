import { Redirect } from 'expo-router';

import { useSettings } from '@/lib/settings-store';

export default function Index() {
  const setupDone = useSettings((state) => state.values.setup_done);
  return <Redirect href={setupDone === 'yes' ? '/today' : '/setup'} />;
}
