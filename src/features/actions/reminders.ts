import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { getDb } from '@/db/client';
import { listDuePromises, type RecordItem } from '@/db/repo/records';
import { ACTION_LABEL, reminderText } from '@/features/actions/copy';
import { translate } from '@/lib/i18n';
import { notificationActions, type PreferredApp } from '@/lib/links';
import { useSettings } from '@/lib/settings-store';

const CHANNEL_ID = 'pramis';
const ID_PREFIX = 'pramis-';

export function reminderIdentifier(recordId: number): string {
  return `${ID_PREFIX}${recordId}`;
}

export function recordIdFromReminder(identifier: string): number | null {
  if (!identifier.startsWith(ID_PREFIX)) return null;
  const id = Number(identifier.slice(ID_PREFIX.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}

let askedForNotifications = false;
let channelTone: string | null = null;
let categoriesReadyFor: string | null = null;

function categoryId(preferred: PreferredApp | null): string {
  return `pramis_${preferred ?? 'call'}`;
}

async function ensureChannel(): Promise<void> {
  const tone = useSettings.getState().values.tone;
  if (Platform.OS !== 'android' || channelTone === tone) return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: translate(tone, 'actions.channel'),
    importance: AndroidImportance.HIGH,
  });
  channelTone = tone;
}

async function ensureCategories(): Promise<void> {
  const tone = useSettings.getState().values.tone;
  if (categoriesReadyFor === tone) return;
  const buttons = ['call', 'whatsapp', 'viber', 'sms'] as const;
  for (const preferred of buttons) {
    const actions = notificationActions(preferred);
    await Notifications.setNotificationCategoryAsync(
      categoryId(preferred),
      actions.map((app) => ({
        identifier: app,
        buttonTitle: translate(tone, ACTION_LABEL[app]),
        options: { opensAppToForeground: true },
      })),
    );
  }
  categoriesReadyFor = tone;
}

async function ensureNotificationPermission(): Promise<void> {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted' || askedForNotifications || current.canAskAgain === false) return;
  askedForNotifications = true;
  await Notifications.requestPermissionsAsync();
}

async function delivery(): Promise<'bestEffort' | 'alarmClock'> {
  if (Platform.OS !== 'android') return 'bestEffort';
  const permission = await Notifications.getExactAlarmPermissionsAsync();
  return permission.status === 'granted' ? 'alarmClock' : 'bestEffort';
}

export async function syncPromiseReminder(record: RecordItem): Promise<void> {
  const identifier = reminderIdentifier(record.id);
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);

  const dueAt = record.dueAt;
  if (
    record.type !== 'promise' ||
    record.status !== 'open' ||
    record.isPrivate ||
    dueAt == null ||
    dueAt <= Date.now()
  ) {
    return;
  }

  await ensureChannel();
  await ensureCategories();
  await ensureNotificationPermission();
  const { tone, companion_name: companionName } = useSettings.getState().values;
  const text = reminderText(tone, companionName, record.title, record.personName);

  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: text.title,
      body: text.body,
      sound: 'default',
      data: { kind: 'pramis', recordId: String(record.id) },
      categoryIdentifier: record.personPhone ? categoryId(record.preferredApp) : undefined,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(dueAt),
      channelId: CHANNEL_ID,
      delivery: await delivery(),
    },
  });
}

/** Rebuilds every future reminder and drops reminders for promises that are done, deleted, or past. */
export async function resyncPromiseReminders(): Promise<void> {
  await ensureChannel();
  await ensureCategories();
  const due = await listDuePromises(getDb());
  const upcoming = due.filter((record) => record.dueAt != null && record.dueAt > Date.now());
  if (upcoming.length > 0) await ensureNotificationPermission();

  const keep = new Set(upcoming.map((record) => reminderIdentifier(record.id)));
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const request of scheduled) {
    if (recordIdFromReminder(request.identifier) != null && !keep.has(request.identifier)) {
      await Notifications.cancelScheduledNotificationAsync(request.identifier).catch(() => undefined);
    }
  }
  for (const record of upcoming) {
    await syncPromiseReminder(record);
  }
}

export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}
