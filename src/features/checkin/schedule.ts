import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { z } from 'zod';

import { translate } from '@/lib/i18n';
import { useSettings } from '@/lib/settings-store';
import {
  CHECKIN_LATER,
  SNOOZE_MS,
  checkinIdentifier,
  checkinQuestionKey,
  isScheduledCheckin,
  upcomingCheckins,
} from '@/features/checkin/when';

const CHANNEL_ID = 'kumusta';

const payloadSchema = z.object({
  kind: z.literal('checkin'),
  question: z.string().trim().min(1).max(300),
});

let channelTone: string | null = null;
let categoryTone: string | null = null;
let asked = false;

async function ensureChannel(): Promise<void> {
  const tone = useSettings.getState().values.tone;
  if (Platform.OS !== 'android' || channelTone === tone) return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: translate(tone, 'checkin.channel'),
    importance: AndroidImportance.DEFAULT,
  });
  channelTone = tone;
}

async function ensureCategory(): Promise<void> {
  const tone = useSettings.getState().values.tone;
  if (categoryTone === tone) return;
  await Notifications.setNotificationCategoryAsync('kumusta', [
    {
      identifier: 'later',
      buttonTitle: translate(tone, 'checkin.later'),
      options: { opensAppToForeground: true },
    },
  ]);
  categoryTone = tone;
}

async function ensurePermission(): Promise<void> {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted' || asked || current.canAskAgain === false) return;
  asked = true;
  await Notifications.requestPermissionsAsync();
}

async function delivery(): Promise<'bestEffort' | 'alarmClock'> {
  if (Platform.OS !== 'android') return 'bestEffort';
  const permission = await Notifications.getExactAlarmPermissionsAsync();
  return permission.status === 'granted' ? 'alarmClock' : 'bestEffort';
}

async function scheduleOne(identifier: string, when: Date, question: string): Promise<void> {
  const { companion_name: name } = useSettings.getState().values;
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: name,
      body: question,
      sound: 'default',
      data: { kind: 'checkin', question },
      categoryIdentifier: 'kumusta',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
      channelId: CHANNEL_ID,
      delivery: await delivery(),
    },
  });
}

async function cancelScheduledDays(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const request of scheduled) {
    if (isScheduledCheckin(request.identifier)) {
      await Notifications.cancelScheduledNotificationAsync(request.identifier).catch(() => undefined);
    }
  }
}

/** Rebuilds the next week of questions, or removes them when the check-in is off. A pending "later" is left alone. */
export async function syncCheckin(): Promise<void> {
  const { checkin_enabled: enabled, checkin_time: time, tone, setup_done: ready } = useSettings.getState().values;
  if (ready !== 'yes') return;
  if (enabled === 'no') {
    await cancelScheduledDays();
    await Notifications.cancelScheduledNotificationAsync(CHECKIN_LATER).catch(() => undefined);
    return;
  }

  await ensureChannel();
  await ensureCategory();
  await ensurePermission();
  await cancelScheduledDays();

  for (const when of upcomingCheckins(time, new Date())) {
    await scheduleOne(checkinIdentifier(when), when, translate(tone, checkinQuestionKey(when)));
  }
}

/** Moves the question one hour later. The one that just fired is already gone, so nothing else is cancelled. */
export async function snoozeCheckin(question: string): Promise<void> {
  await ensureChannel();
  await ensureCategory();
  await Notifications.cancelScheduledNotificationAsync(CHECKIN_LATER).catch(() => undefined);
  await scheduleOne(CHECKIN_LATER, new Date(Date.now() + SNOOZE_MS), question);
}

function openCheckin(question: string): void {
  router.push({ pathname: '/checkin', params: { question } } as Href);
}

const handledResponses = new Set<string>();

async function handleResponse(response: Notifications.NotificationResponse): Promise<void> {
  const parsed = payloadSchema.safeParse(response.notification.request.content.data);
  if (!parsed.success) return;
  const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
  if (handledResponses.has(key)) return;
  handledResponses.add(key);
  if (response.actionIdentifier === 'later') {
    await snoozeCheckin(parsed.data.question);
    return;
  }
  if (response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
    openCheckin(parsed.data.question);
  }
}

export function useCheckin(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const responses = Notifications.addNotificationResponseReceivedListener((response) => {
      void handleResponse(response).catch((error: unknown) => console.error(error));
    });
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') void syncCheckin().catch((error: unknown) => console.error(error));
    });
    void (async () => {
      try {
        await syncCheckin();
        const last = await Notifications.getLastNotificationResponseAsync();
        if (!last) return;
        await handleResponse(last);
        if (payloadSchema.safeParse(last.notification.request.content.data).success) {
          await Notifications.clearLastNotificationResponseAsync();
        }
      } catch (error) {
        console.error(error);
      }
    })();
    return () => {
      responses.remove();
      appState.remove();
    };
  }, [enabled]);
}
