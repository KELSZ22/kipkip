# Kipkip

A private, on-device AI life-record app. Type or talk naturally, and the AI companion (Lyn by default) turns it into notes (Kwento) and promises (Pramis). Everything stays on the phone.

Android first. This app needs a development build because op-sqlite has native code, so Expo Go won't work.

## Run it

Needs Bun, Android Studio (SDK and JDK), and an emulator or a phone with USB debugging on.

```bash
bun install
export JAVA_HOME=/opt/android-studio/jbr   # or wherever your Android Studio JDK is
bun run android                            # builds, installs, and starts the app
```

The first build takes a while because it compiles SQLCipher and downloads the NDK. After that, `bun run start` is enough unless native dependencies or `app.json` change.

## Checks

```bash
bun run typecheck
bun run lint
bun run test
bunx expo-doctor
```

## Layout

| Path | What's there |
| --- | --- |
| `src/app/` | Screens and navigators (Expo Router) |
| `src/db/` | Encrypted connection, key handling, schema, migrations, repositories |
| `src/lib/` | i18n, tone, settings store, helpers |
| `src/components/` | Shared UI |

## Good to know

- **Encryption:** `"op-sqlite": { "sqlcipher": true }` in `package.json` compiles in SQLCipher. Changing it requires `bunx expo prebuild --clean`. The app refuses to start on a build without encryption.
- **Encryption key:** a random key is created on first launch and kept in `expo-secure-store`. It never leaves the device, so a database copied to another phone can't be opened.
- **Migrations:** append to `MIGRATIONS` in `src/db/migrations.ts` and never edit a shipped one. Put one SQL statement in each array item, because op-sqlite's `execute()` only runs the first.
- **Tests:** database tests run the real SQL on Node's built-in `node:sqlite`, without SQLCipher. Encryption can only be checked on a device.
- **ESLint:** stays on v9 because `eslint-plugin-react` crashes on v10.
- **Text:** all user-facing text goes in `src/lib/i18n.ts`, in English, Taglish, and Filipino.
