import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './components/Icon';
import Toasts from './components/Toasts';
import { CURRENCIES, CURRENCY_CODES } from './lib/constants';
import { formatMoney, formatMonthLabel } from './lib/format';
import { checkNotifications } from './lib/notifications';
import { toast } from './lib/toast';
import { autoCheckForUpdates, downloadAndInstall, useUpdateState } from './lib/updater';
import type { CurrencyCode, PlanTab, ViewName } from './lib/types';
import SheetHost from './sheets/SheetHost';
import { useVault, VaultProvider } from './store/VaultContext';
import { UIContext, type SheetState, type UIActions } from './ui/UIContext';
import AccountsView from './views/AccountsView';
import ActivityView from './views/ActivityView';
import OverviewView from './views/OverviewView';
import PlanView from './views/PlanView';

const NAV_ITEMS: { view: ViewName; label: string; icon: string }[] = [
  { view: 'overview', label: 'Home', icon: 'home' },
  { view: 'transactions', label: 'Activity', icon: 'receipt' },
  { view: 'accounts', label: 'Accounts', icon: 'landmark' },
  { view: 'plan', label: 'Plan', icon: 'pie-chart' },
];

function Shell() {
  const {
    state,
    balances,
    sync,
    setCurrency,
    toggleTheme,
    shiftActiveMonth,
    dismissDemoBanner,
    startFresh,
  } = useVault();

  const [view, setView] = useState<ViewName>('overview');
  const [planTab, setPlanTab] = useState<PlanTab>('budgets');
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const update = useUpdateState();

  const netWorthValue = Object.values(balances).reduce((sum, value) => sum + value, 0);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [view, planTab]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSheet(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  /* Android app: look for a new APK at launch (throttled) and install it when auto-update is on. */
  useEffect(() => {
    void autoCheckForUpdates(state.autoUpdate);
  }, [state.autoUpdate]);

  /* Local alerts for budgets, bills and the daily check-in. */
  useEffect(() => {
    if (!state.notificationsEnabled) return;
    checkNotifications(state);
    const timer = window.setInterval(() => checkNotifications(state), 60_000);
    return () => window.clearInterval(timer);
  }, [state]);

  const ui: UIActions = useMemo(
    () => ({
      view,
      setView,
      planTab,
      setPlanTab,
      goToPlan: (tab: PlanTab) => {
        setPlanTab(tab);
        setView('plan');
      },
      openSheet: (next: SheetState) => setSheet(next),
      closeSheet: () => setSheet(null),
      confirm: (options) => setSheet({ kind: 'confirm', ...options }),
    }),
    [view, planTab],
  );

  const titles: Record<ViewName, string> = {
    overview: 'Vaulty',
    transactions: 'Activity',
    accounts: 'Accounts',
    plan: planTab === 'budgets' ? 'Budgets' : planTab === 'goals' ? 'Savings Goals' : 'Recurring',
  };

  const openTransaction = () => {
    if (state.accounts.length === 0) {
      toast('Create an account first.', 'error');
      setSheet({ kind: 'account' });
      return;
    }
    setSheet({ kind: 'tx', defaultType: 'expense' });
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center sm:px-3 sm:py-4">
      <div
        id="appShell"
        className="relative mx-auto flex h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-slate-50 dark:bg-slate-950 sm:h-[min(820px,calc(100vh-2rem))] sm:rounded-[2.4rem] sm:border-[6px] sm:border-slate-900 sm:shadow-2xl sm:shadow-slate-900/20 dark:sm:border-slate-800"
      >
        <header className="z-20 shrink-0 border-b border-slate-200/80 bg-white/95 px-4 pb-2.5 pt-3 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-500/30">
                <Icon name="wallet" className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold leading-tight tracking-tight">{titles[view]}</h1>
                <div className="truncate text-[11px] font-medium leading-tight text-slate-500 dark:text-slate-400">
                  Net worth: {formatMoney(netWorthValue, state.currency)}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSheet({ kind: 'assistant' })}
                aria-label="Voice assistant"
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-500/30 transition-transform active:scale-95"
              >
                <Icon name="mic" className="h-4 w-4" />
              </button>

              <select
                value={state.currency}
                onChange={(event) => {
                  setCurrency(event.target.value as CurrencyCode);
                  toast(`Currency: ${event.target.value}`);
                }}
                aria-label="Select currency"
                className="h-8 rounded-xl border border-slate-200/70 bg-slate-100 px-2 text-[11px] font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-200"
              >
                {CURRENCY_CODES.map((code) => (
                  <option key={code} value={code}>
                    {CURRENCIES[code].code}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={toggleTheme}
                aria-label="Toggle dark mode"
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/70 bg-slate-100 text-slate-600 transition-transform active:scale-95 dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-300"
              >
                <Icon name={state.theme === 'dark' ? 'sun' : 'moon'} className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => setSheet({ kind: 'data' })}
                aria-label="Backup, export and reset"
                className="relative flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/70 bg-slate-100 text-slate-600 transition-transform active:scale-95 dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-300"
              >
                <Icon name="sliders-horizontal" className="h-4 w-4" />
                {sync.mode === 'firebase' && sync.status === 'connected' ? (
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                ) : null}
              </button>
            </div>
          </div>

          <div className="mt-2.5 flex items-center justify-between rounded-xl bg-slate-100/90 p-1 dark:bg-slate-800/80">
            <button
              type="button"
              onClick={() => shiftActiveMonth(-1)}
              aria-label="Previous month"
              className="flex h-7 w-8 items-center justify-center rounded-lg text-slate-600 transition-all hover:bg-white active:scale-95 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <Icon name="chevron-left" className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-1.5">
              <Icon name="calendar" className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-bold tabular-nums">{formatMonthLabel(state.activeMonth)}</span>
            </div>
            <button
              type="button"
              onClick={() => shiftActiveMonth(1)}
              aria-label="Next month"
              className="flex h-7 w-8 items-center justify-center rounded-lg text-slate-600 transition-all hover:bg-white active:scale-95 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <Icon name="chevron-right" className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="no-scrollbar flex-1 overflow-y-auto pb-28">
          {state.isDemoData && !state.demoBannerDismissed ? (
            <div className="mx-4 mt-3 flex items-center justify-between gap-2 rounded-2xl border border-emerald-200/80 bg-emerald-50 px-3.5 py-2.5 text-[11px] text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-200">
              <div className="flex min-w-0 items-center gap-2">
                <Icon name="sparkles" className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="leading-snug">
                  Demo data loaded. Tap <strong>Start Fresh</strong> when ready.
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    ui.confirm({
                      title: 'Start Fresh?',
                      message:
                        'Clear all transactions, budgets and goals and start with a clean Bank Account and Cash Wallet at 0?',
                      confirmLabel: 'Clear All',
                      onConfirm: startFresh,
                    })
                  }
                  className="rounded-lg bg-emerald-600 px-2.5 py-1 font-semibold text-white transition-transform active:scale-95"
                >
                  Start Fresh
                </button>
                <button
                  type="button"
                  onClick={dismissDemoBanner}
                  aria-label="Dismiss notice"
                  className="rounded-lg p-1 text-emerald-700 dark:text-emerald-300"
                >
                  <Icon name="x" className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : null}

          {update.status === 'available' || update.status === 'downloading' || update.status === 'ready' ? (
            <div className="mx-4 mt-3 flex items-center justify-between gap-2 rounded-2xl border border-emerald-200/80 bg-white px-3.5 py-2.5 text-[11px] shadow-sm dark:border-emerald-800/60 dark:bg-slate-900">
              <div className="flex min-w-0 items-center gap-2">
                <Icon name="download" className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="leading-snug text-slate-700 dark:text-slate-200">
                  {update.status === 'downloading'
                    ? `Downloading Vaulty ${update.info?.version ?? ''} — ${update.percent}%`
                    : update.status === 'ready'
                      ? `Vaulty ${update.info?.version ?? ''} is ready to install`
                      : `Vaulty ${update.info?.version ?? ''} is available`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void downloadAndInstall()}
                disabled={update.status === 'downloading'}
                className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1 font-semibold text-white transition-transform active:scale-95 disabled:opacity-60"
              >
                {update.status === 'downloading' ? '…' : 'Install'}
              </button>
            </div>
          ) : null}

          <UIContext.Provider value={ui}>
            <main>
              {view === 'overview' ? <OverviewView /> : null}
              {view === 'transactions' ? <ActivityView /> : null}
              {view === 'accounts' ? <AccountsView /> : null}
              {view === 'plan' ? <PlanView /> : null}
            </main>
          </UIContext.Provider>
        </div>

        <nav
          aria-label="Mobile navigation"
          className="absolute inset-x-0 bottom-0 z-30 shrink-0 border-t border-slate-200/80 bg-white/95 px-2 pb-2.5 pt-1.5 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95"
        >
          <div className="grid grid-cols-5 items-end">
            {NAV_ITEMS.slice(0, 2).map((item) => (
              <button
                key={item.view}
                type="button"
                onClick={() => setView(item.view)}
                className={`nav-btn flex flex-col items-center justify-center gap-0.5 py-1 transition-colors ${
                  view === item.view ? 'tab-active' : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                <Icon name={item.icon} className="h-5 w-5" />
                <span className="text-[10px] font-semibold">{item.label}</span>
              </button>
            ))}

            <div className="-mt-6 flex flex-col items-center justify-center">
              <button
                type="button"
                onClick={openTransaction}
                aria-label="Add transaction"
                className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-600/35 ring-4 ring-slate-50 transition-transform active:scale-95 dark:ring-slate-950"
              >
                <Icon name="plus" className="h-6 w-6" />
              </button>
            </div>

            {NAV_ITEMS.slice(2).map((item) => (
              <button
                key={item.view}
                type="button"
                onClick={() => setView(item.view)}
                className={`nav-btn flex flex-col items-center justify-center gap-0.5 py-1 transition-colors ${
                  view === item.view ? 'tab-active' : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                <Icon name={item.icon} className="h-5 w-5" />
                <span className="text-[10px] font-semibold">{item.label}</span>
              </button>
            ))}
          </div>
        </nav>

        <UIContext.Provider value={ui}>
          <SheetHost sheet={sheet} onClose={() => setSheet(null)} />
        </UIContext.Provider>
        <Toasts />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <VaultProvider>
      <Shell />
    </VaultProvider>
  );
}
