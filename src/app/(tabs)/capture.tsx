import { SymbolView } from 'expo-symbols';
import { lazy, Suspense, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { DraftRecord } from '@/ai/extract';
import { organizeEntry } from '@/ai/pipeline';
import type { SpeechStatus } from '@/ai/speech';
import { mergeTranscript } from '@/ai/transcript';
import { TabScreen } from '@/components/tab-screen';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { getDb } from '@/db/client';
import { listPeople } from '@/db/repo/people';
import { saveCapture } from '@/db/repo/records';
import type { EntrySource } from '@/db/repo/entries';
import { ConfirmCard } from '@/features/capture/confirm-card';
import { useVoiceCapture, type VoiceError, type VoicePhase } from '@/features/capture/use-voice';
import { resyncPromiseReminders } from '@/features/actions/reminders';
import { useTheme } from '@/hooks/use-theme';
import { useT, type MessageKey, type MessageParams } from '@/lib/i18n';
import { useSettings } from '@/lib/settings-store';

type RemovedDraft = { draft: DraftRecord; index: number };

const VoiceRecorder = lazy(() =>
  import('@/features/capture/voice-recorder').then((module) => ({ default: module.VoiceRecorder })),
);

export default function CaptureScreen() {
  const t = useT();
  const theme = useTheme();
  const modelId = useSettings((state) => state.values.model_id);
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<DraftRecord[] | null>(null);
  const [removed, setRemoved] = useState<RemovedDraft[]>([]);
  const [organizing, setOrganizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prepareFailed, setPrepareFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [showTitleError, setShowTitleError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [source, setSource] = useState<EntrySource>('text');
  const voice = useVoiceCapture((transcript) => {
    setText((current) => mergeTranscript(current, transcript));
    setSource('voice');
    setSaved(false);
  });
  const voiceBusy = voice.phase === 'recording' || voice.phase === 'transcribing';

  const organize = async () => {
    const raw = text.trim();
    if (!raw || organizing) return;
    setOrganizing(true);
    setPrepareFailed(false);
    setSaved(false);
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
      await saveCapture(getDb(), { rawText: text, source, createdAt: Date.now(), drafts });
      setText('');
      setSource('text');
      setDrafts(null);
      setRemoved([]);
      setSaved(true);
      try {
        await resyncPromiseReminders();
      } catch (error) {
        console.error(error);
      }
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
              value={voiceBusy && voice.partial ? mergeTranscript(text, voice.partial) : text}
              onChangeText={(value) => {
                setText(value);
                setSaved(false);
                if (!value.trim()) setSource('text');
              }}
              editable={!voiceBusy}
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
                accessibilityLabel={voice.phase === 'recording' ? t('capture.voiceStop') : t('capture.voice')}
                accessibilityState={{ disabled: false, selected: voice.phase === 'recording' }}
                onPress={voice.onPress}
                style={[
                  styles.mic,
                  { borderColor: theme.border },
                  voice.phase === 'recording' && { backgroundColor: theme.accent, borderColor: theme.accent },
                ]}>
                <SymbolView
                  name={{ ios: 'mic', android: 'mic', web: 'mic' }}
                  size={22}
                  tintColor={voice.phase === 'recording' ? theme.onAccent : theme.text}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: text.trim().length === 0 || organizing || voiceBusy }}
                disabled={text.trim().length === 0 || organizing || voiceBusy}
                onPress={() => void organize()}
                style={[
                  styles.submit,
                  { backgroundColor: theme.accent },
                  (text.trim().length === 0 || organizing || voiceBusy) && styles.disabled,
                ]}>
                <ThemedText type="smallBold" themeColor="onAccent">
                  {organizing ? t('capture.organizing') : t('capture.submit')}
                </ThemedText>
              </Pressable>
            </View>
            <ThemedText type="small" themeColor={voice.error ? 'danger' : 'textSecondary'}>
              {voiceMessage(t, voice.phase, voice.error, voice.model, voice.progress, voice.modelSize)}
            </ThemedText>
            {voice.armed ? (
              <Suspense fallback={null}>
                <VoiceRecorder
                  tone={voice.tone}
                  stopSignal={voice.stopSignal}
                  onPartial={voice.setPartial}
                  onSpoken={voice.acceptSpoken}
                  onFailed={voice.fail}
                  onTranscribing={voice.markTranscribing}
                />
              </Suspense>
            ) : null}
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

function voiceMessage(
  t: (key: MessageKey, params?: MessageParams) => string,
  phase: VoicePhase,
  error: VoiceError,
  model: SpeechStatus,
  progress: number,
  size: string,
): string {
  if (phase === 'recording') return t('capture.listening');
  if (phase === 'transcribing') return t('capture.transcribing');
  if (phase === 'checking') return t('capture.voiceChecking');
  if (phase === 'downloading') return t('capture.voiceDownloading', { percent: Math.round(progress * 100) });
  if (error === 'permission') return t('capture.voicePermission');
  if (error === 'empty') return t('capture.voiceEmpty');
  if (error === 'failed') return t('capture.voiceFailed');
  if (error === 'needsBuild') return t('capture.voiceNeedsBuild');
  if (error === 'wifi') return t('capture.voiceWifi');
  if (error === 'checksum' || error === 'download') return t('capture.voiceDownloadFailed');
  if (model === 'paused') return t('capture.voicePaused');
  if (model === 'missing') return t('capture.voiceNeedModel', { size });
  return t('capture.voiceHint');
}
