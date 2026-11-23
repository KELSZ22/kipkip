import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { getDb, getDbInfo } from '@/db/client';
import type { SettingKey, Settings } from '@/db/repo/settings';
import { resyncPromiseReminders } from '@/features/actions/reminders';
import { exportRecords } from '@/features/vault/run-export';
import type { ShareResult } from '@/features/vault/share-export';
import { requestVaultUnlock } from '@/features/vault/unlock';
import { syncCheckin } from '@/features/checkin/schedule';
import { useTheme } from '@/hooks/use-theme';
import { useT, type MessageKey } from '@/lib/i18n';
import { useSettings } from '@/lib/settings-store';
import { formatTimeOfDay, shiftTimeOfDay } from '@/lib/time';
import { TONES } from '@/lib/tone';

const EXPORT_NOTE: Record<Exclude<ShareResult, 'shared'>, MessageKey> = {
  empty: 'export.empty',
  unavailable: 'export.unavailable',
  failed: 'export.failed',
  needsBuild: 'export.needsBuild',
};

export default function SettingsScreen() {
  const theme = useTheme();
  const t = useT();
  const values = useSettings((state) => state.values);
  const update = useSettings((state) => state.update);
  const [draftName, setDraftName] = useState(values.companion_name);
  const [saveFailed, setSaveFailed] = useState(false);
  const [exportNote, setExportNote] = useState<MessageKey | null>(null);
  const [exporting, setExporting] = useState(false);
  const dbInfo = getDbInfo();

  const save = async <K extends SettingKey>(key: K, value: Settings[K]) => {
    try {
      await update(getDb(), key, value);
      setSaveFailed(false);
    } catch (error) {
      console.error(error);
      setSaveFailed(true);
      return;
    }
    if (key === 'tone' || key === 'companion_name') {
      await resyncPromiseReminders().catch((error: unknown) => console.error(error));
    }
    if (key === 'tone' || key === 'companion_name' || key === 'checkin_time' || key === 'checkin_enabled') {
      await syncCheckin().catch((error: unknown) => console.error(error));
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

  const shiftCheckin = (minutes: number) =>
    save('checkin_time', shiftTimeOfDay(values.checkin_time, minutes));

  const share = async (isPrivate: boolean) => {
    if (exporting) return;
    setExporting(true);
    setExportNote(null);
    try {
      if (isPrivate) {
        const gate = await requestVaultUnlock({ message: t('vault.unlockPrompt'), cancel: t('vault.cancel') });
        if (gate !== 'ok') {
          setExportNote(gate === 'needsBuild' ? 'vault.needsBuild' : gate === 'unavailable' ? 'vault.unavailable' : 'vault.cancelled');
          return;
        }
      }
      const result: ShareResult = await exportRecords({
        db: getDb(),
        isPrivate,
        dialogTitle: t('export.dialog'),
      });
      if (result !== 'shared') setExportNote(EXPORT_NOTE[result]);
    } catch (error) {
      console.error(error);
      setExportNote('export.failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
      style={{ backgroundColor: theme.background }}>
      {saveFailed && <ThemedText themeColor="danger">{t('settings.saveFailed')}</ThemedText>}

      <View style={styles.section}>
        <ThemedText type="smallBold" nativeID="companion-label">
          {t('settings.companion')}
        </ThemedText>
        <TextInput
          accessibilityLabelledBy="companion-label"
          value={draftName}
          onChangeText={setDraftName}
          onEndEditing={commitName}
          maxLength={30}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          style={[
            styles.input,
            {
              color: theme.text,
              borderColor: theme.border,
              backgroundColor: theme.backgroundElement,
            },
          ]}
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
                onPress={() => save('tone', tone)}
                style={[
                  styles.option,
                  { borderColor: selected ? theme.accent : theme.border },
                  selected && { backgroundColor: theme.accent },
                ]}>
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
          onShift={(direction) => shiftCheckin(direction * 60)}
        />
        <TimeStepper
          label={t('settings.checkin.minute')}
          decreaseLabel={t('settings.checkin.minutesEarlier')}
          increaseLabel={t('settings.checkin.minutesLater')}
          onShift={(direction) => shiftCheckin(direction * 5)}
        />
        <ThemedText type="small" themeColor="textSecondary">
          {t('settings.checkin.hint')}
        </ThemedText>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: values.checkin_enabled === 'yes' }}
          onPress={() => save('checkin_enabled', values.checkin_enabled === 'yes' ? 'no' : 'yes')}
          style={[
            styles.option,
            { borderColor: values.checkin_enabled === 'yes' ? theme.accent : theme.border },
            values.checkin_enabled === 'yes' && { backgroundColor: theme.accent },
          ]}>
          <ThemedText type="smallBold" themeColor={values.checkin_enabled === 'yes' ? 'onAccent' : 'text'}>
            {t(values.checkin_enabled === 'yes' ? 'settings.checkin.on' : 'settings.checkin.off')}
          </ThemedText>
        </Pressable>
      </View>

      {Platform.OS === 'android' && (
        <View style={styles.section}>
          <ThemedText type="smallBold">{t('settings.alarms')}</ThemedText>
          <ThemedText themeColor="textSecondary">{t('settings.alarms.hint')}</ThemedText>
          <Pressable
            accessibilityRole="button"
            onPress={() => void Notifications.requestExactAlarmPermissionsAsync()}
            style={[styles.option, { borderColor: theme.border }]}>
            <ThemedText type="smallBold">{t('settings.alarms.allow')}</ThemedText>
          </Pressable>
        </View>
      )}

      <View style={styles.section}>
        <ThemedText type="smallBold">{t('settings.model')}</ThemedText>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/setup')}
          style={[styles.option, { borderColor: theme.border }]}>
          <ThemedText type="smallBold">{t('settings.model.open')}</ThemedText>
        </Pressable>
      </View>

      <View style={styles.section}>
        <ThemedText type="smallBold">{t('export.title')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('export.hint')}
        </ThemedText>
        {exportNote && <ThemedText themeColor="danger">{t(exportNote)}</ThemedText>}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: exporting }}
          disabled={exporting}
          onPress={() => void share(false)}
          style={[styles.option, { borderColor: theme.border }, exporting && styles.disabled]}>
          <ThemedText type="smallBold">{t('export.public')}</ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: exporting }}
          disabled={exporting}
          onPress={() => void share(true)}
          style={[styles.option, { borderColor: theme.border }, exporting && styles.disabled]}>
          <ThemedText type="smallBold">{t('export.private')}</ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/vault')}
          style={[styles.option, { borderColor: theme.border }]}>
          <ThemedText type="smallBold">{t('vault.open')}</ThemedText>
        </Pressable>
      </View>

      <View style={styles.section}>
        <ThemedText type="smallBold">{t('settings.privacy')}</ThemedText>
        <ThemedText>{t('settings.privacy.promise')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('settings.privacy.encrypted', { version: dbInfo.cipherVersion })}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('settings.privacy.schema', { version: dbInfo.schemaVersion })}
        </ThemedText>
      </View>
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
      <ThemedText style={styles.stepperLabel}>{label}</ThemedText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={decreaseLabel}
        onPress={() => onShift(-1)}
        style={buttonStyle}>
        <ThemedText type="subtitle">−</ThemedText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={increaseLabel}
        onPress={() => onShift(1)}
        style={buttonStyle}>
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
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  stepperLabel: {
    flex: 1,
  },
  stepButton: {
    width: 64,
    height: MinTouchTarget,
    borderWidth: 1,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
});
