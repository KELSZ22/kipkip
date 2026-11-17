import { SymbolView } from 'expo-symbols';
import { Link } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';

export function TabScreen({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  const t = useT();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="title" accessibilityRole="header" style={styles.title}>
            {title}
          </ThemedText>
          <Link href="/settings" asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('settings.open')}
              hitSlop={Spacing.one}
              style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}>
              <SymbolView
                name={{ ios: 'gearshape', android: 'settings', web: 'settings' }}
                size={24}
                tintColor={theme.textSecondary}
              />
            </Pressable>
          </Link>
        </View>
        {children}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
  },
  title: {
    flexShrink: 1,
  },
  settingsButton: {
    width: MinTouchTarget,
    height: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
