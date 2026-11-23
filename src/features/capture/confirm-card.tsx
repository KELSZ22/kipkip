import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { DraftRecord } from '@/ai/extract';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { RecordFields } from '@/features/records/record-fields';
import { PrivateSwitch } from '@/features/vault/private-switch';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';

export function ConfirmCard({
  rawText,
  drafts,
  canUndo,
  saving,
  error,
  showTitleError,
  onChange,
  onDelete,
  onUndo,
  onEditText,
  onAccept,
}: {
  rawText: string;
  drafts: DraftRecord[];
  canUndo: boolean;
  saving: boolean;
  error: boolean;
  showTitleError: boolean;
  onChange: (next: DraftRecord) => void;
  onDelete: (key: string) => void;
  onUndo: () => void;
  onEditText: () => void;
  onAccept: () => void;
}) {
  const theme = useTheme();
  const t = useT();
  const canSave = drafts.length > 0 && drafts.every((draft) => draft.title.trim().length > 0) && !saving;

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
      style={styles.scroll}>
      <ThemedText type="subtitle" accessibilityRole="header">
        {t('capture.confirmTitle')}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('capture.raw')}
      </ThemedText>
      <ThemedText>{rawText}</ThemedText>

      {drafts.length === 0 && <ThemedText themeColor="textSecondary">{t('capture.nothingLeft')}</ThemedText>}
      {showTitleError && <ThemedText themeColor="danger">{t('capture.needTitle')}</ThemedText>}
      {error && <ThemedText themeColor="danger">{t('capture.saveFailed')}</ThemedText>}

      {drafts.map((draft) => (
        <View key={draft.key} style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <RecordFields value={draft} onChange={onChange} />
          <PrivateSwitch
            value={draft.isPrivate === true}
            onChange={(isPrivate) => onChange({ ...draft, isPrivate })}
          />
          <ThemedText type="small" themeColor="textSecondary">
            {t('vault.privateHint')}
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('capture.delete', { title: draft.title || t('records.fieldTitle') })}
            onPress={() => onDelete(draft.key)}
            style={styles.textButton}>
            <ThemedText type="smallBold" themeColor="danger">
              {t('capture.remove')}
            </ThemedText>
          </Pressable>
        </View>
      ))}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSave }}
        disabled={!canSave}
        onPress={onAccept}
        style={[styles.primary, { backgroundColor: theme.accent }, !canSave && styles.disabled]}>
        <ThemedText type="smallBold" themeColor="onAccent">
          {t('capture.accept')}
        </ThemedText>
      </Pressable>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canUndo }}
          disabled={!canUndo}
          onPress={onUndo}
          style={[styles.secondary, { borderColor: theme.border }, !canUndo && styles.disabled]}>
          <ThemedText type="smallBold">{t('capture.undo')}</ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onEditText}
          style={[styles.secondary, { borderColor: theme.border }]}>
          <ThemedText type="smallBold">{t('capture.editText')}</ThemedText>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    gap: Spacing.three,
    paddingBottom: Spacing.four,
  },
  card: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  textButton: {
    minHeight: MinTouchTarget,
    justifyContent: 'center',
  },
  primary: {
    minHeight: MinTouchTarget,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  secondary: {
    flex: 1,
    minHeight: MinTouchTarget,
    borderWidth: 1,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  disabled: {
    opacity: 0.4,
  },
});
