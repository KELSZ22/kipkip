import { useEffect, useState } from 'react';

import { isVaultUnlocked, subscribeVault } from '@/features/vault/session';

export function useVaultUnlocked(): boolean {
  const [unlocked, setUnlocked] = useState(isVaultUnlocked);
  useEffect(() => subscribeVault(() => setUnlocked(isVaultUnlocked())), []);
  return unlocked;
}
