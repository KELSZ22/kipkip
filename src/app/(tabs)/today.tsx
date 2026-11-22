import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { TabScreen } from '@/components/tab-screen';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { getDb } from '@/db/client';
import { getRecord, listNoteStamps, listPromisesThrough, type RecordItem } from '@/db/repo/records';
import { QuickActions } from '@/features/actions/quick-actions';
import { checkinQuestionKey } from '@/features/checkin/when';
import { greetingPart, pickResurfaced, type Resurfaced } from '@/features/today/baon';
import { useTheme } from '@/hooks/use-theme';
import { useT, type MessageKey } from '@/lib/i18n';
import { useSettings } from '@/lib/settings-store';
import { dateRangeBounds, formatDue, formatTimeOfDay } from '@/lib/time';

type TodayData = {
  promises: RecordItem[];
  note: RecordItem | null;
  kind: Resurfaced['kind'] | null;
};

export default function TodayScreen() {
  const t = useT();
  const theme = useTheme();
  const checkinTime = useSettings((state) => state.values.checkin_time);
  const checkinEnabled = useSettings((state) => state.values.checkin_enabled);
  const [now] = useState(() => new Date());
  const [data, setData] = useState<TodayData>({ promises: [], note: null, kind: null });
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async (isActive: () => boolean) => {
    const moment = new Date();
    const end = dateRangeBounds('today', moment).to ?? moment.getTime();
    try {
      const db = getDb();
      const [promises, stamps] = await Promise.all([listPromisesThrough(db, end), listNoteStamps(db)]);
      const picked = pickResurfaced(stamps, moment);
      const note = picked ? await getRecord(db, picked.id) : null;
      if (!isActive()) return;
      setData({ promises, note, kind: note && picked ? picked.kind : null });
      setLoadFailed(false);
    } catch (error) {
      console.error(error);
      if (isActive()) setLoadFailed(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void load(() => active);
      return () => {
        active = false;
      };
    }, [load]),
  );

  const answer = () => {
    router.push({ pathname: '/checkin', params: { question: t(checkinQuestionKey(new Date())) } } as Href);
  };

  return (
    <TabScreen title={t('today.title')}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle">{t(`today.greeting.${greetingPart(now)}` as MessageKey)}</ThemedText>
        {loadFailed && <ThemedText themeColor="danger">{t('today.loadFailed')}</ThemedText>}

        <View style={styles.section}>
          <ThemedText type="smallBold">{t('today.dueTitle')}</ThemedText>
          {data.promises.length === 0 && !loadFailed && (
            <ThemedText themeColor="textSecondary">{t('today.dueEmpty')}</ThemedText>
          )}
          {data.promises.map((record) => {
            const overdue = record.dueAt != null && record.dueAt < (dateRangeBounds('today', new Date()).from ?? 0);
            return (
              <View
                key={record.id}
                style={[styles.card, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
                <Pressable accessibilityRole="button" onPress={() => router.push(`/record/${record.id}` as Href)}>
                  <ThemedText type="smallBold">{record.title}</ThemedText>
                  <ThemedText type="small" themeColor={overdue ? 'danger' : 'textSecondary'}>
                    {[record.personName, record.dueAt != null ? formatDue(record.dueAt) : null, overdue ? t('today.overdue') : null]
                      .filter((part) => part != null)
                      .join(' · ')}
                  </ThemedText>
                </Pressable>
                <QuickActions record={record} onUpdated={() => void load(() => true)} />
              </View>
            );
          })}
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold">
            {t(data.kind === 'onThisDay' ? 'today.onThisDay' : 'today.older')}
          </ThemedText>
          {data.note ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/record/${data.note?.id}` as Href)}
              style={[styles.card, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="smallBold">{data.note.title}</ThemedText>
              {data.note.body ? <ThemedText themeColor="textSecondary">{data.note.body}</ThemedText> : null}
            </Pressable>
          ) : (
            !loadFailed && <ThemedText themeColor="textSecondary">{t('today.noteEmpty')}</ThemedText>
          )}
        </View>

        <View style={styles.section}>
          {checkinEnabled === 'yes' ? (
            <>
              <ThemedText themeColor="textSecondary">
                {t('today.checkinAt', { time: formatTimeOfDay(checkinTime) })}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                onPress={answer}
                style={[styles.button, { borderColor: theme.accent }]}>
                <ThemedText type="smallBold">{t('today.checkinNow')}</ThemedText>
              </Pressable>
            </>
          ) : (
            <ThemedText themeColor="textSecondary">{t('today.checkinOff')}</ThemedText>
          )}
        </View>
      </ScrollView>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.four,
    paddingBottom: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  card: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  button: {
    minHeight: MinTouchTarget,
    borderWidth: 1,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
});
