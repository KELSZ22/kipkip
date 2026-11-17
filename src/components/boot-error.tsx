import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import type { DbFailure } from '@/db/client';
import { useTheme } from '@/hooks/use-theme';
import { useT, type MessageKey } from '@/lib/i18n';

const FAILURE_MESSAGES: Record<DbFailure, MessageKey> = {
  locked: 'boot.error.locked',
  unencrypted: 'boot.error.unencrypted',
  newer: 'boot.error.newer',
  unknown: 'boot.error.unknown',
};

export function BootError({ failure, onRetry }: { failure: DbFailure; onRetry: () => void }) {
  const theme = useTheme();
  const t = useT();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.content}>
        <ThemedText type="title" accessibilityRole="header">
          {t('boot.error.title')}
        </ThemedText>
        <ThemedText themeColor="textSecondary">{t(FAILURE_MESSAGES[failure])}</ThemedText>
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: theme.accent },
            pressed && styles.pressed,
          ]}>
          <ThemedText type="smallBold" themeColor="onAccent">
            {t('boot.error.retry')}
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  button: {
    minHeight: MinTouchTarget,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  pressed: {
    opacity: 0.8,
  },
});
