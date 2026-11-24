import { useMemo, useState } from 'react';
import Icon from '../components/Icon';
import Select from '../components/Select';
import TransactionRow from '../components/TransactionRow';
import { ALL_CATEGORIES } from '../lib/constants';
import { downloadFile, toCsv } from '../lib/download';
import { formatMoney, formatMonthLabel } from '../lib/format';
import { toast } from '../lib/toast';
import type { TxType } from '../lib/types';
import { useVault } from '../store/VaultContext';
import { useUI } from '../ui/UIContext';

type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';

export function ActivityView() {
  const { state, deleteTransaction } = useVault();
  const { confirm, openSheet } = useUI();

  const [search, setSearch] = useState('');
  const [type, setType] = useState<'all' | TxType>('all');
  const [accountId, setAccountId] = useState('all');
  const [category, setCategory] = useState('all');
  const [period, setPeriod] = useState<'activeMonth' | 'all'>('activeMonth');
  const [sort, setSort] = useState<SortKey>('date_desc');

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return state.transactions
      .filter((tx) => {
        if (period === 'activeMonth' && (!tx.date || !tx.date.startsWith(state.activeMonth))) return false;
        if (type !== 'all' && tx.type !== type) return false;
        if (accountId !== 'all' && tx.accountId !== accountId && tx.toAccountId !== accountId) return false;
        if (category !== 'all' && tx.category !== category) return false;
        if (query) {
          const haystack = `${tx.description} ${tx.category} ${tx.notes}`.toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sort === 'date_asc') return a.date.localeCompare(b.date);
        if (sort === 'amount_desc') return (Number(b.amount) || 0) - (Number(a.amount) || 0);
        if (sort === 'amount_asc') return (Number(a.amount) || 0) - (Number(b.amount) || 0);
        return b.date.localeCompare(a.date) || b.id.localeCompare(a.id);
      });
  }, [state.transactions, state.activeMonth, search, type, accountId, category, period, sort]);

  const inflow = filtered.filter((tx) => tx.type === 'income').reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const outflow = filtered.filter((tx) => tx.type === 'expense').reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

  const exportCsv = () => {
    const rows = filtered.map((tx) => [
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

  return (
    <div className="space-y-4 p-4">
      <section className="space-y-2.5">
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search merchant, category, notes..."
            className="h-10 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-800 dark:bg-slate-900"
          />
        </div>

        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {(['all', 'expense', 'income', 'transfer'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setType(option)}
              className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                type === option
                  ? 'bg-emerald-600 text-white'
                  : 'border border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Select
            value={period}
            onChange={(value) => setPeriod(value as 'activeMonth' | 'all')}
            ariaLabel="Filter by period"
            variant="compact"
            className="w-full bg-white dark:bg-slate-900"
            options={[
              { value: 'activeMonth', label: formatMonthLabel(state.activeMonth) },
              { value: 'all', label: 'All Time' },
            ]}
          />
          <Select
            value={accountId}
            onChange={setAccountId}
            ariaLabel="Filter by account"
            variant="compact"
            className="w-full bg-white dark:bg-slate-900"
            options={[
              { value: 'all', label: 'All Accounts' },
              ...state.accounts.map((account) => ({ value: account.id, label: account.name })),
            ]}
          />
          <Select
            value={category}
            onChange={setCategory}
            ariaLabel="Filter by category"
            variant="compact"
            className="w-full bg-white dark:bg-slate-900"
            options={[
              { value: 'all', label: 'All Categories' },
              ...ALL_CATEGORIES.map((option) => ({ value: option, label: option })),
            ]}
          />
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-[11px] dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              +{formatMoney(inflow, state.currency)}
            </span>
            <span className="font-bold tabular-nums text-rose-600 dark:text-rose-400">
              -{formatMoney(outflow, state.currency)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={sort}
              onChange={(value) => setSort(value as SortKey)}
              ariaLabel="Sort transactions"
              variant="bare"
              align="right"
              options={[
                { value: 'date_desc', label: 'Newest' },
                { value: 'date_asc', label: 'Oldest' },
                { value: 'amount_desc', label: 'Highest' },
                { value: 'amount_asc', label: 'Lowest' },
              ]}
            />
            <button
              type="button"
              onClick={() => openSheet({ kind: 'insights' })}
              className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 font-semibold text-white active:scale-95"
            >
              <Icon name="pie-chart" className="h-3 w-3" />
              <span>Insights</span>
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 active:scale-95 dark:bg-slate-800 dark:text-slate-200"
            >
              <Icon name="download" className="h-3 w-3" />
              <span>CSV</span>
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200/80 bg-white px-4 py-1 dark:border-slate-800 dark:bg-slate-900">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <Icon name="receipt" className="mx-auto mb-2 h-9 w-9 opacity-40" />
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No matching activity</p>
            <p className="mt-1 text-xs">Adjust filters or tap + to log a transaction.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((tx) => (
              <TransactionRow
                key={tx.id}
                tx={tx}
                accounts={state.accounts}
                currency={state.currency}
                onEdit={() => openSheet({ kind: 'tx', id: tx.id })}
                onDelete={() =>
                  confirm({
                    title: 'Delete Transaction?',
                    message: 'Remove this transaction and recalculate your balance?',
                    confirmLabel: 'Delete',
                    onConfirm: () => deleteTransaction(tx.id),
                  })
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default ActivityView;
