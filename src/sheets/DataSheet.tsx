import { useRef, useState } from 'react';
import { Switch } from '../components/Field';
import Icon from '../components/Icon';
import Sheet from '../components/Sheet';
import { downloadFile, toCsv } from '../lib/download';
import { notificationPermission, notificationsSupported, requestNotificationPermission } from '../lib/notifications';
import { toast } from '../lib/toast';
import { useVault } from '../store/VaultContext';
import { useUI } from '../ui/UIContext';

export function DataSheet({ onClose }: { onClose: () => void }) {
  const { state, sync, importState, startFresh, restoreSample, updateSettings } = useVault();
  const { confirm } = useUI();
  const fileRef = useRef<HTMLInputElement>(null);
  const [permission, setPermission] = useState(notificationPermission());

  const toggleNotifications = async (next: boolean) => {
    if (!next) {
      updateSettings({ notificationsEnabled: false });
      return;
    }
    const granted = await requestNotificationPermission();
    setPermission(notificationPermission());
    updateSettings({ notificationsEnabled: granted });
    if (!granted) toast('Notifications are blocked in this browser.', 'error');
  };

  const notificationStatus = !notificationsSupported()
    ? 'Notifications are not supported in this browser.'
    : permission === 'denied'
      ? 'Blocked — allow notifications for this site in your browser settings.'
      : state.notificationsEnabled
        ? 'On. Budget alerts, due bills and your daily check-in fire while Vaulty is open.'
        : 'Get budget alerts, due-bill reminders and a daily check-in while Vaulty is open.';

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
          <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2 dark:bg-slate-900">
            <span className="text-[11px] font-semibold">Daily check-in</span>
            <select
              value={state.reminderHour}
              disabled={!state.notificationsEnabled}
              onChange={(event) => updateSettings({ reminderHour: Number(event.target.value) })}
              aria-label="Daily reminder time"
              className="bg-transparent text-[11px] font-semibold text-slate-600 focus:outline-none disabled:opacity-40 dark:text-slate-300"
            >
              {Array.from({ length: 24 }, (_, hour) => hour).map((hour) => (
                <option key={hour} value={hour}>
                  {hourLabel(hour)}
                </option>
              ))}
            </select>
          </div>
        </section>

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
