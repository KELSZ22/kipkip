import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { z } from 'zod';

import type { DraftRecord } from '@/ai/extract';
import { organizeEntry } from '@/ai/pipeline';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { getDb } from '@/db/client';
import { listPeople } from '@/db/repo/people';
import { saveCapture } from '@/db/repo/records';
import { resyncPromiseReminders } from '@/features/actions/reminders';
import { ConfirmCard } from '@/features/capture/confirm-card';
import { checkinQuestionKey } from '@/features/checkin/when';
import { useTheme } from '@/hooks/use-theme';
import { translate, useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings-store';

type RemovedDraft = { draft: DraftRecord; index: number };

const questionSchema = z.string().trim().min(1).max(300);

function askedQuestion(value: string | string[] | undefined, fallback: string): string {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = questionSchema.safeParse(raw);
  return parsed.success ? parsed.data : fallback;
}

export default function CheckinScreen() {
  const t = useT();
  const theme = useTheme();
  const params = useLocalSearchParams<{ question?: string | string[] }>();
  const tone = useSettings((state) => state.values.tone);
  const modelId = useSettings((state) => state.values.model_id);
  const question = askedQuestion(params.question, translate(tone, checkinQuestionKey(new Date())));
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<DraftRecord[] | null>(null);
  const [removed, setRemoved] = useState<RemovedDraft[]>([]);
  const [organizing, setOrganizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prepareFailed, setPrepareFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [showTitleError, setShowTitleError] = useState(false);

  const organize = async () => {
    const raw = text.trim();
    if (!raw || organizing) return;
    setOrganizing(true);
    setPrepareFailed(false);
    try {
      const people = await listPeople(getDb());
      setDrafts(await organizeEntry({ text: raw, people, now: new Date(), modelId }));
      setRemoved([]);
      setSaveFailed(false);
      setShowTitleError(false);
    } catch (error) {
      console.error(error);
      setPrepareFailed(true);
    } finally {
      setOrganizing(false);
    }
  };

  const accept = async () => {
    if (!drafts || saving) return;
    if (drafts.length === 0 || drafts.some((draft) => !draft.title.trim())) {
      setShowTitleError(true);
      return;
    }
    setSaving(true);
    setSaveFailed(false);
    try {
      await saveCapture(getDb(), { rawText: text, source: 'text', createdAt: Date.now(), drafts });
      try {
        await resyncPromiseReminders();
      } catch (error) {
        console.error(error);
      }
      router.back();
    } catch (error) {
      console.error(error);
      setSaveFailed(true);
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {drafts ? (
        <ConfirmCard
          rawText={text.trim()}
          drafts={drafts}
          canUndo={removed.length > 0}
          saving={saving}
          error={saveFailed}
          showTitleError={showTitleError}
          onChange={(next) => setDrafts((current) => current?.map((draft) => (draft.key === next.key ? next : draft)) ?? null)}
          onDelete={(key) => {
            setDrafts((current) => {
              if (!current) return current;
              const index = current.findIndex((draft) => draft.key === key);
              if (index < 0) return current;
              setRemoved((stack) => [{ draft: current[index], index }, ...stack]);
              return current.filter((draft) => draft.key !== key);
            });
          }}
          onUndo={() => {
            const latest = removed[0];
            if (!latest) return;
            setRemoved((stack) => stack.slice(1));
            setDrafts((current) => {
              const next = [...(current ?? [])];
              next.splice(Math.min(latest.index, next.length), 0, latest.draft);
              return next;
            });
          }}
          onEditText={() => {
            setDrafts(null);
            setRemoved([]);
            setSaveFailed(false);
          }}
          onAccept={() => void accept()}
        />
      ) : (
        <View style={styles.composer}>
          <ThemedText type="subtitle">{question}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('checkin.hint')}
          </ThemedText>
          {prepareFailed && <ThemedText themeColor="danger">{t('capture.prepareFailed')}</ThemedText>}
          <TextInput
            accessibilityLabel={question}
            value={text}
            onChangeText={setText}
            placeholder={t('checkin.placeholder')}
            placeholderTextColor={theme.textSecondary}
            multiline
            textAlignVertical="top"
            autoCapitalize="sentences"
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
          />
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              style={[styles.skip, { borderColor: theme.border }]}>
              <ThemedText type="smallBold">{t('checkin.skip')}</ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: text.trim().length === 0 || organizing }}
              disabled={text.trim().length === 0 || organizing}
              onPress={() => void organize()}
              style={[
                styles.submit,
                { backgroundColor: theme.accent },
                (text.trim().length === 0 || organizing) && styles.disabled,
              ]}>
              <ThemedText type="smallBold" themeColor="onAccent">
                {organizing ? t('capture.organizing') : t('capture.submit')}
              </ThemedText>
            </Pressable>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  composer: {
    flex: 1,
    gap: Spacing.two,
    padding: Spacing.three,
  },
  input: {
    minHeight: 160,
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    fontSize: 18,
    lineHeight: 26,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  skip: {
    minHeight: MinTouchTarget,
    borderWidth: 1,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  submit: {
    flex: 1,
    minHeight: MinTouchTarget,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  disabled: {
    opacity: 0.4,
  },
});
