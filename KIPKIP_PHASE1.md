# Build Phase 1 (MVP) of "Kipkip": a private, on-device AI life-record app

## Your role
You are a senior React Native engineer. Build Phase 1 of the app described below.
Work in the milestones listed at the end. After each milestone, stop, summarize what
you built, tell me how to test it on my phone, and wait for my "go" before continuing.
Ask me before adding any library not listed here. If something is ambiguous, make the
simplest reasonable choice, state it, and continue.

## Product summary
Kipkip is an Android-first mobile app (iPhone later) where the user types or talks
naturally, and an AI running fully ON THE PHONE turns each entry into organized
records: Notes (called "Kwento") and Promises (called "Pramis"). The AI companion is
named "Lyn" by default (the user can rename it). Target users are Filipinos, so input
may be English, Filipino, or Taglish.

Core promise: everything stays on the device. No cloud, no accounts, no analytics,
no network calls except the one-time AI model download.

Tone of the app: warm, like a bestie who never forgets. No guilt, no nagging, no streaks.

## Tech stack (use exactly this)
- React Native with Expo, using a development build (NOT Expo Go), TypeScript strict mode
- Navigation: expo-router with a bottom tab bar
- Local AI: llama.rn (llama.cpp) with GGUF models; use GBNF grammar / JSON-schema
  constrained output so extraction always returns valid JSON
- Database: op-sqlite with SQLCipher encryption enabled
- Voice: whisper.rn (on-device speech-to-text)
- Date parsing: chrono-node, extended with Filipino/Taglish words (see Rules below)
- Contacts: expo-contacts
- Reminders: expo-notifications (local notifications only)
- Linking: React Native Linking (deep links to Phone, WhatsApp, Viber, SMS, Email)
- Biometrics/PIN: expo-local-authentication + expo-secure-store for the DB key
- File export: expo-file-system + expo-sharing
- State: zustand; validation: zod; tests: jest

## Folder structure
src/
  app/                      # expo-router screens
    (tabs)/today.tsx         # Daily Baon
    (tabs)/capture.tsx
    (tabs)/records.tsx       # Kwento + Pramis tabs
    (tabs)/chika.tsx         # Ask your notes
    settings.tsx
    setup.tsx                # first-launch model setup
  features/
    capture/  records/  today/  chika/  actions/  vault/  checkin/
  ai/
    model.ts                 # RAM detection, model choice, download, load/unload
    extract.ts               # text -> records (rules first, then LLM with JSON grammar)
    rules.ts                 # date/person parsing incl. Taglish
    embed.ts                 # embeddings for search
    prompts.ts               # all system prompts in one place
  db/
    schema.ts  migrations.ts  repo/*.ts
  lib/
    i18n.ts  tone.ts  links.ts

## Data model (SQLite, encrypted)
- entries: id, raw_text, source ('text'|'voice'), created_at
- records: id, entry_id, type ('note'|'promise'), title, body, due_at (nullable),
  person_id (nullable), status ('open'|'done'|'cancelled'), is_private (bool),
  created_at, updated_at
- people: id, display_name, contact_id (nullable), phone (nullable),
  preferred_app ('call'|'whatsapp'|'viber'|'sms'|null), created_at
- embeddings: record_id, vector (blob)
- settings: key, value (companion_name, tone, checkin_time, model_id, etc.)

## Phase 1 features and acceptance criteria

### 1. First-launch setup
- Detect device RAM and choose a model tier:
  under 6 GB -> tiny model (~0.5-1B) + rules-heavy mode;
  6-8 GB -> small model (~1.5-3B); 12 GB or more -> ~3-4B model.
  Use small instruct GGUF models (Q4 quantization) whose licenses allow commercial use.
  Put model URLs, sizes and checksums in ONE config file so I can swap them.
- Download once, Wi-Fi only by default, resumable, with a progress bar and checksum check.
- Ask the user: companion name (default "Lyn"), tone (English / Taglish / Filipino),
  nightly check-in time (default 9:00 PM).
- The app must still work in rules-only mode if the model is not downloaded yet.

### 2. Capture
- Big text box + mic button. Voice is transcribed on-device with whisper.rn.
- On submit: save the raw entry, then run extraction.
- Extraction pipeline:
  a) rules.ts first: dates and Taglish time words ("bukas" = tomorrow,
     "mamaya" = later today, "mamayang gabi" = tonight, "ngayong gabi" = tonight,
     "sa Lunes" = next Monday, "next week", "Friday", "pagkatapos ng work"),
     and known people names from the people table.
  b) then the LLM, constrained by a JSON grammar, returns:
     { records: [ { type: 'note'|'promise', title, body?, due_at?, person_name? } ] }
  c) merge: rule results win for dates and known people.
- A promise is a commitment the user makes ("I'll call Angel tonight",
  "pramis, ipapadala ko bukas"). Everything else is a note.
- One entry can produce multiple records. Example:
  "Nag-lunch kami ni Mark, sabi niya due na si wife niya sa March.
   Promised Angel I'll call her mamayang gabi."
  -> note about Mark's wife being due in March + promise "Call Angel" due tonight 8 PM.
- Show a Confirm Card listing the extracted records. The user can accept all, edit
  any field, delete one, or undo. Nothing is final until confirmed.
- Target: Confirm Card appears in under 3 seconds on a 6-8 GB phone.

### 3. Records
- Two tabs: Kwento (notes) and Pramis (promises).
- Search, filter by date range and person.
- Tap a record to edit it; promises can be marked done or cancelled.

### 4. Pramis Tracker + Quick Actions
- Each promise with a due time schedules a local notification in Lyn's tone, e.g.
  Taglish: "Bes, may pramis ka kay Angel tonight. Tawagan mo na!"
- If a promise involves a person, link to a phone contact (ask permission; the first
  time, let the user pick the right contact, then remember it).
- Show one-tap action buttons on the promise card and in the notification:
  Call (tel:), WhatsApp (https://wa.me/<number>), Viber (viber://chat?number=<encoded number>),
  SMS (sms:), Email (mailto:). Show the person's preferred_app first and learn it
  from what the user taps.
- When the user returns to the app after tapping an action, ask
  "Did you call Angel?" and let one tap mark the promise done.
- Put all deep-link building in lib/links.ts with unit tests. If an app is not
  installed, fall back to a normal phone call or SMS.
- NEVER start calls or send messages automatically. The user always taps.

### 5. Daily Baon (Today screen)
- Greeting from the companion, using its name and the chosen tone.
- Promises due today and overdue, each with quick-action buttons.
- One older note resurfaced ("On this day" if available, otherwise a random older Kwento).

### 6. Kumusta check-in
- At the user's chosen time, a notification asks one short question, rotated from a
  list in the chosen tone (e.g. "Kumusta ka today? Ano'ng highlight mo?").
- The answer is saved as an entry and goes through normal extraction.
- Easy to snooze or turn off in settings. Never guilt the user for skipping.

### 7. Chika (ask your notes)
- Chat screen. Embed records on-device (embed.ts). Retrieve the top matches by cosine
  similarity (brute force in JS is fine for Phase 1, under ~10k records), then let
  the LLM answer ONLY from those records.
- Every answer shows the source records it used (tappable).
- If nothing relevant is found, say so honestly. Never invent facts.
- Private vault records are never retrieved or sent to the model.

### 8. Private vault
- Records can be marked private. Viewing them requires fingerprint or PIN.
- Private records are excluded from extraction re-runs, embeddings, and Chika.
- The whole database is encrypted with SQLCipher; the key is stored in expo-secure-store.

### 9. Export
- Export all non-private data: Markdown (one file per month of Kwento) and CSV
  (promises), shared through the system share sheet.
- Private data is exported only after biometric confirmation.

## Non-goals for Phase 1 (do NOT build)
Expense or money tracking of any kind, Utang Tracker, Gmail, notification reading,
share-sheet import, receipt scanning, widgets, people/CRM screens, Promise Score,
Life Garden, belief timeline, sync, cloud, accounts, payments, analytics,
iOS-specific polish.

## Quality rules
- TypeScript strict, no `any`. Validate all LLM output with zod; on invalid output,
  retry once, then fall back to saving the entry as a plain note.
- Load the model lazily and unload it when the app has been in the background for
  more than a few minutes, to save RAM and battery.
- All user-facing text goes through i18n.ts with English, Taglish, and Filipino variants.
- Unit tests (jest): rules.ts with at least 30 Taglish/English date and person examples,
  links.ts, and the extraction merge logic.
- Clean, simple UI: large touch targets, works well on a 6-inch Android screen,
  supports light and dark mode.
- No analytics, no crash-reporting SDKs that send data off the device, no network calls
  other than the model download.

## Milestones (stop after each one)
1. Project setup: Expo dev build, tab navigation, encrypted database, schema, settings store.
2. Text capture + rules.ts + Confirm Card + Records screens (Kwento and Pramis), no AI yet.
3. Model setup screen + llama.rn extraction with JSON grammar + merge with rules.
4. Pramis notifications + contact linking + Quick Actions + "Did you call?" flow.
5. Voice capture with whisper.rn.
6. Daily Baon screen + Kumusta check-in.
7. Embeddings + Chika with source citations.
8. Private vault + export.
9. Performance and battery pass on a real 6-8 GB Android phone, then a bug-fix pass.

Start with Milestone 1.