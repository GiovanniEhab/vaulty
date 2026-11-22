import Icon from '../components/Icon';
import { categoryMeta, monthStats } from '../lib/calc';
import { formatMoney, formatMonthLabel } from '../lib/format';
import type { PlanTab } from '../lib/types';
import { useVault } from '../store/VaultContext';
import { useUI } from '../ui/UIContext';

function BudgetsTab() {
  const { state, deleteBudget } = useVault();
  const { openSheet, confirm } = useUI();
  const stats = monthStats(state.transactions, state.activeMonth);

  const totalLimit = state.budgets.reduce((sum, budget) => sum + (Number(budget.limit) || 0), 0);
  const totalSpent = state.budgets.reduce((sum, budget) => sum + (stats.byCategory[budget.category] || 0), 0);
  const overallPct = totalLimit > 0 ? Math.min(100, Math.round((totalSpent / totalLimit) * 100)) : 0;
  const remaining = totalLimit - totalSpent;

  return (
    <div className="space-y-3.5">
      <div className="rounded-3xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{formatMonthLabel(state.activeMonth)} Budget</div>
            <div className="text-xl font-bold tabular-nums">
              {formatMoney(totalSpent, state.currency)}{' '}
              <span className="text-xs font-medium text-slate-400">/ {formatMoney(totalLimit, state.currency)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openSheet({ kind: 'budget' })}
            className="flex h-9 items-center gap-1 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white active:scale-95"
          >
            <Icon name="plus" className="h-4 w-4" />
            <span>Add</span>
          </button>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className={`h-full rounded-full ${
              remaining < 0 ? 'bg-rose-500' : overallPct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
            style={{ width: `${overallPct}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] font-semibold">
          <span className="text-slate-500 dark:text-slate-400">{overallPct}% used</span>
          <span className={remaining < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}>
            {remaining >= 0
              ? `${formatMoney(remaining, state.currency)} left`
              : `${formatMoney(Math.abs(remaining), state.currency)} over`}
          </span>
        </div>
      </div>

      {state.budgets.length === 0 ? (
        <div className="rounded-3xl border border-slate-200/80 bg-white p-10 text-center text-xs text-slate-400 dark:border-slate-800 dark:bg-slate-900">
          No category budgets yet. Tap Add above to set one.
        </div>
      ) : (
        state.budgets.map((budget) => {
          const meta = categoryMeta(budget.category, 'expense');
          const spent = stats.byCategory[budget.category] || 0;
          const left = budget.limit - spent;
          const pct = budget.limit > 0 ? Math.min(100, Math.round((spent / budget.limit) * 100)) : 0;
          const barColor = spent > budget.limit ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500';
          return (
            <div key={budget.id} className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-xl"
                    style={{ background: `${meta.color}18`, color: meta.color }}
                  >
                    <Icon name={meta.icon} className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-bold">{budget.category}</div>
                    <div className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                      {formatMoney(spent, state.currency)} of {formatMoney(budget.limit, state.currency)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openSheet({ kind: 'budget', id: budget.id })}
                    className="rounded-lg p-1.5 text-slate-400 hover:text-emerald-600"
                    aria-label="Edit budget"
                  >
                    <Icon name="pencil" className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      confirm({
                        title: 'Remove budget?',
                        message: `Remove the ${budget.category} budget? Your transactions are not affected.`,
                        confirmLabel: 'Remove',
                        onConfirm: () => deleteBudget(budget.id),
                      })
                    }
                    className="rounded-lg p-1.5 text-slate-400 hover:text-rose-600"
                    aria-label="Delete budget"
                  >
                    <Icon name="trash-2" className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
              <div
                className={`mt-1 text-right text-[11px] font-semibold ${
                  left < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {left >= 0
                  ? `${formatMoney(left, state.currency)} left`
                  : `${formatMoney(Math.abs(left), state.currency)} over`}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function GoalsTab() {
  const { state, deleteGoal } = useVault();
  const { openSheet, confirm } = useUI();
  const totalSaved = state.goals.reduce((sum, goal) => sum + (Number(goal.current) || 0), 0);
  const totalTarget = state.goals.reduce((sum, goal) => sum + (Number(goal.target) || 0), 0);

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between px-1">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Total Saved</div>
          <div className="text-base font-bold tabular-nums">
            {formatMoney(totalSaved, state.currency)}{' '}
            <span className="text-xs font-normal text-slate-400">/ {formatMoney(totalTarget, state.currency)}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => openSheet({ kind: 'goal' })}
          className="flex h-9 items-center gap-1 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white active:scale-95"
        >
          <Icon name="plus" className="h-4 w-4" />
          <span>New Goal</span>
        </button>
      </div>

      {state.goals.length === 0 ? (
        <div className="rounded-3xl border border-slate-200/80 bg-white p-10 text-center text-xs text-slate-400 dark:border-slate-800 dark:bg-slate-900">
          No savings goals yet. Tap New Goal to create one.
        </div>
      ) : (
        state.goals.map((goal) => {
          const pct = goal.target > 0 ? Math.min(100, Math.round((goal.current / goal.target) * 100)) : 0;
          const remaining = Math.max(0, (Number(goal.target) || 0) - (Number(goal.current) || 0));
          return (
            <div key={goal.id} className="space-y-3 rounded-3xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-bold">{goal.name}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {goal.deadline ? `Target: ${goal.deadline}` : 'No target date'}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openSheet({ kind: 'goal', id: goal.id })}
                    className="rounded-lg p-1.5 text-slate-400 hover:text-emerald-600"
                    aria-label="Edit goal"
                  >
                    <Icon name="pencil" className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      confirm({
                        title: 'Delete Goal?',
                        message: `Remove "${goal.name}"? Your accounts and transactions stay untouched.`,
                        confirmLabel: 'Delete',
                        onConfirm: () => deleteGoal(goal.id),
                      })
                    }
                    className="rounded-lg p-1.5 text-slate-400 hover:text-rose-600"
                    aria-label="Delete goal"
                  >
                    <Icon name="trash-2" className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-lg font-bold tabular-nums">{formatMoney(goal.current, state.currency)}</span>
                  <span className="text-xs font-semibold" style={{ color: goal.color || '#10b981' }}>
                    {pct}%
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: goal.color || '#10b981' }} />
                </div>
                <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {remaining === 0
                    ? 'Goal reached!'
                    : `${formatMoney(remaining, state.currency)} remaining of ${formatMoney(goal.target, state.currency)}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => openSheet({ kind: 'contribute', id: goal.id })}
                className="h-9 w-full rounded-xl bg-slate-100 text-xs font-semibold transition-colors hover:bg-emerald-600 hover:text-white active:scale-[0.98] dark:bg-slate-800"
              >
                + Add / Update Contribution
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}

function RecurringTab() {
  const { state, logRecurring, deleteRecurring } = useVault();
  const { openSheet, confirm } = useUI();
  const monthlyIn = state.recurring.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.amount, 0);
  const monthlyOut = state.recurring.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Fixed Monthly Net</div>
          <div className="text-base font-bold tabular-nums">{formatMoney(monthlyIn - monthlyOut, state.currency, true)}</div>
        </div>
        <button
          type="button"
          onClick={() => openSheet({ kind: 'recurring' })}
          className="flex h-9 items-center gap-1 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white active:scale-95"
        >
          <Icon name="plus" className="h-4 w-4" />
          <span>Add Bill</span>
        </button>
      </div>

      {state.recurring.length === 0 ? (
        <div className="rounded-3xl border border-slate-200/80 bg-white p-10 text-center text-xs text-slate-400 dark:border-slate-800 dark:bg-slate-900">
          No recurring items yet.
        </div>
      ) : (
        <div className="space-y-2.5">
          {[...state.recurring]
            .sort((a, b) => a.dayOfMonth - b.dayOfMonth)
            .map((item) => {
              const meta = categoryMeta(item.category, item.type);
              const logged = item.lastLoggedMonth === state.activeMonth;
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2.5 rounded-2xl border border-slate-200/80 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: `${meta.color}18`, color: meta.color }}
                    >
                      <Icon name={meta.icon} className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold">{item.title}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Day {item.dayOfMonth} · {item.type === 'income' ? '+' : '-'}
                        {formatMoney(item.amount, state.currency)}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {logged ? (
                      <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        Logged
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => logRecurring(item.id)}
                        className="rounded-xl bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white active:scale-95"
                      >
                        Log
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        confirm({
                          title: 'Remove recurring item?',
                          message: `Stop tracking "${item.title}"? Transactions already logged stay in your ledger.`,
                          confirmLabel: 'Remove',
                          onConfirm: () => deleteRecurring(item.id),
                        })
                      }
                      className="rounded-lg p-1.5 text-slate-400 hover:text-rose-600"
                      aria-label="Delete recurring"
                    >
                      <Icon name="trash-2" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

export function PlanView() {
  const { planTab, setPlanTab } = useUI();
  const tabs: { id: PlanTab; label: string }[] = [
    { id: 'budgets', label: 'Budgets' },
    { id: 'goals', label: 'Goals' },
    { id: 'recurring', label: 'Recurring' },
  ];

  return (
    <div className="space-y-3.5 p-4">
      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-slate-200/80 bg-slate-200/70 p-1 dark:border-slate-800 dark:bg-slate-900">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setPlanTab(tab.id)}
            className={`rounded-xl py-2 text-xs font-bold transition-all ${
              planTab === tab.id
                ? 'bg-white text-emerald-600 shadow-sm dark:bg-slate-800 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {planTab === 'budgets' ? <BudgetsTab /> : planTab === 'goals' ? <GoalsTab /> : <RecurringTab />}
    </div>
  );
}

export default PlanView;
