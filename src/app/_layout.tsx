import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

import { BootError } from '@/components/boot-error';
import { Colors } from '@/constants/theme';
import { DbOpenError, openDatabase, type DbFailure } from '@/db/client';
import { startModelLifecycle } from '@/ai/model';
import { loadSettings } from '@/db/repo/settings';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings-store';

SplashScreen.preventAutoHideAsync();

type BootState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; failure: DbFailure };

async function startApp(): Promise<BootState> {
  try {
    const db = await openDatabase();
    useSettings.getState().hydrate(await loadSettings(db));
    return { status: 'ready' };
  } catch (error) {
    console.error(error);
    return { status: 'error', failure: error instanceof DbOpenError ? error.failure : 'unknown' };
  }
}

export default function RootLayout() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const t = useT();
  const [boot, setBoot] = useState<BootState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    startApp().then((state) => {
      setBoot(state);
      SplashScreen.hide();
    });
  }, [attempt]);

  useEffect(() => startModelLifecycle(), []);

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      {boot.status === 'error' && (
        <BootError failure={boot.failure} onRetry={() => setAttempt(attempt + 1)} />
      )}
      {boot.status === 'ready' && (
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            contentStyle: { backgroundColor: colors.background },
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ title: t('settings.title') }} />
          <Stack.Screen name="setup" options={{ title: t('setup.title') }} />
          <Stack.Screen name="record/[id]" options={{ title: t('records.edit') }} />
        </Stack>
      )}
    </ThemeProvider>
  );
}
