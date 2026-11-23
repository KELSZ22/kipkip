import { AppState } from 'react-native';

let unlocked = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function isVaultUnlocked(): boolean {
  return unlocked;
}

export function subscribeVault(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function markVaultUnlocked(): void {
  unlocked = true;
  emit();
}

export function lockVault(): void {
  if (!unlocked) return;
  unlocked = false;
  emit();
}

/** Private records hide again as soon as the app leaves the foreground. */
export function bindVaultLock(): () => void {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state !== 'active') lockVault();
  });
  return () => subscription.remove();
}
