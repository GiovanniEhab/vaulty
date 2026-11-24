import { useEffect, useRef, useState } from 'react';
import { Switch } from '../components/Field';
import Icon from '../components/Icon';
import Select from '../components/Select';
import Sheet from '../components/Sheet';
import { downloadFile, toCsv } from '../lib/download';
import {
  exactAlarmPermission,
  notificationPermission,
  notificationsSupported,
  requestExactAlarmAccess,
  requestNotificationPermission,
  sendTestNotification,
  type NotificationPermissionState,
} from '../lib/notifications';
import { toast } from '../lib/toast';
import { checkForUpdates, downloadAndInstall, isAndroidApp, useUpdateState } from '../lib/updater';
import { useVault } from '../store/VaultContext';
import { useUI } from '../ui/UIContext';

function UpdateSection() {
  const { state, updateSettings } = useVault();
  const update = useUpdateState();
  const android = isAndroidApp();
  const busy = update.status === 'checking' || update.status === 'downloading';
  const canInstall = android && !busy && (update.status === 'available' || update.status === 'ready');

  return (
    <section className="space-y-2.5 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/70">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon name="download" className="h-4 w-4 text-slate-400" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            App Updates
          </span>
        </div>
        <span className="rounded-lg bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          {android ? `v${update.currentVersion || '…'}` : 'web build'}
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
        {android
          ? 'Vaulty checks for a newer APK, downloads it and opens Android’s installer — no GitHub browsing.'
          : 'In-app updates apply to the Android app. This browser build always loads the newest code.'}
      </p>

      {update.status === 'downloading' ? (
        <div className="space-y-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${Math.max(update.percent, 3)}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">Downloading {update.percent}%</p>
        </div>
      ) : null}

      {update.message ? (
        <p
          className={`text-[11px] leading-relaxed ${
            update.status === 'error' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          {update.message}
        </p>
      ) : null}

      {android && update.info?.updateAvailable && update.info.installAllowed === false ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-[10px] leading-relaxed text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          Android requires you to allow <strong>Install unknown apps</strong> for Vaulty once. Tap Install and Vaulty
          opens the right settings screen; your data is kept when the new version installs over this one.
        </p>
      ) : null}

      {update.info?.notes && update.status === 'available' ? (
        <p className="max-h-24 overflow-y-auto whitespace-pre-line rounded-xl bg-white px-3 py-2 text-[10px] leading-relaxed text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          {update.info.notes.slice(0, 600)}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void checkForUpdates()}
          disabled={busy}
          className="h-10 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
        >
          {update.status === 'checking' ? 'Checking…' : 'Check now'}
        </button>
        <button
          type="button"
          onClick={() => void downloadAndInstall()}
          disabled={!canInstall}
          className="h-10 rounded-xl bg-emerald-600 text-xs font-semibold text-white disabled:opacity-40"
        >
          {update.status === 'downloading'
            ? 'Downloading…'
            : update.info?.version
              ? `Install v${update.info.version}`
              : 'Update'}
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 dark:bg-slate-900">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold">Auto-update</div>
          <div className="text-[10px] leading-snug text-slate-500 dark:text-slate-400">
            Download new versions at launch and ask Android to install
          </div>
        </div>
        <Switch checked={state.autoUpdate} label="Auto-update" onChange={(value) => updateSettings({ autoUpdate: value })} />
      </div>
    </section>
  );
}

export function DataSheet({ onClose }: { onClose: () => void }) {
  const { state, sync, importState, startFresh, restoreSample, updateSettings } = useVault();
  const { confirm } = useUI();
  const fileRef = useRef<HTMLInputElement>(null);
  const [permission, setPermission] = useState<NotificationPermissionState>('prompt');
  const [exactAlarm, setExactAlarm] = useState<NotificationPermissionState>('unsupported');
  const nativeAndroid = isAndroidApp();

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void notificationPermission().then((next) => {
        if (alive) setPermission(next);
      });
      void exactAlarmPermission().then((next) => {
        if (alive) setExactAlarm(next);
      });
    };
    refresh();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive = false;
      window.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const toggleNotifications = async (next: boolean) => {
    if (!next) {
      updateSettings({ notificationsEnabled: false });
      return;
    }
    const granted = await requestNotificationPermission();
    const current = await notificationPermission();
    setPermission(current);
    updateSettings({ notificationsEnabled: granted });
    if (!granted) {
      toast(
        current === 'denied'
          ? `Notifications are blocked. Allow them for Vaulty in ${nativeAndroid ? 'Android settings' : 'your browser settings'}.`
          : 'Notifications were not allowed.',
        'error',
      );
    }
  };

  const sendTest = async () => {
    const ok = await sendTestNotification();
    toast(
      ok ? 'Test notification sent — check your notification shade.' : 'Could not send a notification. Check the permission first.',
      ok ? 'default' : 'error',
    );
  };

  const notificationStatus = !notificationsSupported()
    ? 'Notifications are not supported on this device.'
    : permission === 'denied'
      ? `Blocked — allow notifications for Vaulty in ${nativeAndroid ? 'Android settings' : 'your browser settings'}.`
      : state.notificationsEnabled
        ? nativeAndroid
          ? 'On. Bill reminders and your daily check-in are scheduled on this phone, even when Vaulty is closed. Budget alerts fire while it is open.'
          : 'On. Budget alerts, due bills and your daily check-in fire while Vaulty is open.'
        : 'Get budget alerts, bill reminders and a daily check-in.';

  const hourLabel = (hour: number) => `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? 'AM' : 'PM'}`;

  const exportJson = () => {
    downloadFile(`vaulty-backup-${state.activeMonth}.json`, JSON.stringify(state, null, 2), 'application/json');
    toast('JSON backup downloaded');
  };

  const exportCsv = () => {
    const rows = state.transactions.map((tx) => [
      tx.date,
      tx.type,
      tx.description,
      tx.category,
      state.accounts.find((a) => a.id === tx.accountId)?.name ?? '',
      state.accounts.find((a) => a.id === tx.toAccountId)?.name ?? '',
      tx.amount,
      state.currency,
      tx.notes,
    ]);
    downloadFile(
      `vaulty-transactions-${state.activeMonth}.csv`,
      toCsv(['Date', 'Type', 'Description', 'Category', 'Account', 'To Account', 'Amount', 'Currency', 'Notes'], rows),
      'text/csv',
    );
    toast(`Exported ${rows.length} entries to CSV`);
  };

  const handleImport = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!importState(parsed)) throw new Error('Invalid backup');
        onClose();
      } catch {
        toast('Invalid JSON backup file.', 'error');
      }
    };
    reader.readAsText(file);
  };

  const cloudConnected = sync.mode === 'firebase' && sync.status === 'connected';

  return (
    <Sheet title="Settings & Data" onClose={onClose}>
      <div className="space-y-3.5">
        <section className="space-y-2.5 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/70">
          <div className="flex items-center gap-2">
            <Icon
              name={cloudConnected ? 'cloud' : 'cloud-off'}
              className={`h-4 w-4 ${cloudConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}
            />
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Cloud Database
            </span>
          </div>
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            {cloudConnected ? 'Firebase Firestore — connected' : 'On this device only'}
          </p>
          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{sync.message}</p>
          {cloudConnected && sync.projectId ? (
            <div className="space-y-0.5 rounded-xl bg-white px-3 py-2 text-[10px] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <div>
                Project: <span className="font-semibold">{sync.projectId}</span>
              </div>
              <div className="truncate">
                Sync ID: <span className="font-mono">{sync.uid}</span>
              </div>
            </div>
          ) : (
            <p className="rounded-xl bg-white px-3 py-2 text-[10px] leading-relaxed text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              Add your Firebase web config to <span className="font-mono">.env</span> (see README) to sync every change to
              your own Firestore project.
            </p>
          )}
        </section>

        <section className="space-y-2.5 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/70">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Backup &amp; Restore
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={exportJson}
              className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-xs font-semibold text-white"
            >
              <Icon name="download" className="h-3.5 w-3.5" />
              <span>Export JSON</span>
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            >
              <Icon name="upload" className="h-3.5 w-3.5" />
              <span>Import JSON</span>
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => handleImport(event.target.files?.[0])}
          />
          <button
            type="button"
            onClick={exportCsv}
            className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          >
            <Icon name="download" className="h-3.5 w-3.5" />
            <span>Export all transactions (CSV)</span>
          </button>
        </section>

        <section className="space-y-2.5 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/70">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon
                name={state.notificationsEnabled ? 'bell' : 'bell-off'}
                className="h-4 w-4 text-slate-400"
              />
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Notifications
              </span>
            </div>
            <Switch
              checked={state.notificationsEnabled}
              label="Enable notifications"
              onChange={(value) => void toggleNotifications(value)}
            />
          </div>
          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{notificationStatus}</p>
          {state.notificationsEnabled && permission === 'granted' ? (
            <button
              type="button"
              onClick={() => void sendTest()}
              className="h-9 w-full rounded-xl border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 active:scale-[0.99] dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            >
              Send test notification
            </button>
          ) : null}
          {nativeAndroid && state.notificationsEnabled && permission === 'granted' && (exactAlarm === 'denied' || exactAlarm === 'prompt') ? (
            <div className="space-y-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[10px] leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              <p>
                Allow exact timing so the daily check-in and bill reminders arrive at the hour you chose. Otherwise
                Android may deliver them later.
              </p>
              <button
                type="button"
                onClick={() => {
                  void requestExactAlarmAccess().then((granted) => {
                    void exactAlarmPermission().then(setExactAlarm);
                    toast(granted ? 'Exact reminder timing enabled.' : 'Exact timing was not enabled.', granted ? 'default' : 'error');
                  });
                }}
                className="rounded-lg bg-amber-600 px-2.5 py-1 font-semibold text-white"
              >
                Allow exact timing
              </button>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 dark:bg-slate-900">
            <span className="text-[11px] font-semibold">Daily check-in</span>
            <Select
              value={String(state.reminderHour)}
              disabled={!state.notificationsEnabled}
              onChange={(value) => updateSettings({ reminderHour: Number(value) })}
              ariaLabel="Daily reminder time"
              variant="compact"
              align="right"
              options={Array.from({ length: 24 }, (_, hour) => ({ value: String(hour), label: hourLabel(hour) }))}
            />
          </div>
        </section>

        <UpdateSection />

        <section className="space-y-2.5 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/70">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Workspace Reset
          </div>
          <button
            type="button"
            onClick={() =>
              confirm({
                title: 'Start Fresh?',
                message:
                  'Clear all transactions, budgets and goals and start with a clean Bank Account and Cash Wallet at 0?',
                confirmLabel: 'Clear All',
                onConfirm: () => {
                  startFresh();
                  onClose();
                },
              })
            }
            className="h-10 w-full rounded-xl bg-rose-600 text-xs font-semibold text-white"
          >
            Start Fresh (Clear All Data)
          </button>
          <button
            type="button"
            onClick={() => {
              restoreSample();
              onClose();
            }}
            className="h-10 w-full rounded-xl bg-slate-200 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-100"
          >
            Restore Sample Data
          </button>
        </section>
      </div>
    </Sheet>
  );
}

export default DataSheet;
