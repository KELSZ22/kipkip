import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { TabScreen } from '@/components/tab-screen';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { getDb } from '@/db/client';
import { listPeopleWithRecords, type PersonRow } from '@/db/repo/people';
import { listRecords, type RecordItem, type RecordType } from '@/db/repo/records';
import { QuickActions } from '@/features/actions/quick-actions';
import { useTheme } from '@/hooks/use-theme';
import { useT, type MessageKey } from '@/lib/i18n';
import { dateRangeBounds, formatDue, type DateRangeKey } from '@/lib/time';

const TYPES: RecordType[] = ['note', 'promise'];
const RANGES: DateRangeKey[] = ['any', 'today', 'week', 'month'];

export default function RecordsScreen() {
  const t = useT();
  const theme = useTheme();
  const [type, setType] = useState<RecordType>('note');
  const [query, setQuery] = useState('');
  const [range, setRange] = useState<DateRangeKey>('any');
  const [personId, setPersonId] = useState<number | null>(null);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [items, setItems] = useState<RecordItem[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(
    async (isActive: () => boolean) => {
      const bounds = dateRangeBounds(range, new Date());
      try {
        const db = getDb();
        const [nextPeople, nextItems] = await Promise.all([
          listPeopleWithRecords(db, type),
          listRecords(db, { type, query, personId, from: bounds.from, to: bounds.to }),
        ]);
        if (!isActive()) return;
        setPeople(nextPeople);
        setItems(nextItems);
        setPersonId((current) =>
          current != null && nextPeople.some((person) => person.id === current) ? current : null,
        );
        setLoadFailed(false);
      } catch (error) {
        console.error(error);
        if (isActive()) setLoadFailed(true);
      }
    },
    [personId, query, range, type],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void load(() => active);
      return () => {
        active = false;
      };
    }, [load]),
  );

  return (
    <TabScreen title={t('records.title')}>
      <View style={styles.flex}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/vault' as Href)}
          style={[styles.choice, { borderColor: theme.border }]}>
          <ThemedText type="smallBold">{t('vault.open')}</ThemedText>
        </Pressable>

        <View accessibilityRole="tablist" style={styles.row}>
          {TYPES.map((option) => {
            const selected = type === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setType(option)}
                style={[styles.choice, { borderColor: selected ? theme.accent : theme.border }, selected && { backgroundColor: theme.accent }]}>
                <ThemedText type="smallBold" themeColor={selected ? 'onAccent' : 'text'}>
                  {t(option === 'note' ? 'records.kwento' : 'records.pramis')}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        <TextInput
          accessibilityLabel={t('records.searchLabel')}
          value={query}
          onChangeText={setQuery}
          placeholder={t('records.searchPlaceholder')}
          placeholderTextColor={theme.textSecondary}
          autoCorrect={false}
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
        />

        <View style={styles.wrap}>
          {RANGES.map((option) => {
            const selected = range === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setRange(option)}
                style={[styles.chip, { borderColor: selected ? theme.accent : theme.border }, selected && { backgroundColor: theme.accent }]}>
                <ThemedText type="smallBold" themeColor={selected ? 'onAccent' : 'text'}>
                  {t(`records.range.${option}` as MessageKey)}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.people}>
          <PersonChip label={t('records.personAny')} selected={personId == null} onPress={() => setPersonId(null)} />
          {people.map((person) => (
            <PersonChip
              key={person.id}
              label={person.displayName}
              selected={personId === person.id}
              onPress={() => setPersonId(person.id)}
            />
          ))}
        </ScrollView>

        {loadFailed && <ThemedText themeColor="danger">{t('records.loadFailed')}</ThemedText>}

        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          style={styles.flex}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            loadFailed ? undefined : <ThemedText themeColor="textSecondary">{t('records.empty')}</ThemedText>
          }
          renderItem={({ item }) => (
            <View style={[styles.record, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
              <Pressable accessibilityRole="button" onPress={() => router.push(`/record/${item.id}` as Href)}>
                <ThemedText type="smallBold">{item.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {[
                    item.personName,
                    item.dueAt != null ? formatDue(item.dueAt) : item.type === 'promise' ? t('records.noDue') : null,
                    item.type === 'promise' ? t(`records.status.${item.status}`) : null,
                  ]
                    .filter((part) => part != null)
                    .join(' · ')}
                </ThemedText>
              </Pressable>
              <QuickActions record={item} onUpdated={() => void load(() => true)} />
            </View>
          )}
        />
      </View>
    </TabScreen>
  );
}

function PersonChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, { borderColor: selected ? theme.accent : theme.border }, selected && { backgroundColor: theme.accent }]}>
      <ThemedText type="smallBold" themeColor={selected ? 'onAccent' : 'text'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  people: {
    gap: Spacing.two,
  },
  choice: {
    flex: 1,
    minHeight: MinTouchTarget,
    borderWidth: 1,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    minHeight: MinTouchTarget,
    borderWidth: 1,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  input: {
    minHeight: MinTouchTarget,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  list: {
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  record: {
    minHeight: MinTouchTarget,
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.one,
    justifyContent: 'center',
  },
});
