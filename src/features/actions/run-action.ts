import { Linking } from 'react-native';

import { getDb } from '@/db/client';
import { clearPendingAction, setPendingAction } from '@/db/repo/follow-up';
import { setPreferredApp } from '@/db/repo/people';
import type { RecordItem } from '@/db/repo/records';
import { isPreferredApp, probeUrl, resolveAction, type ActionApp } from '@/lib/links';

export type ActionResult = 'opened' | 'unavailable';

/**
 * Opens the app the user tapped. If that app is missing, falls back to a call or SMS.
 * The preferred app is remembered only when the tapped app itself opened.
 */
export async function runAction(record: RecordItem, app: ActionApp): Promise<ActionResult> {
  if (record.personId == null) return 'unavailable';
  const target = { phone: record.personPhone, email: record.personEmail };
  const known = new Map<string, boolean>();
  const probe = app === 'call' || app === 'sms' ? null : probeUrl(app, target);
  if (probe) {
    try {
      known.set(probe, await Linking.canOpenURL(probe));
    } catch {
      known.set(probe, false);
    }
  }

  const choice = resolveAction(app, target, (url) => known.get(url) ?? false);
  if (!choice) return 'unavailable';

  const db = getDb();
  await setPendingAction(db, {
    recordId: record.id,
    app: choice.app,
    who: record.personName ?? record.title,
  });
  try {
    await Linking.openURL(choice.url);
  } catch (error) {
    console.error(error);
    await clearPendingAction(db);
    return 'unavailable';
  }

  if (choice.app === app && isPreferredApp(app)) {
    await setPreferredApp(db, record.personId, app);
  }
  return 'opened';
}
