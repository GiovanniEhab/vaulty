import { useEffect, useRef } from 'react';
import { Chart } from 'chart.js/auto';
import Icon from '../components/Icon';
import TransactionRow from '../components/TransactionRow';
import WidgetStrip from '../components/WidgetStrip';
import { ACCOUNT_TYPES } from '../lib/constants';
import { categoryMeta, monthStats } from '../lib/calc';
import { formatMoney, formatMonthLabel, last6Months } from '../lib/format';
import type { CurrencyCode, Theme } from '../lib/types';
import { useVault } from '../store/VaultContext';
import { useUI } from '../ui/UIContext';

function CategoryChart({ entries, currency, theme }: { entries: [string, number][]; currency: CurrencyCode; theme: Theme }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const key = entries.map(([category, value]) => `${category}:${value}`).join('|');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || entries.length === 0) return;
    const chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: entries.map(([category]) => category),
        datasets: [
          {
            data: entries.map(([, value]) => value),
            backgroundColor: entries.map(([category]) => categoryMeta(category, 'expense').color),
            borderWidth: 2,
            borderColor: theme === 'dark' ? '#0f172a' : '#ffffff',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '64%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: (ctx) => `${ctx.label}: ${formatMoney(Number(ctx.raw), currency)}` },
          },
        },
      },
    });
    return () => chart.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, currency, theme]);

  return <canvas ref={canvasRef} />;
}

function TrendChart({
  labels,
  income,
  expense,
  currency,
  theme,
}: {
  labels: string[];
  income: number[];
  expense: number[];
  currency: CurrencyCode;
  theme: Theme;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const key = `${labels.join(',')}|${income.join(',')}|${expense.join(',')}`;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const isDark = theme === 'dark';
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.2)';

    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Income', data: income, backgroundColor: '#10b981', borderRadius: 5, maxBarThickness: 16 },
          { label: 'Expenses', data: expense, backgroundColor: '#f43f5e', borderRadius: 5, maxBarThickness: 16 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatMoney(Number(ctx.raw), currency)}` },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: textColor, font: { size: 10 } } },
          y: {
            beginAtZero: true,
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { size: 10 },
              maxTicksLimit: 5,
              callback: (value) => (Number(value) >= 1000 ? `${Number(value) / 1000}k` : `${value}`),
            },
          },
        },
      },
    });
    return () => chart.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, currency, theme]);

  return <canvas ref={canvasRef} />;
}

export function OverviewView() {
  const { state, balances } = useVault();
  const { setView, goToPlan, openSheet } = useUI();
  const stats = monthStats(state.transactions, state.activeMonth);
  const monthLabel = formatMonthLabel(state.activeMonth);

  const totalBalance = Object.values(balances).reduce((sum, value) => sum + value, 0);
  const recent = [...state.transactions]
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, 5);

  const topBudgets = state.budgets
    .map((budget) => {
      const spent = stats.byCategory[budget.category] || 0;
      return {
        ...budget,
        spent,
        pct: budget.limit > 0 ? Math.min(100, Math.round((spent / budget.limit) * 100)) : 0,
        over: spent > budget.limit,
      };
    })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3);

  const categoryEntries = Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]);
  const months = last6Months(state.activeMonth);

  return (
    <div className="space-y-4 p-4">
      <section className="rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-600 to-teal-700 p-5 text-white shadow-lg shadow-emerald-600/20">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-emerald-100">Total Balance</span>
          <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold backdrop-blur-sm">
            {stats.savingsRate}% saved
          </span>
        </div>
        <div className="mt-1 text-3xl font-extrabold tabular-nums tracking-tight">
          {formatMoney(totalBalance, state.currency)}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5 border-t border-white/15 pt-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/15">
              <Icon name="arrow-down-left" className="h-4 w-4 text-emerald-100" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-100/80">Income</div>
              <div className="truncate text-sm font-bold tabular-nums">{formatMoney(stats.income, state.currency)}</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/15">
              <Icon name="arrow-up-right" className="h-4 w-4 text-rose-200" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-100/80">Expenses</div>
              <div className="truncate text-sm font-bold tabular-nums">{formatMoney(stats.expense, state.currency)}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-4 gap-2">
        {[
          { label: 'Expense', icon: 'minus-circle', tone: 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400', action: () => openSheet({ kind: 'tx', defaultType: 'expense' }) },
          { label: 'Income', icon: 'plus-circle', tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400', action: () => openSheet({ kind: 'tx', defaultType: 'income' }) },
          { label: 'Transfer', icon: 'arrow-left-right', tone: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400', action: () => openSheet({ kind: 'tx', defaultType: 'transfer' }) },
          { label: 'Bills', icon: 'repeat', tone: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400', action: () => goToPlan('recurring') },
        ].map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={item.action}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-white py-2.5 transition-transform active:scale-95 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${item.tone}`}>
              <Icon name={item.icon} className="h-4 w-4" />
            </div>
            <span className="text-[11px] font-semibold">{item.label}</span>
          </button>
        ))}
      </section>

      <WidgetStrip />

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">My Wallets</h2>
          <button
            type="button"
            onClick={() => setView('accounts')}
            className="text-xs font-semibold text-emerald-600 dark:text-emerald-400"
          >
            See all
          </button>
        </div>
        <div className="no-scrollbar flex snap-x gap-2.5 overflow-x-auto pb-1">
          {state.accounts.map((account) => {
            const balance = balances[account.id] ?? 0;
            const typeMeta = ACCOUNT_TYPES.find((option) => option.value === account.type) ?? ACCOUNT_TYPES[0];
            return (
              <button
                key={account.id}
                type="button"
                onClick={() => openSheet({ kind: 'account', id: account.id })}
                className="w-40 shrink-0 snap-start rounded-2xl border border-slate-200/80 bg-white p-3.5 text-left transition-transform active:scale-[0.98] dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="mb-2.5 flex items-center justify-between">
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-white"
                    style={{ background: account.color || '#059669' }}
                  >
                    <Icon name={typeMeta.icon} className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">{account.type}</span>
                </div>
                <div className="truncate text-xs font-semibold text-slate-600 dark:text-slate-300">{account.name}</div>
                <div className={`mt-0.5 text-sm font-bold tabular-nums ${balance < 0 ? 'text-rose-600 dark:text-rose-400' : ''}`}>
                  {formatMoney(balance, state.currency)}
                </div>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => openSheet({ kind: 'account' })}
            className="flex w-28 shrink-0 snap-start flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-slate-200 p-3.5 text-slate-400 transition-colors hover:border-emerald-400 hover:text-emerald-600 dark:border-slate-800"
          >
            <Icon name="plus" className="h-5 w-5" />
            <span className="text-[11px] font-semibold">Add Card</span>
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold">Spending Breakdown</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{monthLabel}</p>
          </div>
          <span className="text-xs font-bold tabular-nums text-rose-600 dark:text-rose-400">
            {formatMoney(stats.expense, state.currency)}
          </span>
        </div>
        {categoryEntries.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">No expenses recorded for {monthLabel}</div>
        ) : (
          <div className="grid grid-cols-5 items-center gap-3">
            <div className="relative col-span-2 h-36">
              <CategoryChart entries={categoryEntries} currency={state.currency} theme={state.theme} />
            </div>
            <div className="col-span-3 space-y-2">
              {categoryEntries.slice(0, 4).map(([category, value]) => {
                const meta = categoryMeta(category, 'expense');
                const pct = stats.expense > 0 ? Math.round((value / stats.expense) * 100) : 0;
                return (
                  <div key={category} className="flex items-center justify-between gap-1.5 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta.color }} />
                      <span className="truncate text-slate-600 dark:text-slate-300">{category}</span>
                    </span>
                    <span className="shrink-0 font-bold tabular-nums">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">6-Month Cash Flow</h2>
          <div className="flex items-center gap-2.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />In
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-rose-500" />Out
            </span>
            <button
              type="button"
              onClick={() => openSheet({ kind: 'insights' })}
              className="font-semibold text-emerald-600 dark:text-emerald-400"
            >
              Details
            </button>
          </div>
        </div>
        <div className="relative h-48">
          <TrendChart
            labels={months.map((month) => formatMonthLabel(month).split(' ')[0])}
            income={months.map((month) => monthStats(state.transactions, month).income)}
            expense={months.map((month) => monthStats(state.transactions, month).expense)}
            currency={state.currency}
            theme={state.theme}
          />
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">Budget Pulse</h2>
          <button
            type="button"
            onClick={() => goToPlan('budgets')}
            className="text-xs font-semibold text-emerald-600 dark:text-emerald-400"
          >
            Manage
          </button>
        </div>
        {topBudgets.length === 0 ? (
          <p className="py-3 text-center text-xs text-slate-400">No budgets set yet.</p>
        ) : (
          <div className="space-y-3">
            {topBudgets.map((budget) => {
              const barColor = budget.over ? 'bg-rose-500' : budget.pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500';
              return (
                <div key={budget.id}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-semibold">{budget.category}</span>
                    <span className="tabular-nums text-slate-500 dark:text-slate-400">
                      <strong className={budget.over ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}>
                        {formatMoney(budget.spent, state.currency)}
                      </strong>{' '}
                      / {formatMoney(budget.limit, state.currency)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${budget.pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold">Recent Activity</h2>
          <button
            type="button"
            onClick={() => setView('transactions')}
            className="text-xs font-semibold text-emerald-600 dark:text-emerald-400"
          >
            See all
          </button>
        </div>
        {recent.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">No transactions yet. Tap + below to add one.</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {recent.map((tx) => (
              <TransactionRow
                key={tx.id}
                tx={tx}
                accounts={state.accounts}
                currency={state.currency}
                onEdit={() => openSheet({ kind: 'tx', id: tx.id })}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default OverviewView;
