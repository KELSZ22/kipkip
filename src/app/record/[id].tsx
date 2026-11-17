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
  updateRecord,
  RECORD_STATUSES,
  type RecordStatus,
} from '@/db/repo/records';
import { RecordFields } from '@/features/records/record-fields';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; draft: DraftRecord; recordStatus: RecordStatus }
  | { status: 'failed' };

function recordId(param: string | string[] | undefined): number {
  const raw = Array.isArray(param) ? param[0] : param;
  return Number(raw);
}

export default function RecordScreen() {
  const t = useT();
  const theme = useTheme();
  const params = useLocalSearchParams<{ id: string }>();
  const id = recordId(params.id);
  const validId = Number.isInteger(id) && id > 0;
  const [loadedFor, setLoadedFor] = useState<number | null>(null);
  const [load, setLoad] = useState<Exclude<LoadState, { status: 'loading' }>>({ status: 'missing' });
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
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
        setLoad({
          status: 'ready',
          recordStatus: record.status,
          draft: {
            key: 'edit',
            type: record.type,
            title: record.title,
            body: record.body,
            dueAt: record.dueAt,
            personId: record.personId,
            personName: record.personName,
          },
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
  }, [id, validId]);

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
      router.back();
    } catch (error) {
      console.error(error);
      setSaveFailed(true);
      setSaving(false);
    }
  };

  const remove = () => {
    Alert.alert(t('records.deleteConfirm'), undefined, [
      { text: t('records.deleteNo'), style: 'cancel' },
      {
        text: t('records.deleteYes'),
        style: 'destructive',
        onPress: () => {
          void deleteRecord(getDb(), id)
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
      {view.status === 'ready' && (
        <View style={styles.form}>
          {saveFailed && <ThemedText themeColor="danger">{t('records.saveFailed')}</ThemedText>}
          {!view.draft.title.trim() && <ThemedText themeColor="danger">{t('capture.needTitle')}</ThemedText>}
          <RecordFields
            value={view.draft}
            onChange={(draft) => setLoad({ status: 'ready', draft, recordStatus: view.recordStatus })}
          />
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
