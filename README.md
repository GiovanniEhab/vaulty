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
- **Settings & data** — JSON backup / restore, CSV export, start fresh, restore sample data, live cloud-sync status.
- Light/dark theme, six currencies, month switching, demo data you can clear in one tap.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # typecheck + production build into dist/
```

Dependencies are pinned in `package-lock.json`; use `npm ci` for a clean install.

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
