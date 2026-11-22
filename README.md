# Vaulty

A mobile-first personal money manager: accounts, transactions, budgets, savings goals and recurring bills.
Install it on your phone (PWA) or run it in the browser. Data lives on the device first and — once you plug in
your own Firebase project — syncs to **your** Firestore database.

Built with React + TypeScript + Vite, Tailwind CSS, Chart.js and the Firebase Web SDK.

## Features

- **Home** — net worth, monthly income/expenses, savings rate, wallets carousel, spending breakdown doughnut,
  6-month cash-flow chart, budget pulse, recent activity.
- **Activity** — full-text search, type/account/category/month filters, sorting, running in/out totals, CSV export,
  tap a row to edit, delete with confirmation.
- **Accounts** — checking / cash / savings / credit accounts with opening balances, assets vs liabilities,
  transfers between accounts, edit and delete.
- **Plan** — category budgets with progress bars, savings goals with contributions, recurring bills you can log
  into the ledger for the active month.
- **Vaulty Assistant** — speak or type a command to log money, set budgets, fund goals, change settings or ask
  questions. Answers can be read aloud.
- **Widgets** — configurable cards on the home screen (net worth, monthly spend, top budget, top goal, assistant).
- **Notifications** — budget alerts at 90% and over-limit, due-bill reminders and a daily check-in at an hour you pick.
- **Settings & data** — JSON backup / restore, CSV export, start fresh, restore sample data, live cloud-sync status.
- Light/dark theme, six currencies, month switching, demo data you can clear in one tap.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # typecheck + production build into dist/
```

Dependencies are pinned in `package-lock.json`; use `npm ci` for a clean install.

## Android APK

A Capacitor 6 shell in `android/` loads the built web app in a WebView. A prebuilt debug APK is at
`releases/vaulty-1.0-debug.apk` (package `com.vaulty.app`, version 1.0, minSdk 22, debug-signed so it installs
directly).

```bash
adb install -r releases/vaulty-1.0-debug.apk
```

Or copy the file to the phone, open it, and allow installing from unknown sources.

Rebuild it (needs JDK 17 and Android SDK platform 34 + build-tools 34.0.0):

```bash
npm install
npm run android:sync        # build the web app and copy it into android/
cd android
./gradlew assembleDebug     # → app/build/outputs/apk/debug/app-debug.apk
```

Point Gradle at your SDK with `ANDROID_HOME` or a line `sdk.dir=/path/to/Android/sdk` in
`android/local.properties`. `npm run android:apk` does the sync and build in one step once those are set.

For a Play Store build, create a keystore, add a `signingConfigs.release` block to
`android/app/build.gradle`, and run `./gradlew bundleRelease` (`.aab`).

**WebView notes:** Android WebView does not implement the Web Speech API, so the assistant's microphone reports
“not supported” inside the APK — typed commands work exactly the same. Web Notifications are also unavailable in
WebView, so the notification toggle reports that it is unsupported. Firebase works because the JS SDK talks to
Firestore directly; `google-services.json` is not needed (no native FCM). After changing web code, rebuild and run
`npx cap sync android`, or the APK keeps the old assets. The launcher icon is still Capacitor's default.

## Vaulty Assistant

Tap the microphone in the header (or the Assistant widget) and talk, or type the same sentence in the sheet.

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

Speech input uses the Web Speech API, so it needs Chrome, Edge or Safari plus microphone permission; every command
also works by typing, which is the fallback everywhere else. Replies are spoken with `speechSynthesis` while
**Speak replies** is on. The parser lives in `src/lib/assistant.ts` and returns a plan (`transaction`, `budget`,
`goal`, `settings`, `navigate`, `delete`, `answer`) that the sheet executes through the normal store actions.

## Widgets

Home shows a horizontal strip of widgets. Tap **Edit** on the strip to choose which ones appear. The selection is
saved with your other settings (`widgetIds`), so it follows you to Firestore. These are in-app widgets — a real
OS home-screen widget needs a native wrapper (Capacitor/React Native); this app is a web PWA.

## Notifications

Enable them in **Settings & Data → Notifications** and allow the browser prompt. Vaulty then raises local
notifications for:

- a category budget reaching 90% or going over its limit,
- a recurring bill due this month that has not been logged yet,
- a daily check-in at the hour you choose.

Each alert fires at most once per item per month (tracked in `localStorage`). They are **local only**: they need
Vaulty open in a tab, because there is no push server or service worker behind them. Background push would need a
backend (for example FCM plus a scheduler).

## Connect your own Firebase database

The app runs without Firebase (localStorage only). To sync it to your account:

1. Open the [Firebase console](https://console.firebase.google.com) and create a project.
2. **Build → Firestore Database → Create database**, pick a region, start in production mode.
3. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable.**
   (Vaulty signs in anonymously so there is no login screen; the rules still isolate your data.)
4. **Project settings → Your apps → Web app (`</>`)** — register an app and copy the `firebaseConfig` values.
5. Create your env file and paste the values:

   ```bash
   cp .env.example .env
   ```

   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   ```

   These values are public identifiers, not secrets — access is controlled by `firestore.rules`.

6. Deploy the security rules (only you can read/write your documents):

   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add          # choose your project, alias "default"
   npm run firebase:deploy:rules
   ```

7. Restart `npm run dev`. Open the sliders icon → **Settings & Data**: it should read
   “Firebase Firestore — connected” with your project id.

### Firestore layout

```
users/{uid}                     currency, theme, activeMonth, demo flags
users/{uid}/accounts/{id}       { name, type, initialBalance, color }
users/{uid}/transactions/{id}   { type, amount, date, accountId, toAccountId, category, description, notes }
users/{uid}/budgets/{id}        { category, limit }
users/{uid}/goals/{id}          { name, target, current, deadline, color }
users/{uid}/recurring/{id}      { title, type, amount, dayOfMonth, accountId, category, lastLoggedMonth }
```

Writes go straight to Firestore and five live listeners keep every screen in sync. Without config, the same
data model is persisted to localStorage under `vaulty_state_v1`, so nothing is lost if you add Firebase later —
the first connection seeds the empty database with what is on the device.

Rules (`firestore.rules`) allow a user to touch only `users/{their-uid}/**`.

### Optional: local emulators

```bash
firebase emulators:start --only firestore,auth
```

Point the app at the emulator by adding `connectFirestoreEmulator`/`connectAuthEmulator` calls in
`src/lib/repo.ts` during development.

## Publish to GitHub

The repo has an initial commit; push it to your account:

```bash
gh repo create vaulty --private --source=. --remote=origin --push
# or, with an existing empty repo:
git remote add origin git@github.com:<you>/vaulty.git
git push -u origin main
```

`.env` is gitignored — keep your project config out of the repo and set it wherever you deploy.

## Project structure

```
src/
  lib/        types, constants, money math, seed data, Firebase repo, helpers
  store/      VaultContext — all CRUD actions, local persistence, cloud writes
  ui/         navigation + sheet context
  components/ header pieces, bottom nav, transaction row, form controls, toasts
  sheets/     add/edit sheets for transactions, accounts, budgets, goals, bills, data
  views/      Home, Activity, Accounts, Plan
firestore.rules / firestore.indexes.json / firebase.json
```

## Notes and limits

- Anonymous auth is per browser profile. Opening the deployed site on a **new** device creates a new anonymous
  user with its own ledger. Add email/password (or Google) sign-in if you want the same ledger on several devices.
- This is a single-user ledger by design: there are no shared/household spaces.
- Currency is a display setting; there is no FX conversion.
- Voice input depends on browser support and microphone permission; typing always works.
- Widgets are in-app cards, and notifications are local while the app is open (see the sections above).
