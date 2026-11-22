import { categoryMeta } from '../lib/calc';
import { formatMoney } from '../lib/format';
import type { Account, CurrencyCode, Transaction } from '../lib/types';
import Icon from './Icon';

export function TransactionRow({
  tx,
  accounts,
  currency,
  onEdit,
  onDelete,
}: {
  tx: Transaction;
  accounts: Account[];
  currency: CurrencyCode;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const meta = categoryMeta(tx.category, tx.type);
  const from = accounts.find((a) => a.id === tx.accountId);
  const to = tx.toAccountId ? accounts.find((a) => a.id === tx.toAccountId) : null;
  const accountText =
    tx.type === 'transfer'
      ? `${from?.name ?? 'Account'} → ${to?.name ?? 'Account'}`
      : (from?.name ?? 'Account');

  const amountClass =
    tx.type === 'income'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tx.type === 'expense'
        ? 'text-slate-900 dark:text-white'
        : 'text-indigo-600 dark:text-indigo-400';
  const prefix = tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : '';

  return (
    <div className="flex items-center justify-between gap-2.5 py-3">
      <button type="button" onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-75">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
          style={{ background: `${meta.color}18`, color: meta.color }}
        >
          <Icon name={meta.icon} className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{tx.description || tx.category}</div>
          <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
            {tx.category} · {accountText}
          </div>
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-1.5">
        <div className="text-right">
          <div className={`text-sm font-bold tabular-nums ${amountClass}`}>
            {prefix}
            {formatMoney(tx.amount, currency)}
          </div>
          <div className="text-[10px] tabular-nums text-slate-400">{tx.date.slice(5)}</div>
        </div>
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg p-1.5 text-slate-400 hover:text-rose-600 active:scale-95"
            aria-label="Delete transaction"
          >
            <Icon name="trash-2" className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default TransactionRow;
