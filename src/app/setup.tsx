import { router } from 'expo-router';
import * as Device from 'expo-device';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import {
  ChecksumError,
  isUnmeteredNetwork,
  modelStatus,
  openDownload,
  persistResume,
  verifyDownload,
  type ModelDownload,
} from '@/ai/model';
import { chooseTier, formatBytes, modelForTier } from '@/ai/models';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { getDb } from '@/db/client';
import type { SettingKey, Settings } from '@/db/repo/settings';
import { useTheme } from '@/hooks/use-theme';
import { useT, type MessageKey } from '@/lib/i18n';
import { useSettings } from '@/lib/settings-store';
import { formatTimeOfDay, shiftTimeOfDay } from '@/lib/time';
import { TONES } from '@/lib/tone';

type Phase = 'missing' | 'downloading' | 'paused' | 'checking' | 'ready';
type SetupError = 'wifi' | 'checksum' | 'failed' | null;

export default function SetupScreen() {
  const theme = useTheme();
  const t = useT();
  const values = useSettings((state) => state.values);
  const update = useSettings((state) => state.update);
  const model = modelForTier(chooseTier(Device.totalMemory));
  const downloadRef = useRef<ModelDownload | null>(null);
  const [draftName, setDraftName] = useState(values.companion_name);
  const [phase, setPhase] = useState<Phase>(modelStatus(model));
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<SetupError>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  const save = async <K extends SettingKey>(key: K, value: Settings[K]): Promise<boolean> => {
    try {
      await update(getDb(), key, value);
      setSaveFailed(false);
      return true;
    } catch (cause) {
      console.error(cause);
      setSaveFailed(true);
      return false;
    }
  };

  const commitName = async () => {
    const name = draftName.trim();
    if (!name) {
      setDraftName(values.companion_name);
      return;
    }
    setDraftName(name);
    await save('companion_name', name);
  };

  const download = async () => {
    if (values.wifi_only === 'yes' && !(await isUnmeteredNetwork())) {
      setError('wifi');
      return;
    }
    setError(null);
    setPhase('downloading');
    setProgress(0);
    try {
      const handle = openDownload(model, ({ bytesWritten, totalBytes }) => {
        setProgress(totalBytes > 0 ? bytesWritten / totalBytes : 0);
      });
      downloadRef.current = handle;
      const file = await handle.run();
      if (!file) {
        persistResume(handle.task);
        setPhase('paused');
        return;
      }
      setPhase('checking');
      await verifyDownload(model, file);
      await save('model_id', model.id);
      setPhase('ready');
    } catch (cause) {
      console.error(cause);
      setError(cause instanceof ChecksumError ? 'checksum' : 'failed');
      setPhase(modelStatus(model));
    } finally {
      downloadRef.current = null;
    }
  };

  const pause = async () => {
    const handle = downloadRef.current;
    if (!handle) return;
    await handle.task.pauseAsync();
  };

  const finish = async () => {
    if (!(await save('setup_done', 'yes'))) return;
    if (router.canGoBack()) router.back();
    else router.replace('/today');
  };

  const percent = Math.round(progress * 100);
  const busy = phase === 'downloading' || phase === 'checking';

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
      style={{ backgroundColor: theme.background }}>
      <ThemedText>{t('setup.intro')}</ThemedText>
      {saveFailed && <ThemedText themeColor="danger">{t('settings.saveFailed')}</ThemedText>}

      <View style={styles.section}>
        <ThemedText type="smallBold" nativeID="setup-name">
          {t('settings.companion')}
        </ThemedText>
        <TextInput
          accessibilityLabelledBy="setup-name"
          value={draftName}
          onChangeText={setDraftName}
          onEndEditing={() => void commitName()}
          maxLength={30}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
        />
      </View>

      <View style={styles.section}>
        <ThemedText type="smallBold">{t('settings.tone')}</ThemedText>
        <View accessibilityRole="radiogroup" style={styles.row}>
          {TONES.map((tone) => {
            const selected = values.tone === tone;
            return (
              <Pressable
                key={tone}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => void save('tone', tone)}
                style={[styles.option, { borderColor: selected ? theme.accent : theme.border }, selected && { backgroundColor: theme.accent }]}>
                <ThemedText type="smallBold" themeColor={selected ? 'onAccent' : 'text'}>
                  {t(`settings.tone.${tone}` as MessageKey)}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText type="smallBold">{t('settings.checkin')}</ThemedText>
        <ThemedText type="subtitle">{formatTimeOfDay(values.checkin_time)}</ThemedText>
        <TimeStepper
          label={t('settings.checkin.hour')}
          decreaseLabel={t('settings.checkin.hourEarlier')}
          increaseLabel={t('settings.checkin.hourLater')}
          onShift={(direction) => void save('checkin_time', shiftTimeOfDay(values.checkin_time, direction * 60))}
        />
        <TimeStepper
          label={t('settings.checkin.minute')}
          decreaseLabel={t('settings.checkin.minutesEarlier')}
          increaseLabel={t('settings.checkin.minutesLater')}
          onShift={(direction) => void save('checkin_time', shiftTimeOfDay(values.checkin_time, direction * 5))}
        />
      </View>

      <View style={styles.section}>
        <ThemedText type="smallBold">{t('setup.modelTitle')}</ThemedText>
        <ThemedText>
          {t('setup.modelBody', { tier: t(`setup.tier.${model.tier}`), size: formatBytes(model.bytes) })}
        </ThemedText>
        <View style={styles.switchRow}>
          <ThemedText style={styles.flex}>{t('setup.wifiOnly')}</ThemedText>
          <Switch
            accessibilityLabel={t('setup.wifiOnly')}
            value={values.wifi_only === 'yes'}
            onValueChange={(enabled) => void save('wifi_only', enabled ? 'yes' : 'no')}
            trackColor={{ true: theme.accent, false: theme.border }}
          />
        </View>
        {phase === 'ready' && <ThemedText>{t('setup.ready')}</ThemedText>}
        {error === 'wifi' && <ThemedText themeColor="danger">{t('setup.needWifi')}</ThemedText>}
        {error === 'checksum' && <ThemedText themeColor="danger">{t('setup.checksum')}</ThemedText>}
        {error === 'failed' && <ThemedText themeColor="danger">{t('setup.failed')}</ThemedText>}
        {(phase === 'downloading' || phase === 'checking') && (
          <View>
            <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
              <View style={[styles.fill, { backgroundColor: theme.accent, width: `${percent}%` }]} />
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {phase === 'checking' ? t('setup.checking') : `${percent}%`}
            </ThemedText>
          </View>
        )}
        {phase === 'downloading' ? (
          <Pressable accessibilityRole="button" onPress={() => void pause()} style={[styles.option, { borderColor: theme.border }]}>
            <ThemedText type="smallBold">{t('setup.pause')}</ThemedText>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            disabled={busy || phase === 'ready'}
            onPress={() => void download()}
            style={[styles.submit, { backgroundColor: theme.accent }, (busy || phase === 'ready') && styles.disabled]}>
            <ThemedText type="smallBold" themeColor="onAccent">
              {phase === 'paused' ? t('setup.resume') : t('setup.download')}
            </ThemedText>
          </Pressable>
        )}
        <ThemedText type="small" themeColor="textSecondary">
          {t('setup.rulesHint')}
        </ThemedText>
      </View>

      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void finish()} style={[styles.submit, { backgroundColor: theme.accent }, busy && styles.disabled]}>
        <ThemedText type="smallBold" themeColor="onAccent">
          {phase === 'ready' ? t('setup.continue') : t('setup.skip')}
        </ThemedText>
      </Pressable>
    </ScrollView>
  );
}

function TimeStepper({
  label,
  decreaseLabel,
  increaseLabel,
  onShift,
}: {
  label: string;
  decreaseLabel: string;
  increaseLabel: string;
  onShift: (direction: 1 | -1) => void;
}) {
  const theme = useTheme();
  const buttonStyle = [styles.stepButton, { borderColor: theme.border }];

  return (
    <View style={styles.stepper}>
      <ThemedText style={styles.flex}>{label}</ThemedText>
      <Pressable accessibilityRole="button" accessibilityLabel={decreaseLabel} onPress={() => onShift(-1)} style={buttonStyle}>
        <ThemedText type="subtitle">−</ThemedText>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={increaseLabel} onPress={() => onShift(1)} style={buttonStyle}>
        <ThemedText type="subtitle">+</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  input: {
    minHeight: MinTouchTarget,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  option: {
    flex: 1,
    minHeight: MinTouchTarget,
    borderWidth: 1,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  submit: {
    minHeight: MinTouchTarget,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  disabled: {
    opacity: 0.4,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  stepButton: {
    width: 64,
    height: MinTouchTarget,
    borderWidth: 1,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: 8,
  },
});
