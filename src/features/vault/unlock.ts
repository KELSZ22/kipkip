import { markVaultUnlocked } from '@/features/vault/session';

export type UnlockResult = 'ok' | 'cancelled' | 'unavailable' | 'needsBuild';

/**
 * Fingerprint, face, or the phone PIN. Kipkip does not keep a second password.
 * The native module is loaded only when the user asks to unlock, so the rest of the app
 * still opens on a build from before this library was added.
 */
export async function requestVaultUnlock(prompt: { message: string; cancel: string }): Promise<UnlockResult> {
  let LocalAuthentication: typeof import('expo-local-authentication');
  try {
    LocalAuthentication = await import('expo-local-authentication');
  } catch (error) {
    console.error(error);
    return 'needsBuild';
  }

  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    if (level === LocalAuthentication.SecurityLevel.NONE) return 'unavailable';
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: prompt.message,
      cancelLabel: prompt.cancel,
      disableDeviceFallback: false,
    });
    if (!result.success) return 'cancelled';
    markVaultUnlocked();
    return 'ok';
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : '';
    if (message.includes('native module') || message.includes('ExpoLocalAuthentication')) return 'needsBuild';
    return 'unavailable';
  }
}
