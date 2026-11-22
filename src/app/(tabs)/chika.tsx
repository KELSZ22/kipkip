import { router, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { askNotes, type ChikaSource } from '@/features/chika/ask';
import { TabScreen } from '@/components/tab-screen';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { getDb } from '@/db/client';
import { useTheme } from '@/hooks/use-theme';
import { useT, type MessageKey } from '@/lib/i18n';
import { useSettings } from '@/lib/settings-store';

type Line = 'none' | 'empty' | 'words' | 'unphrased' | 'failed';

type Turn = {
  id: number;
  question: string;
  text: string;
  line: Line | null;
  sources: ChikaSource[];
};

const LINE_KEY: Record<Line, MessageKey> = {
  none: 'chika.none',
  empty: 'chika.emptyNotes',
  words: 'chika.words',
  unphrased: 'chika.unphrased',
  failed: 'chika.failed',
};

export default function ChikaScreen() {
  const t = useT();
  const theme = useTheme();
  const modelId = useSettings((state) => state.values.model_id);
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const nextId = useRef(1);

  const send = async () => {
    const text = question.trim();
    if (!text || busy) return;
    setQuestion('');
    setBusy(true);
    setProgress(null);
    try {
      const reply = await askNotes({
        db: getDb(),
        question: text,
        modelId,
        onProgress: (done, total) => {
          if (total > 0) setProgress({ done, total });
        },
      });
      setTurns((current) => [
        ...current,
        { id: nextId.current, question: text, text: reply.text, line: reply.line, sources: reply.sources },
      ]);
      nextId.current += 1;
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <TabScreen title={t('chika.title')}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={turns}
          keyExtractor={(turn) => String(turn.id)}
          style={styles.flex}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<ThemedText themeColor="textSecondary">{t('chika.placeholder')}</ThemedText>}
          renderItem={({ item }) => (
            <View style={styles.turn}>
              <ThemedText type="smallBold">{item.question}</ThemedText>
              <ThemedText>{item.line ? t(LINE_KEY[item.line]) : item.text}</ThemedText>
              {item.sources.length > 0 && (
                <View style={styles.sources}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('chika.sources')}
                  </ThemedText>
                  {item.sources.map((source) => (
                    <Pressable
                      key={source.id}
                      accessibilityRole="button"
                      onPress={() => router.push(`/record/${source.id}` as Href)}
                      style={[styles.source, { borderColor: theme.border }]}>
                      <ThemedText type="smallBold">{source.title}</ThemedText>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}
        />
        {progress && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('chika.reading', { done: progress.done, total: progress.total })}
          </ThemedText>
        )}
        {busy && !progress && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('chika.asking')}
          </ThemedText>
        )}
        <View style={styles.row}>
          <TextInput
            accessibilityLabel={t('chika.input')}
            value={question}
            onChangeText={setQuestion}
            editable={!busy}
            placeholder={t('chika.input')}
            placeholderTextColor={theme.textSecondary}
            multiline
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: question.trim().length === 0 || busy }}
            disabled={question.trim().length === 0 || busy}
            onPress={() => void send()}
            style={[
              styles.send,
              { backgroundColor: theme.accent },
              (question.trim().length === 0 || busy) && styles.disabled,
            ]}>
            <ThemedText type="smallBold" themeColor="onAccent">
              {t('chika.ask')}
            </ThemedText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  list: {
    gap: Spacing.three,
    paddingBottom: Spacing.three,
  },
  turn: {
    gap: Spacing.one,
  },
  sources: {
    gap: Spacing.one,
  },
  source: {
    minHeight: MinTouchTarget,
    borderWidth: 1,
    borderRadius: Spacing.two,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: MinTouchTarget,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  send: {
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
