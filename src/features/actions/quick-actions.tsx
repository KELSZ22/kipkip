import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { getDb } from '@/db/client';
import { linkPersonContact } from '@/db/repo/people';
import type { RecordItem } from '@/db/repo/records';
import { pickContact } from '@/features/actions/contacts';
import { ACTION_LABEL } from '@/features/actions/copy';
import { resyncPromiseReminders } from '@/features/actions/reminders';
import { runAction } from '@/features/actions/run-action';
import { useTheme } from '@/hooks/use-theme';
import { useT, type MessageKey } from '@/lib/i18n';
import { orderActions, type ActionApp } from '@/lib/links';

export function QuickActions({ record, onUpdated }: { record: RecordItem; onUpdated: () => void }) {
  const t = useT();
  const theme = useTheme();
  const [message, setMessage] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  if (record.type !== 'promise' || record.status !== 'open' || record.personId == null) return null;
  const personId = record.personId;
  const actions = orderActions(record.preferredApp, { phone: record.personPhone, email: record.personEmail });

  const link = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const outcome = await pickContact();
      if (outcome.status === 'denied') setMessage('actions.linkDenied');
      else if (outcome.status === 'failed') setMessage('actions.linkFailed');
      else if (outcome.status === 'picked') {
        if (!outcome.contact.phone && !outcome.contact.email) {
          setMessage('actions.linkEmpty');
        } else {
          await linkPersonContact(getDb(), personId, outcome.contact);
          await resyncPromiseReminders();
          onUpdated();
        }
      }
    } catch (error) {
      console.error(error);
      setMessage('actions.linkFailed');
    } finally {
      setBusy(false);
    }
  };

  const press = async (app: ActionApp) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await runAction(record, app);
      if (result === 'opened') onUpdated();
      else setMessage('actions.unavailable');
    } catch (error) {
      console.error(error);
      setMessage('actions.unavailable');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      {actions.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actions}>
          {actions.map((app) => (
            <Pressable
              key={app}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => void press(app)}
              style={[styles.action, { borderColor: theme.accent }]}>
              <ThemedText type="smallBold">{t(ACTION_LABEL[app])}</ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={() => void link()}
        style={styles.link}>
        <ThemedText type="smallBold" themeColor="accent">
          {t(actions.length > 0 ? 'actions.change' : 'actions.link')}
        </ThemedText>
      </Pressable>
      {message && <ThemedText themeColor="danger">{t(message)}</ThemedText>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.one,
  },
  actions: {
    gap: Spacing.two,
  },
  action: {
    minHeight: MinTouchTarget,
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: {
    minHeight: MinTouchTarget,
    justifyContent: 'center',
  },
});
