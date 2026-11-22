import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { computeBalances } from '../lib/calc';
import { dateInMonth, makeId, todayISO } from '../lib/format';
import { connectFirebase, LocalRepo, pickSettings, type Repo, type SyncInfo } from '../lib/repo';
import { emptyState, normalizeState, sampleState } from '../lib/seed';
import { toast } from '../lib/toast';
import type {
  Account,
  Budget,
  CollectionName,
  CurrencyCode,
  Goal,
  Recurring,
  Settings,
  Theme,
  Transaction,
  VaultState,
} from '../lib/types';

const STORAGE_KEY = 'vaulty_state_v1';

function readLocal(): VaultState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeState(JSON.parse(raw), sampleState());
  } catch {
    return null;
  }
}

function writeLocal(state: VaultState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked — the app still works in memory */
  }
}

export interface VaultStore {
  state: VaultState;
  sync: SyncInfo;
  balances: Record<string, number>;
  setCurrency: (currency: CurrencyCode) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setActiveMonth: (month: string) => void;
  shiftActiveMonth: (delta: number) => void;
  dismissDemoBanner: () => void;
  startFresh: () => void;
  restoreSample: () => void;
  importState: (data: unknown) => boolean;
  saveTransaction: (tx: Transaction) => void;
  deleteTransaction: (id: string) => void;
  saveAccount: (account: Account) => void;
  deleteAccount: (id: string) => void;
  saveBudget: (budget: Budget) => void;
  deleteBudget: (id: string) => void;
  saveGoal: (goal: Goal) => void;
  deleteGoal: (id: string) => void;
  contributeToGoal: (id: string, delta: number) => void;
  saveRecurring: (item: Recurring) => void;
  deleteRecurring: (id: string) => void;
  logRecurring: (id: string) => void;
}

const VaultContext = createContext<VaultStore | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<VaultState>(() => readLocal() ?? sampleState());
  const [sync, setSync] = useState<SyncInfo>({
    mode: 'local',
    status: 'local',
    uid: null,
    projectId: null,
    message: 'Saved on this device only',
  });

  const repoRef = useRef<Repo>(new LocalRepo());
  const stateRef = useRef(state);
  stateRef.current = state;

  /* Local persistence on every change. */
  useEffect(() => {
    writeLocal(state);
  }, [state]);

  /* Dark mode class on <html>. */
  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.theme === 'dark');
  }, [state.theme]);

  /* Connect to Firestore once, then subscribe to the ledgers. */
  useEffect(() => {
    let alive = true;
    let unsubscribe: (() => void) | undefined;

    (async () => {
      try {
        const repo = await connectFirebase();
        if (!alive) return;
        if (!repo) return;
        repoRef.current = repo;
        setSync(repo.info);
        unsubscribe = repo.subscribe(
          (patch) => {
            setState((prev) => {
              const next = { ...prev };
              (Object.keys(patch) as (keyof VaultState)[]).forEach((key) => {
                const value = patch[key];
                if (value !== undefined) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (next as any)[key] = value;
                }
              });
              return next;
            });
          },
          (message) => {
            setSync((prev) => ({ ...prev, status: 'error', message }));
            toast(`Firestore: ${message}`, 'error');
          },
        );
        await repo.seedIfEmpty(stateRef.current);
      } catch (error) {
        if (!alive) return;
        const message = error instanceof Error ? error.message : 'Could not reach Firebase.';
        setSync({ mode: 'local', status: 'error', uid: null, projectId: null, message });
        toast(message, 'error');
      }
    })();

    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, []);

  /* Debounced push of preferences (currency, theme, month, demo flags). */
  const settingsKey = JSON.stringify(pickSettings(state));
  useEffect(() => {
    const repo = repoRef.current;
    if (repo.info.mode !== 'firebase') return;
    const settings: Settings = JSON.parse(settingsKey);
    const timer = setTimeout(() => {
      repo.putSettings(settings).catch((error: unknown) => {
        toast(`Could not save settings: ${(error as Error).message}`, 'error');
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [settingsKey]);

  const put = useCallback(<K extends CollectionName>(col: K, item: VaultState[K][number]) => {
    repoRef.current.put(col, item as { id: string }).catch((error: unknown) => {
      toast(`Cloud save failed: ${(error as Error).message}`, 'error');
    });
  }, []);

  const remove = useCallback((col: CollectionName, id: string) => {
    repoRef.current.remove(col, id).catch((error: unknown) => {
      toast(`Cloud delete failed: ${(error as Error).message}`, 'error');
    });
  }, []);

  const removeMany = useCallback((col: CollectionName, ids: string[]) => {
    repoRef.current.removeMany(col, ids).catch((error: unknown) => {
      toast(`Cloud delete failed: ${(error as Error).message}`, 'error');
    });
  }, []);

  const replaceAll = useCallback((next: VaultState) => {
    repoRef.current.replaceAll(next).catch((error: unknown) => {
      toast(`Cloud reset failed: ${(error as Error).message}`, 'error');
    });
  }, []);

  const patchSettings = useCallback((patch: Partial<Settings>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const store = useMemo<VaultStore>(() => {
    const balances = computeBalances(state.accounts, state.transactions);

    return {
      state,
      sync,
      balances,
      setCurrency: (currency) => patchSettings({ currency }),
      setTheme: (theme) => patchSettings({ theme }),
      toggleTheme: () => patchSettings({ theme: state.theme === 'dark' ? 'light' : 'dark' }),
      setActiveMonth: (activeMonth) => patchSettings({ activeMonth }),
      shiftActiveMonth: (delta) => {
        const [year, month] = state.activeMonth.split('-').map(Number);
        const d = new Date(year, (month || 1) - 1 + delta, 1);
        patchSettings({ activeMonth: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` });
      },
      dismissDemoBanner: () => patchSettings({ demoBannerDismissed: true }),

      startFresh: () => {
        const next = emptyState(state.currency, state.theme);
        setState(next);
        replaceAll(next);
        toast('Ready for your own numbers!');
      },
      restoreSample: () => {
        const next = sampleState(state.currency, state.theme);
        setState(next);
        replaceAll(next);
        toast('Sample data restored');
      },
      importState: (data) => {
        const normalized = normalizeState(data, state);
        if (!normalized) return false;
        setState(normalized);
        replaceAll(normalized);
        toast('Backup restored');
        return true;
      },

      saveTransaction: (tx) => {
        const exists = state.transactions.some((t) => t.id === tx.id);
        setState((prev) => ({
          ...prev,
          transactions: exists
            ? prev.transactions.map((t) => (t.id === tx.id ? tx : t))
            : [...prev.transactions, tx],
        }));
        put('transactions', tx);
        toast(exists ? 'Transaction updated' : 'Transaction saved');
      },
      deleteTransaction: (id) => {
        setState((prev) => ({ ...prev, transactions: prev.transactions.filter((t) => t.id !== id) }));
        remove('transactions', id);
        toast('Transaction deleted');
      },

      saveAccount: (account) => {
        const exists = state.accounts.some((a) => a.id === account.id);
        setState((prev) => ({
          ...prev,
          accounts: exists ? prev.accounts.map((a) => (a.id === account.id ? account : a)) : [...prev.accounts, account],
        }));
        put('accounts', account);
        toast(exists ? 'Account updated' : 'Account created');
      },
      deleteAccount: (id) => {
        const orphanIds = state.transactions.filter((t) => t.accountId === id || t.toAccountId === id).map((t) => t.id);
        setState((prev) => ({
          ...prev,
          accounts: prev.accounts.filter((a) => a.id !== id),
          transactions: prev.transactions.filter((t) => t.accountId !== id && t.toAccountId !== id),
          recurring: prev.recurring.filter((r) => r.accountId !== id),
        }));
        remove('accounts', id);
        if (orphanIds.length) removeMany('transactions', orphanIds);
        toast('Account deleted');
      },

      saveBudget: (budget) => {
        const exists = state.budgets.some((b) => b.id === budget.id);
        setState((prev) => ({
          ...prev,
          budgets: exists ? prev.budgets.map((b) => (b.id === budget.id ? budget : b)) : [...prev.budgets, budget],
        }));
        put('budgets', budget);
        toast(exists ? 'Budget updated' : 'Budget saved');
      },
      deleteBudget: (id) => {
        setState((prev) => ({ ...prev, budgets: prev.budgets.filter((b) => b.id !== id) }));
        remove('budgets', id);
        toast('Budget removed');
      },

      saveGoal: (goal) => {
        const exists = state.goals.some((g) => g.id === goal.id);
        setState((prev) => ({
          ...prev,
          goals: exists ? prev.goals.map((g) => (g.id === goal.id ? goal : g)) : [...prev.goals, goal],
        }));
        put('goals', goal);
        toast(exists ? 'Goal updated' : 'Goal created');
      },
      deleteGoal: (id) => {
        setState((prev) => ({ ...prev, goals: prev.goals.filter((g) => g.id !== id) }));
        remove('goals', id);
        toast('Goal deleted');
      },
      contributeToGoal: (id, delta) => {
        const goal = state.goals.find((g) => g.id === id);
        if (!goal) return;
        const next: Goal = { ...goal, current: Math.max(0, (Number(goal.current) || 0) + delta) };
        setState((prev) => ({ ...prev, goals: prev.goals.map((g) => (g.id === id ? next : g)) }));
        put('goals', next);
        toast(`Updated "${goal.name}"`);
      },

      saveRecurring: (item) => {
        setState((prev) => ({ ...prev, recurring: [...prev.recurring, item] }));
        put('recurring', item);
        toast('Recurring item added');
      },
      deleteRecurring: (id) => {
        setState((prev) => ({ ...prev, recurring: prev.recurring.filter((r) => r.id !== id) }));
        remove('recurring', id);
        toast('Recurring item removed');
      },
      logRecurring: (id) => {
        const item = state.recurring.find((r) => r.id === id);
        if (!item) return;
        const tx: Transaction = {
          id: makeId('tx'),
          type: item.type,
          amount: item.amount,
          date: dateInMonth(state.activeMonth, item.dayOfMonth),
          accountId: item.accountId,
          toAccountId: null,
          category: item.category,
          description: item.title,
          notes: 'Logged from recurring schedule',
        };
        const updated: Recurring = { ...item, lastLoggedMonth: state.activeMonth };
        setState((prev) => ({
          ...prev,
          transactions: [...prev.transactions, tx],
          recurring: prev.recurring.map((r) => (r.id === id ? updated : r)),
        }));
        put('transactions', tx);
        put('recurring', updated);
        toast(`Logged "${item.title}"`);
      },
    };
  }, [state, sync, patchSettings, put, remove, removeMany, replaceAll]);

  return <VaultContext.Provider value={store}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultStore {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error('useVault must be used inside <VaultProvider>');
  return ctx;
}

/**
 * Context-free helpers for the CSV export in the activity screen.
 */
export function accountName(accounts: Account[], id: string | null): string {
  if (!id) return '';
  return accounts.find((a) => a.id === id)?.name ?? '';
}

export function today(): string {
  return todayISO();
}
