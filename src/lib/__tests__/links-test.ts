import {
  buildActionUrl,
  notificationActions,
  orderActions,
  resolveAction,
} from '@/lib/links';

const ANGEL = { phone: '+63 917 123 4567', email: 'angel@example.com' };

describe('links', () => {
  it('builds a dialable call and text link', () => {
    expect(buildActionUrl('call', ANGEL)).toBe('tel:+639171234567');
    expect(buildActionUrl('sms', ANGEL)).toBe('sms:+639171234567');
  });

  it('turns a local PH mobile into a country code for WhatsApp', () => {
    expect(buildActionUrl('whatsapp', { phone: '0917-123-4567', email: null })).toBe(
      'https://wa.me/639171234567',
    );
    expect(buildActionUrl('call', { phone: '0917 123 4567', email: null })).toBe('tel:+639171234567');
  });

  it('keeps a non-PH number without inventing a country code', () => {
    expect(buildActionUrl('call', { phone: '2125550100', email: null })).toBe('tel:2125550100');
    expect(buildActionUrl('whatsapp', { phone: '(212) 555-0100', email: null })).toBe('https://wa.me/2125550100');
  });

  it('encodes the Viber number', () => {
    expect(buildActionUrl('viber', ANGEL)).toBe('viber://chat?number=%2B639171234567');
  });

  it('builds a mailto link and rejects an address that is not an email', () => {
    expect(buildActionUrl('email', ANGEL)).toBe('mailto:angel@example.com');
    expect(buildActionUrl('email', { phone: ANGEL.phone, email: 'not an email' })).toBeNull();
  });

  it('returns nothing when the needed detail is missing', () => {
    expect(buildActionUrl('call', { phone: '   ', email: null })).toBeNull();
    expect(buildActionUrl('whatsapp', { phone: 'abc', email: null })).toBeNull();
    expect(buildActionUrl('email', { phone: ANGEL.phone, email: null })).toBeNull();
  });

  it('puts the preferred app first and hides actions that have no detail', () => {
    expect(orderActions('whatsapp', ANGEL)).toEqual(['whatsapp', 'call', 'viber', 'sms', 'email']);
    expect(orderActions(null, { phone: ANGEL.phone, email: null })).toEqual(['call', 'whatsapp', 'viber', 'sms']);
    expect(orderActions('sms', { phone: null, email: 'angel@example.com' })).toEqual(['email']);
  });

  it('opens WhatsApp when it is installed', () => {
    expect(resolveAction('whatsapp', ANGEL, (url) => url.startsWith('whatsapp://'))).toEqual({
      app: 'whatsapp',
      url: 'https://wa.me/639171234567',
    });
  });

  it('falls back to a phone call when WhatsApp or Viber is missing', () => {
    expect(resolveAction('whatsapp', ANGEL, () => false)).toEqual({ app: 'call', url: 'tel:+639171234567' });
    expect(resolveAction('viber', ANGEL, () => false)).toEqual({ app: 'call', url: 'tel:+639171234567' });
  });

  it('falls back from email to a call, and gives up when there is no number either', () => {
    expect(resolveAction('email', ANGEL, () => false)).toEqual({ app: 'call', url: 'tel:+639171234567' });
    expect(resolveAction('email', { phone: null, email: 'angel@example.com' }, () => false)).toBeNull();
  });

  it('still dials or texts when the OS cannot answer a probe', () => {
    expect(resolveAction('call', ANGEL, () => false)).toEqual({ app: 'call', url: 'tel:+639171234567' });
    expect(resolveAction('sms', ANGEL, () => false)).toEqual({ app: 'sms', url: 'sms:+639171234567' });
  });

  it('leads the notification with the preferred app and keeps three actions', () => {
    expect(notificationActions(null)).toEqual(['call', 'whatsapp', 'viber']);
    expect(notificationActions('sms')).toEqual(['sms', 'call', 'whatsapp']);
    expect(notificationActions('viber')).toEqual(['viber', 'call', 'whatsapp']);
  });
});
