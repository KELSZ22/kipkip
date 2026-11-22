const { withAndroidManifest } = require('@expo/config-plugins');

/** Lets canOpenURL see dialer, SMS, WhatsApp, Viber, and mail on Android 11+. */
const SCHEMES = [
  ['android.intent.action.DIAL', 'tel'],
  ['android.intent.action.VIEW', 'sms'],
  ['android.intent.action.VIEW', 'smsto'],
  ['android.intent.action.VIEW', 'whatsapp'],
  ['android.intent.action.VIEW', 'viber'],
  ['android.intent.action.SENDTO', 'mailto'],
];

function withActionQueries(config) {
  return withAndroidManifest(config, (next) => {
    const manifest = next.modResults.manifest;
    const queries = manifest.queries ?? [];
    const intents = queries.flatMap((query) => query.intent ?? []);
    const missing = SCHEMES.filter(
      ([action, scheme]) =>
        !intents.some(
          (intent) =>
            intent.action?.some((item) => item.$['android:name'] === action) &&
            intent.data?.some((item) => item.$['android:scheme'] === scheme),
        ),
    ).map(([action, scheme]) => ({
      action: [{ $: { 'android:name': action } }],
      data: [{ $: { 'android:scheme': scheme } }],
    }));

    if (missing.length > 0) {
      queries.push({ intent: missing });
      manifest.queries = queries;
    }
    return next;
  });
}

module.exports = withActionQueries;
