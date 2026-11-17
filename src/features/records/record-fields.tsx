import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { DraftRecord, RecordKind } from '@/ai/extract';
import { parseDates } from '@/ai/rules';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';
import { formatDue } from '@/lib/time';

const KINDS: RecordKind[] = ['note', 'promise'];

export function RecordFields({
  value,
  onChange,
}: {
  value: DraftRecord;
  onChange: (next: DraftRecord) => void;
}) {
  const theme = useTheme();
  const t = useT();
  const [dueDraft, setDueDraft] = useState('');
  const [dueError, setDueError] = useState(false);

  const commitDue = () => {
    const trimmed = dueDraft.trim();
    if (!trimmed) return;
    const mention = parseDates(trimmed, new Date())[0];
    const coversAll = mention != null && mention.start === 0 && mention.end === trimmed.length;
    if (!mention || !coversAll) {
      setDueError(true);
      return;
    }
    setDueError(false);
    setDueDraft('');
    onChange({ ...value, dueAt: mention.dueAt });
  };

  const fieldStyle = [
    styles.input,
    { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement },
  ];

  return (
    <View style={styles.fields}>
      <View accessibilityRole="radiogroup" style={styles.row}>
        {KINDS.map((kind) => {
          const selected = value.type === kind;
          return (
            <Pressable
              key={kind}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => onChange({ ...value, type: kind })}
              style={[styles.choice, { borderColor: selected ? theme.accent : theme.border }, selected && { backgroundColor: theme.accent }]}>
              <ThemedText type="smallBold" themeColor={selected ? 'onAccent' : 'text'}>
                {t(kind === 'note' ? 'capture.type.note' : 'capture.type.promise')}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <ThemedText type="smallBold">{t('records.fieldTitle')}</ThemedText>
      <TextInput
        accessibilityLabel={t('records.fieldTitle')}
        value={value.title}
        onChangeText={(title) => onChange({ ...value, title })}
        maxLength={200}
        style={fieldStyle}
      />

      <ThemedText type="smallBold">{t('capture.body')}</ThemedText>
      <TextInput
        accessibilityLabel={t('capture.body')}
        value={value.body ?? ''}
        onChangeText={(body) => onChange({ ...value, body: body.length > 0 ? body : null })}
        placeholder={t('capture.bodyPlaceholder')}
        placeholderTextColor={theme.textSecondary}
        multiline
        maxLength={4000}
        textAlignVertical="top"
        style={[fieldStyle, styles.multiline]}
      />

      <ThemedText type="smallBold">{t('capture.due')}</ThemedText>
      {value.dueAt != null && (
        <View style={styles.dueRow}>
          <ThemedText style={styles.dueText}>{formatDue(value.dueAt)}</ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('capture.clearDue')}
            onPress={() => onChange({ ...value, dueAt: null })}
            style={[styles.clear, { borderColor: theme.border }]}>
            <ThemedText type="smallBold">{t('capture.clearDue')}</ThemedText>
          </Pressable>
        </View>
      )}
      <TextInput
        accessibilityLabel={t('capture.due')}
        value={dueDraft}
        onChangeText={(text) => {
          setDueDraft(text);
          setDueError(false);
        }}
        onEndEditing={commitDue}
        onSubmitEditing={commitDue}
        placeholder={t('capture.duePlaceholder')}
        placeholderTextColor={theme.textSecondary}
        style={fieldStyle}
      />
      {dueError && <ThemedText themeColor="danger">{t('capture.dueInvalid')}</ThemedText>}

      <ThemedText type="smallBold">{t('capture.person')}</ThemedText>
      <TextInput
        accessibilityLabel={t('capture.person')}
        value={value.personName ?? ''}
        onChangeText={(personName) =>
          onChange({ ...value, personName: personName.length > 0 ? personName : null, personId: null })
        }
        placeholder={t('capture.personPlaceholder')}
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={80}
        style={fieldStyle}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fields: {
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
    paddingHorizontal: Spacing.two,
  },
  input: {
    minHeight: MinTouchTarget,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  multiline: {
    minHeight: 80,
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dueText: {
    flex: 1,
  },
  clear: {
    minHeight: MinTouchTarget,
    borderWidth: 1,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
});
