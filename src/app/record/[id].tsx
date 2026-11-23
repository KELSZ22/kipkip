import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { DraftRecord } from '@/ai/extract';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { getDb } from '@/db/client';
import {
  deleteRecord,
  getRecord,
  setRecordPrivate,
  updateRecord,
  RECORD_STATUSES,
  type RecordItem,
  type RecordStatus,
} from '@/db/repo/records';
import { PrivateSwitch } from '@/features/vault/private-switch';
import { requestVaultUnlock, type UnlockResult } from '@/features/vault/unlock';
import { useVaultUnlocked } from '@/features/vault/use-vault';
import { QuickActions } from '@/features/actions/quick-actions';
import { resyncPromiseReminders } from '@/features/actions/reminders';
import { RecordFields } from '@/features/records/record-fields';
import { useTheme } from '@/hooks/use-theme';
import { useT, type MessageKey } from '@/lib/i18n';

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; draft: DraftRecord; recordStatus: RecordStatus; saved: RecordItem }
  | { status: 'failed' };

const GATE_KEY: Record<Exclude<UnlockResult, 'ok'>, MessageKey> = {
  cancelled: 'vault.cancelled',
  unavailable: 'vault.unavailable',
  needsBuild: 'vault.needsBuild',
};

function recordId(param: string | string[] | undefined): number {
  const raw = Array.isArray(param) ? param[0] : param;
  return Number(raw);
}

export default function RecordScreen() {
  const t = useT();
  const theme = useTheme();
  const unlocked = useVaultUnlocked();
  const params = useLocalSearchParams<{ id: string }>();
  const id = recordId(params.id);
  const validId = Number.isInteger(id) && id > 0;
  const [loadedFor, setLoadedFor] = useState<number | null>(null);
  const [load, setLoad] = useState<Exclude<LoadState, { status: 'loading' }>>({ status: 'missing' });
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [gate, setGate] = useState<UnlockResult | null>(null);
  const view: LoadState = !validId ? { status: 'missing' } : loadedFor === id ? load : { status: 'loading' };

  useEffect(() => {
    if (!validId) return;
    let active = true;
    getRecord(getDb(), id)
      .then((record) => {
        if (!active) return;
        setLoadedFor(id);
        if (!record) {
          setLoad({ status: 'missing' });
          return;
        }
        setLoad((current) => {
          if (current.status === 'ready' && current.saved.id === record.id) {
            return { ...current, saved: record };
          }
          return {
            status: 'ready',
            recordStatus: record.status,
            saved: record,
            draft: {
              key: 'edit',
              type: record.type,
              title: record.title,
              body: record.body,
              dueAt: record.dueAt,
              personId: record.personId,
              personName: record.personName,
            },
          };
        });
      })
      .catch((error: unknown) => {
        console.error(error);
        if (!active) return;
        setLoadedFor(id);
        setLoad({ status: 'failed' });
      });
    return () => {
      active = false;
    };
  }, [id, reload, validId]);

  const save = async () => {
    if (view.status !== 'ready' || saving || !view.draft.title.trim()) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      await updateRecord(
        getDb(),
        id,
        { ...view.draft, status: view.draft.type === 'promise' ? view.recordStatus : 'open' },
        Date.now(),
      );
      await resyncPromiseReminders().catch((error: unknown) => console.error(error));
      router.back();
    } catch (error) {
      console.error(error);
      setSaveFailed(true);
      setSaving(false);
    }
  };

  const togglePrivate = async (isPrivate: boolean) => {
    if (view.status !== 'ready' || saving) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      await setRecordPrivate(getDb(), id, isPrivate, Date.now());
      await resyncPromiseReminders().catch((error: unknown) => console.error(error));
      setReload((current) => current + 1);
    } catch (error) {
      console.error(error);
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const unlock = async () => {
    const result = await requestVaultUnlock({ message: t('vault.unlockPrompt'), cancel: t('vault.cancel') });
    setGate(result === 'ok' ? null : result);
  };

  const hidden = view.status === 'ready' && view.saved.isPrivate && !unlocked;

  const remove = () => {
    Alert.alert(t('records.deleteConfirm'), undefined, [
      { text: t('records.deleteNo'), style: 'cancel' },
      {
        text: t('records.deleteYes'),
        style: 'destructive',
        onPress: () => {
          void deleteRecord(getDb(), id)
            .then(() => resyncPromiseReminders().catch((error: unknown) => console.error(error)))
            .then(() => router.back())
            .catch((error: unknown) => {
              console.error(error);
              setSaveFailed(true);
            });
        },
      },
    ]);
  };

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
      style={{ backgroundColor: theme.background }}>
      <Stack.Screen options={{ title: t('records.edit') }} />
      {view.status === 'missing' && <ThemedText>{t('records.missing')}</ThemedText>}
      {view.status === 'failed' && <ThemedText themeColor="danger">{t('records.loadFailed')}</ThemedText>}
      {hidden && (
        <View style={styles.form}>
          <ThemedText>{t('vault.locked')}</ThemedText>
          {gate && gate !== 'ok' && <ThemedText themeColor="danger">{t(GATE_KEY[gate])}</ThemedText>}
          <Pressable
            accessibilityRole="button"
            onPress={() => void unlock()}
            style={[styles.primary, { backgroundColor: theme.accent }]}>
            <ThemedText type="smallBold" themeColor="onAccent">
              {t('vault.unlock')}
            </ThemedText>
          </Pressable>
        </View>
      )}
      {view.status === 'ready' && !hidden && (
        <View style={styles.form}>
          {saveFailed && <ThemedText themeColor="danger">{t('records.saveFailed')}</ThemedText>}
          <PrivateSwitch
            value={view.saved.isPrivate}
            disabled={saving}
            onChange={(next) => void togglePrivate(next)}
          />
          <ThemedText type="small" themeColor="textSecondary">
            {t('vault.privateHint')}
          </ThemedText>
          {!view.draft.title.trim() && <ThemedText themeColor="danger">{t('capture.needTitle')}</ThemedText>}
          <RecordFields
            value={view.draft}
            onChange={(draft) => setLoad({ status: 'ready', draft, recordStatus: view.recordStatus, saved: view.saved })}
          />
          <QuickActions record={view.saved} onUpdated={() => setReload((current) => current + 1)} />
          {view.draft.type === 'promise' && (
            <View accessibilityRole="radiogroup" style={styles.row}>
              {RECORD_STATUSES.map((status) => {
                const selected = view.recordStatus === status;
                return (
                  <Pressable
                    key={status}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => setLoad({ ...view, recordStatus: status })}
                    style={[
                      styles.choice,
                      { borderColor: selected ? theme.accent : theme.border },
                      selected && { backgroundColor: theme.accent },
                    ]}>
                    <ThemedText type="smallBold" themeColor={selected ? 'onAccent' : 'text'}>
                      {t(`records.status.${status}`)}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: saving || !view.draft.title.trim() }}
            disabled={saving || !view.draft.title.trim()}
            onPress={() => void save()}
            style={[
              styles.primary,
              { backgroundColor: theme.accent },
              (saving || !view.draft.title.trim()) && styles.disabled,
            ]}>
            <ThemedText type="smallBold" themeColor="onAccent">
              {t('records.save')}
            </ThemedText>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={remove} style={styles.textButton}>
            <ThemedText type="smallBold" themeColor="danger">
              {t('records.delete')}
            </ThemedText>
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
  form: {
    gap: Spacing.three,
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
    paddingHorizontal: Spacing.one,
  },
  primary: {
    minHeight: MinTouchTarget,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textButton: {
    minHeight: MinTouchTarget,
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
});
