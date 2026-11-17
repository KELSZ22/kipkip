import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { extractByRules, type DraftRecord } from '@/ai/extract';
import { TabScreen } from '@/components/tab-screen';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { getDb } from '@/db/client';
import { listPeople } from '@/db/repo/people';
import { saveCapture } from '@/db/repo/records';
import { ConfirmCard } from '@/features/capture/confirm-card';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';

type RemovedDraft = { draft: DraftRecord; index: number };

export default function CaptureScreen() {
  const t = useT();
  const theme = useTheme();
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<DraftRecord[] | null>(null);
  const [removed, setRemoved] = useState<RemovedDraft[]>([]);
  const [organizing, setOrganizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prepareFailed, setPrepareFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [showTitleError, setShowTitleError] = useState(false);
  const [saved, setSaved] = useState(false);

  const organize = async () => {
    const raw = text.trim();
    if (!raw || organizing) return;
    setOrganizing(true);
    setPrepareFailed(false);
    setSaved(false);
    try {
      const people = await listPeople(getDb());
      setDrafts(extractByRules({ text: raw, people, now: new Date() }));
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
      setText('');
      setDrafts(null);
      setRemoved([]);
      setSaved(true);
    } catch (error) {
      console.error(error);
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const deleteDraft = (key: string) => {
    setDrafts((current) => {
      if (!current) return current;
      const index = current.findIndex((draft) => draft.key === key);
      if (index < 0) return current;
      setRemoved((stack) => [{ draft: current[index], index }, ...stack]);
      return current.filter((draft) => draft.key !== key);
    });
  };

  const undo = () => {
    const latest = removed[0];
    if (!latest) return;
    setRemoved((stack) => stack.slice(1));
    setDrafts((current) => {
      const next = [...(current ?? [])];
      next.splice(Math.min(latest.index, next.length), 0, latest.draft);
      return next;
    });
  };

  return (
    <TabScreen title={t('capture.title')}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {drafts ? (
          <ConfirmCard
            rawText={text.trim()}
            drafts={drafts}
            canUndo={removed.length > 0}
            saving={saving}
            error={saveFailed}
            showTitleError={showTitleError}
            onChange={(next) => setDrafts((current) => current?.map((draft) => (draft.key === next.key ? next : draft)) ?? null)}
            onDelete={deleteDraft}
            onUndo={undo}
            onEditText={() => {
              setDrafts(null);
              setRemoved([]);
              setSaveFailed(false);
            }}
            onAccept={() => void accept()}
          />
        ) : (
          <View style={styles.composer}>
            {saved && <ThemedText>{t('capture.saved')}</ThemedText>}
            {prepareFailed && <ThemedText themeColor="danger">{t('capture.prepareFailed')}</ThemedText>}
            <TextInput
              accessibilityLabel={t('capture.title')}
              value={text}
              onChangeText={(value) => {
                setText(value);
                setSaved(false);
              }}
              placeholder={t('capture.placeholder')}
              placeholderTextColor={theme.textSecondary}
              multiline
              textAlignVertical="top"
              autoCapitalize="sentences"
              style={[
                styles.input,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement },
              ]}
            />
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('capture.voiceLater')}
                accessibilityState={{ disabled: true }}
                disabled
                style={[styles.mic, { borderColor: theme.border }]}>
                <SymbolView name={{ ios: 'mic', android: 'mic', web: 'mic' }} size={22} tintColor={theme.textSecondary} />
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
                  {t('capture.submit')}
                </ThemedText>
              </Pressable>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {t('capture.voiceLater')}
            </ThemedText>
          </View>
        )}
      </KeyboardAvoidingView>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  composer: {
    flex: 1,
    gap: Spacing.two,
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
  mic: {
    width: MinTouchTarget,
    height: MinTouchTarget,
    borderWidth: 1,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.5,
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
