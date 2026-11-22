import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Alert, AppState } from 'react-native';
import { z } from 'zod';

import { getDb } from '@/db/client';
import { clearPendingAction, getPendingAction } from '@/db/repo/follow-up';
import { getRecord, setRecordStatus } from '@/db/repo/records';
import { FOLLOW_UP } from '@/features/actions/copy';
import { configureNotificationHandler, resyncPromiseReminders } from '@/features/actions/reminders';
import { runAction } from '@/features/actions/run-action';
import { translate } from '@/lib/i18n';
import { isActionApp } from '@/lib/links';
import { useSettings } from '@/lib/settings-store';

const payloadSchema = z.object({
  kind: z.literal('pramis'),
  recordId: z.string().regex(/^[1-9]\d*$/),
});

const responsesInFlight = new Map<string, Promise<boolean>>();
let asking = false;

async function finishPromise(recordId: number): Promise<void> {
  const db = getDb();
  await setRecordStatus(db, recordId, 'done', Date.now());
  await clearPendingAction(db);
  await resyncPromiseReminders();
}

export async function askFollowUp(): Promise<void> {
  if (asking) return;
  const db = getDb();
  const pending = await getPendingAction(db);
  if (!pending) return;
  const record = await getRecord(db, pending.recordId);
  if (!record || record.status !== 'open') {
    await clearPendingAction(db);
    return;
  }

  asking = true;
  const tone = useSettings.getState().values.tone;
  const stopAsking = () => {
    asking = false;
  };
  Alert.alert(
    translate(tone, FOLLOW_UP[pending.app], { who: pending.who }),
    undefined,
    [
      {
        text: translate(tone, 'actions.did.notYet'),
        onPress: () => {
          stopAsking();
          void clearPendingAction(db).catch((error: unknown) => console.error(error));
        },
      },
      {
        text: translate(tone, 'actions.did.yes'),
        onPress: () => {
          stopAsking();
          void finishPromise(record.id).catch((error: unknown) => console.error(error));
        },
      },
    ],
    { onDismiss: stopAsking },
  );
}

function handleResponse(response: Notifications.NotificationResponse): Promise<boolean> {
  const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
  const existing = responsesInFlight.get(key);
  if (existing) return existing;

  const job = openFromNotification(response);
  responsesInFlight.set(key, job);
  return job;
}

async function openFromNotification(response: Notifications.NotificationResponse): Promise<boolean> {
  const parsed = payloadSchema.safeParse(response.notification.request.content.data);
  if (!parsed.success) return false;
  const recordId = Number(parsed.data.recordId);

  if (response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
    router.push(`/record/${recordId}` as Href);
    return false;
  }
  if (!isActionApp(response.actionIdentifier) || response.actionIdentifier === 'email') return false;

  const record = await getRecord(getDb(), recordId);
  if (!record) return false;
  return (await runAction(record, response.actionIdentifier)) === 'opened';
}

export function startPramis(): () => void {
  configureNotificationHandler();
  let alive = true;
  let leftApp = false;

  const appState = AppState.addEventListener('change', (next) => {
    if (next === 'background' || next === 'inactive') leftApp = true;
    if (next !== 'active' || !leftApp) return;
    leftApp = false;
    void askFollowUp().catch((error: unknown) => console.error(error));
    void resyncPromiseReminders().catch((error: unknown) => console.error(error));
  });

  const responses = Notifications.addNotificationResponseReceivedListener((response) => {
    void handleResponse(response).catch((error: unknown) => console.error(error));
  });

  void (async () => {
    try {
      await resyncPromiseReminders();
      if (!alive) return;
      const last = await Notifications.getLastNotificationResponseAsync();
      const opened = last ? await handleResponse(last) : false;
      if (!opened) await askFollowUp();
    } catch (error) {
      console.error(error);
    }
  })();

  return () => {
    alive = false;
    responses.remove();
    appState.remove();
  };
}

export function usePromiseReminders(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    return startPramis();
  }, [enabled]);
}
