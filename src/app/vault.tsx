import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { getDb } from '@/db/client';
import { listRecords, type RecordItem, type RecordType } from '@/db/repo/records';
import { lockVault } from '@/features/vault/session';
import { requestVaultUnlock, type UnlockResult } from '@/features/vault/unlock';
import { useVaultUnlocked } from '@/features/vault/use-vault';
import { useTheme } from '@/hooks/use-theme';
import { useT, type MessageKey } from '@/lib/i18n';
import { formatDue } from '@/lib/time';

const TYPES: RecordType[] = ['note', 'promise'];

const GATE_KEY: Record<Exclude<UnlockResult, 'ok'>, MessageKey> = {
  cancelled: 'vault.cancelled',
  unavailable: 'vault.unavailable',
  needsBuild: 'vault.needsBuild',
};

export default function VaultScreen() {
  const t = useT();
  const theme = useTheme();
  const unlocked = useVaultUnlocked();
  const [type, setType] = useState<RecordType>('note');
  const [items, setItems] = useState<RecordItem[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [gate, setGate] = useState<UnlockResult | null>(null);

  useEffect(() => {
    if (!unlocked) setItems([]);
  }, [unlocked]);

  const load = useCallback(
    async (isActive: () => boolean) => {
      try {
        const next = await listRecords(getDb(), {
          type,
          query: '',
          personId: null,
          from: null,
          to: null,
          visibility: 'private',
        });
        if (!isActive()) return;
        setItems(next);
        setLoadFailed(false);
      } catch (error) {
        console.error(error);
        if (isActive()) setLoadFailed(true);
      }
    },
    [type],
  );

  useFocusEffect(
    useCallback(() => {
      if (!unlocked) return;
      let active = true;
      void load(() => active);
      return () => {
        active = false;
      };
    }, [load, unlocked]),
  );

  const unlock = async () => {
    const result = await requestVaultUnlock({ message: t('vault.unlockPrompt'), cancel: t('vault.cancel') });
    setGate(result === 'ok' ? null : result);
  };

  return (
    <ScrollView contentContainerStyle={styles.content} style={{ backgroundColor: theme.background }}>
      {!unlocked && (
        <View style={styles.section}>
          <ThemedText>{t('vault.locked')}</ThemedText>
          {gate && gate !== 'ok' && <ThemedText themeColor="danger">{t(GATE_KEY[gate])}</ThemedText>}
          <Pressable
            accessibilityRole="button"
            onPress={() => void unlock()}
            style={[styles.button, { backgroundColor: theme.accent }]}>
            <ThemedText type="smallBold" themeColor="onAccent">
              {t('vault.unlock')}
            </ThemedText>
          </Pressable>
        </View>
      )}

      {unlocked && (
        <View style={styles.section}>
          <View style={styles.row}>
            {TYPES.map((option) => {
              const selected = type === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => setType(option)}
                  style={[
                    styles.choice,
                    { borderColor: selected ? theme.accent : theme.border },
                    selected && { backgroundColor: theme.accent },
                  ]}>
                  <ThemedText type="smallBold" themeColor={selected ? 'onAccent' : 'text'}>
                    {t(option === 'note' ? 'records.kwento' : 'records.pramis')}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          {loadFailed && <ThemedText themeColor="danger">{t('records.loadFailed')}</ThemedText>}
          {!loadFailed && items.length === 0 && <ThemedText themeColor="textSecondary">{t('vault.empty')}</ThemedText>}
          {items.map((record) => (
            <Pressable
              key={record.id}
              accessibilityRole="button"
              onPress={() => router.push(`/record/${record.id}` as Href)}
              style={[styles.card, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="smallBold">{record.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {[record.personName, record.dueAt != null ? formatDue(record.dueAt) : null]
                  .filter((part) => part != null)
                  .join(' · ')}
              </ThemedText>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={lockVault}
            style={[styles.button, { borderColor: theme.border, borderWidth: 1 }]}>
            <ThemedText type="smallBold">{t('vault.lock')}</ThemedText>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  section: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  choice: {
    flex: 1,
    minHeight: MinTouchTarget,
    borderWidth: 1,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  button: {
    minHeight: MinTouchTarget,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
});
