import { useEffect, useMemo, useRef } from 'react';
import { Chart } from 'chart.js/auto';
import Icon from '../components/Icon';
import Sheet from '../components/Sheet';
import {
  accountFlow,
  categoryMeta,
  categoryTotals,
  dailyTotals,
  monthStats,
  topDescriptions,
} from '../lib/calc';
import { formatMoney, formatMonthLabel, shiftMonth } from '../lib/format';
import type { CurrencyCode, Theme } from '../lib/types';
import { useVault } from '../store/VaultContext';

function chartColors(theme: Theme) {
  return {
    text: theme === 'dark' ? '#94a3b8' : '#64748b',
    grid: theme === 'dark' ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.2)',
  };
}

function CategoryBars({
  items,
  currency,
  theme,
}: {
  items: { label: string; value: number; color: string }[];
  currency: CurrencyCode;
  theme: Theme;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signature = items.map((item) => `${item.label}:${item.value}`).join('|');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || items.length === 0) return;
    const { text, grid } = chartColors(theme);
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: items.map((item) => item.label),
        datasets: [
          {
            data: items.map((item) => item.value),
            backgroundColor: items.map((item) => item.color),
            borderRadius: 6,
            maxBarThickness: 22,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => formatMoney(Number(ctx.raw), currency) } },
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: grid },
            ticks: {
              color: text,
              font: { size: 9 },
              maxTicksLimit: 4,
              callback: (value) => (Number(value) >= 1000 ? `${Number(value) / 1000}k` : `${value}`),
            },
          },
          y: { grid: { display: false }, ticks: { color: text, font: { size: 10 } } },
        },
      },
    });
    return () => chart.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, currency, theme]);

  return <canvas ref={canvasRef} />;
}

function SplitDoughnut({
  items,
  currency,
  theme,
}: {
  items: { label: string; value: number; color: string }[];
  currency: CurrencyCode;
  theme: Theme;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signature = items.map((item) => `${item.label}:${item.value}`).join('|');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || items.length === 0) return;
    const chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: items.map((item) => item.label),
        datasets: [
          {
            data: items.map((item) => item.value),
            backgroundColor: items.map((item) => item.color),
            borderWidth: 2,
            borderColor: theme === 'dark' ? '#0f172a' : '#ffffff',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatMoney(Number(ctx.raw), currency)}` } },
        },
      },
    });
    return () => chart.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, currency, theme]);

  return <canvas ref={canvasRef} />;
}

function DailyBars({
  data,
  currency,
  theme,
}: {
  data: { day: number; income: number; expense: number }[];
  currency: CurrencyCode;
  theme: Theme;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signature = data.map((row) => `${row.day}:${row.income}:${row.expense}`).join('|');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { text, grid } = chartColors(theme);
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.map((row) => String(row.day)),
        datasets: [
          { label: 'In', data: data.map((row) => row.income), backgroundColor: '#10b981', borderRadius: 3, maxBarThickness: 9 },
          { label: 'Out', data: data.map((row) => row.expense), backgroundColor: '#f43f5e', borderRadius: 3, maxBarThickness: 9 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => `Day ${items[0]?.label ?? ''}`,
              label: (ctx) => `${ctx.dataset.label}: ${formatMoney(Number(ctx.raw), currency)}`,
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: text, font: { size: 9 }, maxTicksLimit: 10 } },
          y: {
            beginAtZero: true,
            grid: { color: grid },
            ticks: {
              color: text,
              font: { size: 9 },
              maxTicksLimit: 4,
              callback: (value) => (Number(value) >= 1000 ? `${Number(value) / 1000}k` : `${value}`),
            },
          },
        },
      },
    });
    return () => chart.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, currency, theme]);

  return <canvas ref={canvasRef} />;
}

export function InsightsSheet({ onClose }: { onClose: () => void }) {
  const { state } = useVault();
  const month = state.activeMonth;
  const currency = state.currency;

  const stats = useMemo(() => monthStats(state.transactions, month), [state.transactions, month]);
  const previous = useMemo(() => monthStats(state.transactions, shiftMonth(month, -1)), [state.transactions, month]);
  const expenseCategories = useMemo(
    () => categoryTotals(state.transactions, month, 'expense'),
    [state.transactions, month],
  );
  const incomeCategories = useMemo(
    () => categoryTotals(state.transactions, month, 'income'),
    [state.transactions, month],
  );
  const daily = useMemo(() => dailyTotals(state.transactions, month), [state.transactions, month]);
  const topExpenses = useMemo(
    () => topDescriptions(state.transactions, month, 'expense', 5),
    [state.transactions, month],
  );
  const topIncome = useMemo(() => topDescriptions(state.transactions, month, 'income', 5), [state.transactions, month]);
  const flows = useMemo(
    () => accountFlow(state.accounts, state.transactions, month),
    [state.accounts, state.transactions, month],
  );

  const expenseItems = expenseCategories.map((entry) => ({
    label: entry.category,
    value: entry.total,
    color: categoryMeta(entry.category, 'expense').color,
  }));
  const incomeItems = incomeCategories.map((entry) => ({
    label: entry.category,
    value: entry.total,
    color: categoryMeta(entry.category, 'income').color,
  }));

  const expenseDelta = previous.expense > 0 ? Math.round(((stats.expense - previous.expense) / previous.expense) * 100) : null;

  const empty = state.transactions.every((tx) => !tx.date.startsWith(month));

  return (
    <Sheet title="Insights" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-bold">{formatMonthLabel(month)}</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Charts for every expense and income category</div>
          </div>
          <Icon name="pie-chart" className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {[
            { label: 'Income', value: stats.income, tone: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Expenses', value: stats.expense, tone: 'text-rose-600 dark:text-rose-400' },
            { label: 'Net', value: stats.net, tone: stats.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400' },
            { label: 'Saved', value: null as number | null, text: `${stats.savingsRate}%`, tone: 'text-slate-900 dark:text-white' },
          ].map((tile) => (
            <div
              key={tile.label}
              className="rounded-2xl border border-slate-200/80 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{tile.label}</div>
              <div className={`mt-0.5 text-base font-bold tabular-nums ${tile.tone}`}>
                {tile.value === null ? tile.text : formatMoney(tile.value, currency)}
              </div>
            </div>
          ))}
        </div>

        {expenseDelta !== null ? (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Spending is{' '}
            <span className={expenseDelta > 0 ? 'font-bold text-rose-600 dark:text-rose-400' : 'font-bold text-emerald-600 dark:text-emerald-400'}>
              {expenseDelta > 0 ? `${expenseDelta}% higher` : `${Math.abs(expenseDelta)}% lower`}
            </span>{' '}
            than {formatMonthLabel(shiftMonth(month, -1))}.
          </p>
        ) : null}

        {empty ? (
          <div className="py-10 text-center text-xs text-slate-400">
            Nothing logged in {formatMonthLabel(month)} yet. Add a transaction to see the graphs.
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-slate-200/80 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold">Expenses by category</h3>
                <span className="text-[11px] font-bold tabular-nums text-rose-600 dark:text-rose-400">
                  {formatMoney(stats.expense, currency)}
                </span>
              </div>
              {expenseItems.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">No expenses this month.</p>
              ) : (
                <>
                  <div className="relative h-52">
                    <CategoryBars items={expenseItems} currency={currency} theme={state.theme} />
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {expenseCategories.map((entry) => (
                      <div key={entry.category} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: categoryMeta(entry.category, 'expense').color }}
                          />
                          <span className="truncate text-slate-600 dark:text-slate-300">{entry.category}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                          {formatMoney(entry.total, currency)} · {Math.round(entry.share * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200/80 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold">Income by source</h3>
                <span className="text-[11px] font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatMoney(stats.income, currency)}
                </span>
              </div>
              {incomeItems.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">No income this month.</p>
              ) : (
                <div className="grid grid-cols-5 items-center gap-3">
                  <div className="relative col-span-2 h-36">
                    <SplitDoughnut items={incomeItems} currency={currency} theme={state.theme} />
                  </div>
                  <div className="col-span-3 space-y-1.5">
                    {incomeCategories.map((entry) => (
                      <div key={entry.category} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: categoryMeta(entry.category, 'income').color }}
                          />
                          <span className="truncate text-slate-600 dark:text-slate-300">{entry.category}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                          {Math.round(entry.share * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200/80 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold">Daily flow</h3>
                <div className="flex items-center gap-2.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />In
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />Out
                  </span>
                </div>
              </div>
              <div className="relative h-40">
                <DailyBars data={daily} currency={currency} theme={state.theme} />
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="mb-2 text-sm font-bold">Biggest expenses</h3>
                {topExpenses.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-400">No expenses.</p>
                ) : (
                  <div className="space-y-2">
                    {topExpenses.map((entry) => (
                      <div key={entry.label} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">{entry.label}</span>
                        <span className="shrink-0 font-semibold tabular-nums">
                          {formatMoney(entry.total, currency)}
                          <span className="ml-1 font-normal text-slate-400">×{entry.count}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="mb-2 text-sm font-bold">Biggest income</h3>
                {topIncome.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-400">No income.</p>
                ) : (
                  <div className="space-y-2">
                    {topIncome.map((entry) => (
                      <div key={entry.label} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">{entry.label}</span>
                        <span className="shrink-0 font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                          {formatMoney(entry.total, currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200/80 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="mb-2 text-sm font-bold">Accounts this month</h3>
              <div className="space-y-2.5">
                {flows.map((flow) => (
                  <div key={flow.account.id}>
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: flow.account.color || '#059669' }}
                        />
                        <span className="truncate font-semibold text-slate-600 dark:text-slate-300">
                          {flow.account.name}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                        +{formatMoney(flow.inflow, currency)} · -{formatMoney(flow.outflow, currency)}
                      </span>
                    </div>
                    <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full bg-emerald-500"
                        style={{
                          width: `${flow.inflow + flow.outflow > 0 ? (flow.inflow / (flow.inflow + flow.outflow)) * 100 : 0}%`,
                        }}
                      />
                      <div className="h-full flex-1 bg-rose-500" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </Sheet>
  );
}

export default InsightsSheet;
