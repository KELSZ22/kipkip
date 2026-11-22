import { translate, type MessageKey } from '@/lib/i18n';
import type { ActionApp } from '@/lib/links';
import type { Tone } from '@/lib/tone';

export const ACTION_LABEL: Record<ActionApp, MessageKey> = {
  call: 'actions.call',
  whatsapp: 'actions.whatsapp',
  viber: 'actions.viber',
  sms: 'actions.sms',
  email: 'actions.email',
};

export const FOLLOW_UP: Record<ActionApp, MessageKey> = {
  call: 'actions.did.call',
  whatsapp: 'actions.did.whatsapp',
  viber: 'actions.did.viber',
  sms: 'actions.did.sms',
  email: 'actions.did.email',
};

export function reminderText(
  tone: Tone,
  companionName: string,
  title: string,
  personName: string | null,
): { title: string; body: string } {
  return {
    title: translate(tone, 'actions.remindTitle', { name: companionName }),
    body: personName
      ? translate(tone, 'actions.remindBody', { person: personName, title })
      : translate(tone, 'actions.remindBodyPlain', { title }),
  };
}
