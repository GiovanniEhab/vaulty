import { categoryMeta, monthStats } from '../lib/calc';
import { WIDGET_CATALOG } from '../lib/constants';
import { formatMoney } from '../lib/format';
import type { WidgetId } from '../lib/types';
import { useVault } from '../store/VaultContext';
import { useUI } from '../ui/UIContext';
import Icon from './Icon';

interface WidgetCard {
  label: string;
  icon: string;
  accent: string;
  value: string;
  sub: string;
  progress?: number;
  onClick: () => void;
}

export function WidgetStrip() {
  const { state, balances } = useVault();
  const { openSheet, setView, goToPlan } = useUI();
  const stats = monthStats(state.transactions, state.activeMonth);

  const net = Object.values(balances).reduce((sum, value) => sum + value, 0);

  const topBudget = state.budgets
    .map((budget) => ({
      ...budget,
      spent: stats.byCategory[budget.category] || 0,
      ratio: budget.limit > 0 ? (stats.byCategory[budget.category] || 0) / budget.limit : 0,
    }))
    .sort((a, b) => b.ratio - a.ratio)[0];

  const topGoal = [...state.goals]
    .map((goal) => ({ ...goal, ratio: goal.target > 0 ? goal.current / goal.target : 0 }))
    .sort((a, b) => b.ratio - a.ratio)[0];

  const build = (id: WidgetId): WidgetCard => {
    switch (id) {
      case 'month':
        return {
          label: 'This month',
          icon: 'receipt',
          accent: '#f43f5e',
          value: formatMoney(stats.expense, state.currency),
          sub: `in ${formatMoney(stats.income, state.currency)}`,
          onClick: () => setView('transactions'),
        };
      case 'budget':
        return topBudget
          ? {
              label: 'Top budget',
              icon: 'pie-chart',
              accent: categoryMeta(topBudget.category, 'expense').color,
              value: `${Math.min(999, Math.round(topBudget.ratio * 100))}% used`,
              sub: `${topBudget.category} · ${formatMoney(topBudget.spent, state.currency)}`,
              progress: Math.min(100, topBudget.ratio * 100),
              onClick: () => goToPlan('budgets'),
            }
          : {
              label: 'Top budget',
              icon: 'pie-chart',
              accent: '#f59e0b',
              value: 'No budgets',
              sub: 'Tap to set one',
              onClick: () => goToPlan('budgets'),
            };
      case 'goal':
        return topGoal
          ? {
              label: 'Top goal',
              icon: 'piggy-bank',
              accent: topGoal.color || '#6366f1',
              value: `${Math.min(999, Math.round(topGoal.ratio * 100))}% saved`,
              sub: topGoal.name,
              progress: Math.min(100, topGoal.ratio * 100),
              onClick: () => goToPlan('goals'),
            }
          : {
              label: 'Top goal',
              icon: 'piggy-bank',
              accent: '#6366f1',
              value: 'No goals',
              sub: 'Tap to create one',
              onClick: () => goToPlan('goals'),
            };
      case 'voice':
        return {
          label: 'Assistant',
          icon: 'mic',
          accent: '#059669',
          value: 'Ask Vaulty',
          sub: 'Speak a command',
          onClick: () => openSheet({ kind: 'assistant' }),
        };
      case 'netWorth':
      default:
        return {
          label: 'Net worth',
          icon: 'wallet',
          accent: '#059669',
          value: formatMoney(net, state.currency),
          sub: `${state.accounts.length} accounts`,
          onClick: () => setView('accounts'),
        };
    }
  };

  const widgets = state.widgetIds.map((id) => ({ id, ...build(id) })).filter((widget) => WIDGET_CATALOG.some((entry) => entry.id === widget.id));

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Widgets</h2>
        <button
          type="button"
          onClick={() => openSheet({ kind: 'widgets' })}
          className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400"
        >
          <Icon name="layout-grid" className="h-3.5 w-3.5" />
          <span>Edit</span>
        </button>
      </div>

      {widgets.length === 0 ? (
        <button
          type="button"
          onClick={() => openSheet({ kind: 'widgets' })}
          className="w-full rounded-2xl border-2 border-dashed border-slate-200 py-4 text-xs font-semibold text-slate-400 dark:border-slate-800"
        >
          Add a widget
        </button>
      ) : (
        <div className="no-scrollbar flex snap-x gap-2.5 overflow-x-auto pb-1">
          {widgets.map((widget) => (
            <button
              key={widget.id}
              type="button"
              onClick={widget.onClick}
              className="w-36 shrink-0 snap-start rounded-2xl border border-slate-200/80 bg-white p-3.5 text-left transition-transform active:scale-[0.98] dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{widget.label}</span>
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-lg"
                  style={{ background: `${widget.accent}18`, color: widget.accent }}
                >
                  <Icon name={widget.icon} className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="truncate text-sm font-bold tabular-nums">{widget.value}</div>
              <div className="mt-0.5 truncate text-[10px] text-slate-500 dark:text-slate-400">{widget.sub}</div>
              {widget.progress !== undefined ? (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full rounded-full" style={{ width: `${widget.progress}%`, background: widget.accent }} />
                </div>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export default WidgetStrip;
