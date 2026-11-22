/**
 * Deep links for Pramis quick actions. Nothing here opens an app; callers do that
 * only after a tap. WhatsApp and Viber fall back to a phone call when they are missing.
 */

export const ACTION_APPS = ['call', 'whatsapp', 'viber', 'sms', 'email'] as const;
export const PREFERRED_APPS = ['call', 'whatsapp', 'viber', 'sms'] as const;

export type ActionApp = (typeof ACTION_APPS)[number];
export type PreferredApp = (typeof PREFERRED_APPS)[number];

export type ActionTarget = {
  phone: string | null;
  email: string | null;
};

export type ResolvedAction = {
  app: ActionApp;
  url: string;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PH_MOBILE = /^0\d{10}$/;

export function isActionApp(value: string): value is ActionApp {
  return (ACTION_APPS as readonly string[]).includes(value);
}

export function isPreferredApp(value: string): value is PreferredApp {
  return (PREFERRED_APPS as readonly string[]).includes(value);
}

/** Digits only. A local PH mobile (09xxxxxxxxx) becomes 63… so WhatsApp can route it. */
export function messagingDigits(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  return PH_MOBILE.test(digits) ? `63${digits.slice(1)}` : digits;
}

/** A number safe to put in tel: and sms:. Keeps a leading + when the source had one, or when it was a local PH mobile. */
export function dialNumber(phone: string): string | null {
  const digits = messagingDigits(phone);
  if (!digits) return null;
  const local = phone.replace(/\D/g, '');
  if (phone.trim().startsWith('+') || PH_MOBILE.test(local)) return `+${digits}`;
  return digits;
}

export function normalizeEmail(email: string): string | null {
  const trimmed = email.trim();
  return EMAIL.test(trimmed) ? trimmed : null;
}

export function buildActionUrl(app: ActionApp, target: ActionTarget): string | null {
  if (app === 'email') {
    const email = target.email ? normalizeEmail(target.email) : null;
    return email ? `mailto:${email}` : null;
  }

  if (!target.phone) return null;
  const dial = dialNumber(target.phone);
  const digits = messagingDigits(target.phone);
  if (!dial || !digits) return null;

  switch (app) {
    case 'call':
      return `tel:${dial}`;
    case 'sms':
      return `sms:${dial}`;
    case 'whatsapp':
      return `https://wa.me/${digits}`;
    case 'viber':
      return `viber://chat?number=${encodeURIComponent(dial)}`;
    default:
      return null;
  }
}

/** URL used only to ask the OS whether the app is installed. WhatsApp is checked by scheme, then opened via wa.me. */
export function probeUrl(app: ActionApp, target: ActionTarget): string | null {
  if (app === 'whatsapp') {
    const digits = target.phone ? messagingDigits(target.phone) : null;
    return digits ? `whatsapp://send?phone=${digits}` : null;
  }
  return buildActionUrl(app, target);
}

/**
 * Picks the URL to open. Call and SMS are always attempted when a number exists,
 * because the dialer is part of the phone. Other apps must be installed; otherwise
 * this falls back to a call, then SMS.
 */
export function resolveAction(
  app: ActionApp,
  target: ActionTarget,
  canOpen: (url: string) => boolean,
): ResolvedAction | null {
  const direct = buildActionUrl(app, target);
  const probe = probeUrl(app, target);
  const installed = app === 'call' || app === 'sms' || (probe != null && canOpen(probe));
  if (direct && installed) return { app, url: direct };

  if (app === 'call' || app === 'sms') return null;

  const call = buildActionUrl('call', target);
  if (call) return { app: 'call', url: call };
  const sms = buildActionUrl('sms', target);
  if (sms) return { app: 'sms', url: sms };
  return null;
}

/** Preferred app first. Email is included only when the address is usable. */
export function orderActions(preferred: PreferredApp | null, target: ActionTarget): ActionApp[] {
  const usable = ACTION_APPS.filter((app) => buildActionUrl(app, target) != null);
  if (preferred && usable.includes(preferred)) {
    return [preferred, ...usable.filter((app) => app !== preferred)];
  }
  return usable;
}

/** The three actions a notification can show. Android only displays three, so the preferred one leads. */
export function notificationActions(preferred: PreferredApp | null): PreferredApp[] {
  const ordered = orderActions(preferred, { phone: '1', email: null }).filter((app): app is PreferredApp =>
    isPreferredApp(app),
  );
  return ordered.slice(0, 3);
}
