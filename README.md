# Vaulty

A mobile-first personal money manager: accounts, transactions, budgets, savings goals and recurring bills.

The Android app is now a **native Kotlin / Jetpack Compose** application. The WebView is no longer used for any
screen; it is consulted once only to migrate the old Capacitor app's `localStorage` ledger. Data is local-first and
survives in-place APK updates. There is no hosted website and no Firebase configuration in this repository.

The former React source under `src/` is kept as a reference/development playground; it is **not** part of the APK.

## Features

- **Home** — net worth, monthly income/expenses, savings rate, wallets carousel, spending breakdown doughnut,
  6-month cash-flow chart, budget pulse, recent activity and configurable in-app widgets.
- **Activity** — full-text search, type/account/category/month filters, sorting, running in/out totals, CSV export,
  tap a row to edit, delete with confirmation.
- **Accounts** — checking / cash / savings / credit accounts with opening balances, assets vs liabilities,
  transfers between accounts, edit and delete.
- **Plan** — category budgets with progress bars, savings goals with contributions, recurring bills you can log
  into the ledger for the active month.
- **Vaulty Assistant** — speak or type a command in **English or Arabic** to log money, set budgets, fund goals,
  change settings or ask questions. Android speech recognition and text-to-speech are used when available.
- **Insights** — graphs for every expense and income category, daily flow, biggest entries and per-account flow.
- **Notifications** — budget alerts at 90% and over-limit, recurring bill reminders and a daily check-in at an hour
  you pick. Alarms are native and survive reboot/app replacement.
- **Settings & data** — JSON backup / restore, CSV export, start fresh, restore sample data, notification controls,
  update controls, theme/currency and local-only sync status.
- **In-app updates** — checks the HTTPS release manifest, verifies SHA-256 and size, then opens Android's installer.
- Light/dark theme, six currencies, month switching, demo data you can clear in one tap.

## Build the native APK

Use JDK 21, Android SDK platform 36.1 and build-tools 36.x. Point Gradle at your SDK with `ANDROID_HOME` or
`android/local.properties`:

```bash
cd android
./gradlew assembleDebug     # → app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease   # → app/build/outputs/apk/release/app-release.apk (signed when keystore is present)
```

The package stays `com.vaulty.app`, version 1.3 (`versionCode` 4), `minSdk` 23 and `targetSdk` 34. Install over an
existing build with:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Release signing and data preservation

The signing material is deliberately **not in git**. Two files are needed for a signed release:

- `android/keystore/vaulty-release.jks` — the original release keystore
- `android/keystore.properties` — `storeFile`, `storePassword`, `keyAlias`, `keyPassword`

`android/app/build.gradle` reads that properties file when it exists and signs the `release` build type with it;
without it `assembleRelease` builds unsigned and `assembleDebug` keeps using the debug key. `.gitignore` already
excludes `android/keystore/`, `android/keystore.properties`, `*.jks` and `*.keystore`.

> **Do not generate a new keystore for an existing install.** Android refuses to install an APK signed with a
> different certificate; the user would have to uninstall the old app, which deletes its local ledger. Restore the
> original `vaulty-release.jks` and credentials before publishing any update.

An in-place install (same package **and** same signing key) keeps the app's private storage, so accounts,
transactions and settings survive updates. The native store mirrors data under `vaulty_state_v1` and
`vaulty_state_backup_v1`, writes `vaulty_state_pre_update_v1` before installing an APK, and Android backup rules
exclude the APK download cache.

### One-time WebView migration

On first native launch, if no native state exists, Vaulty reads the legacy Capacitor WebView `localStorage` for the
`https://localhost/` origin (`vaulty_state_v1`, its backup and pre-update keys), normalizes it, writes it to native
storage and never reads it again. If no legacy data exists, sample data is seeded and saved. No WebView screen is
ever shown.

## In-app updates

The Android build updates itself from this repository's GitHub releases:

- at launch it reads `update.json` from `https://raw.githubusercontent.com/GiovanniEhab/vaulty/main/update.json`,
  at most once every six hours;
- the manifest `versionCode` is compared with the installed one (with a `version` string fallback);
- **Auto-update** (Settings → App Updates, on by default) downloads the APK, verifies the mandatory `sha256` digest
  and file size, and opens Android's installer;
- with Auto-update off, Home shows an *Update available* card and Settings has **Check now**;
- if Android needs “Install unknown apps” permission, Vaulty opens the correct settings screen and reuses the
  already verified APK when you tap Install again.

The download is served from the app's cache through a narrowly scoped `FileProvider`. Both the manifest and APK URL
must be HTTPS, and a checksum mismatch aborts the update. The feed shape is:

```json
{ "version": "1.3", "versionCode": 4, "url": "https://…/vaulty-1.3-release.apk", "sha256": "…", "size": 1234567, "notes": "…" }
```

### Publishing a new version

1. Restore the original release keystore and `android/keystore.properties`. **Never** create a fresh keystore for an
   app that is already installed on phones.
2. Bump `versionCode` and `versionName` in `android/app/build.gradle`. The version code must be higher than the one
   in `update.json`, otherwise clients will think they are already up to date.
3. Build `assembleRelease` with JDK 21 and the Android SDK configured.
4. Upload the signed APK to a new GitHub release at the exact URL you will publish.
5. Compute the digest of that same file, e.g. `certutil -hashfile vaulty-1.4-release.apk SHA256`.
6. Only then update `update.json` with the new `version`, `versionCode`, HTTPS `url`, `sha256`, `size` and notes.
   Do not point the feed at a file that has not been uploaded yet.
7. Install the new APK over the old one on a test device and confirm the ledger is still there.

## Vaulty Assistant

Tap the microphone in the header (or the Assistant sheet) and speak, or type the same sentence.

| Say | What happens |
| --- | --- |
| “Spent 250 on groceries” / “Add 40 for coffee” | Logs an expense, picks the category from the words |
| “Deposit 5000 salary into main bank” | Logs income into the named account |
| “Transfer 1000 from bank to savings” | Moves money between two accounts |
| “Set groceries budget to 6000” | Creates or updates that category budget |
| “Add 500 to my emergency fund” | Adds a contribution to the matching goal |
| “How much is left for groceries?” / “What did I spend on groceries?” | Reads the numbers back |
| “Dark mode”, “Use dollars”, “Next month”, “Open budgets” | Changes the app |
| “Remind me at 8 pm”, “Turn on notifications” | Sets the daily check-in |
| “Undo last” | Deletes the most recent transaction |

Arabic works the same way — switch to **العربية** in the sheet, or simply type Arabic; it is detected automatically.
Recognition uses `ar-EG` and replies use an Arabic voice when one is installed. The parser folds hamza/alef/yaa,
tashkeel, Arabic-Indic digits and “ألف” as a thousand multiplier, and matches Arabic account/category aliases.

**Speak replies** uses Android `TextToSpeech`. If voice input is unavailable, typing always works.

## Insights and widgets

Open **Insights** from the Activity screen or with the assistant (“show insights” / “افتح التحليلات”). It shows
income, expenses, net and savings rate; expenses by category; income by source; day-by-day flow; biggest entries;
per-account flow; and comparison with the previous month.

Home widgets are in-app cards. Tap **Edit** on the widget strip to choose which ones appear; the selection is saved
with your other settings. A real Android home-screen `AppWidget` provider is not included.

## Notifications

Enable them in **Settings & Data → Notifications** and allow the `POST_NOTIFICATIONS` prompt:

- the daily check-in is an exact alarm at the hour you choose (channel `vaulty-alerts`);
- each recurring bill gets a monthly reminder at 09:00, with the day clamped to 1–28;
- a category budget reaching 90% or going over its limit raises an alert while Vaulty is open;
- **Send test notification** verifies the permission/channel/alarm path.

Alarms are restored after `BOOT_COMPLETED` and `MY_PACKAGE_REPLACED`. Android 12+ exact-alarm access is requested
separately; without it reminders still arrive but may be delayed. Budget alerts are tracked per month and failed
sends are retried. There is no push server — all alerts are local to the device.

## Project structure

```
android/app/src/main/java/com/vaulty/app/
  MainActivity.kt             Compose shell, navigation, document pickers, speech/TTS
  VaultModels.kt / VaultJson.kt / VaultSeed.kt / VaultCalc.kt / VaultFormat.kt
  VaultStore.kt / VaultRepository.kt / VaultUpdater.kt / VaultUpdateController.kt
  VaultNotifications.kt       alarms, channel, receiver, budget alerts
  VaultAssistant.kt / VaultAssistantPanel.kt
  VaultViews.kt / VaultSheets.kt / VaultDataPanel.kt / VaultUi.kt / VaultCharts.kt
android/app/src/main/res/xml/  backup rules and FileProvider paths
src/                           legacy React source (reference only; not bundled)
```

## Notes and limits

- The native app is local-only. Firestore sync from the legacy web source is not part of the APK.
- Currency is a display setting; there is no FX conversion.
- This is a single-user ledger by design: there are no shared/household spaces.
- In-place APK updates require the original signing key and keep the `com.vaulty.app` package name. Uninstalling
  the app deletes the local ledger, so export a JSON backup first if you must reinstall.
