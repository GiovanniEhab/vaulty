import Icon from '../components/Icon';
import { ACCOUNT_TYPES } from '../lib/constants';
import { formatMoney } from '../lib/format';
import { useVault } from '../store/VaultContext';
import { useUI } from '../ui/UIContext';

export function AccountsView() {
  const { state, balances, deleteAccount } = useVault();
  const { openSheet, confirm } = useUI();

  const assets = state.accounts.reduce((sum, account) => {
    const balance = balances[account.id] ?? 0;
    return balance >= 0 ? sum + balance : sum;
  }, 0);
  const liabilities = state.accounts.reduce((sum, account) => {
    const balance = balances[account.id] ?? 0;
    return balance < 0 ? sum + Math.abs(balance) : sum;
  }, 0);

  return (
    <div className="space-y-4 p-4">
      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Assets</div>
          <div className="mt-0.5 text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatMoney(assets, state.currency)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Liabilities</div>
          <div className="mt-0.5 text-lg font-bold tabular-nums text-rose-600 dark:text-rose-400">
            {formatMoney(liabilities, state.currency)}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => openSheet({ kind: 'tx', defaultType: 'transfer' })}
          className="flex h-10 items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white text-xs font-semibold transition-transform active:scale-95 dark:border-slate-800 dark:bg-slate-900"
        >
          <Icon name="arrow-left-right" className="h-4 w-4 text-indigo-500" />
          <span>Transfer</span>
        </button>
        <button
          type="button"
          onClick={() => openSheet({ kind: 'account' })}
          className="flex h-10 items-center justify-center gap-1.5 rounded-2xl bg-emerald-600 text-xs font-semibold text-white shadow-sm shadow-emerald-600/20 transition-transform active:scale-95"
        >
          <Icon name="plus" className="h-4 w-4" />
          <span>New Account</span>
        </button>
      </section>

      <section className="space-y-3">
        {state.accounts.map((account) => {
          const balance = balances[account.id] ?? 0;
          const typeMeta = ACCOUNT_TYPES.find((option) => option.value === account.type) ?? ACCOUNT_TYPES[0];
          const entries = state.transactions.filter((tx) => tx.accountId === account.id || tx.toAccountId === account.id).length;
          return (
            <div
              key={account.id}
              className="flex items-center justify-between gap-3 rounded-3xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
                  style={{ background: account.color || '#059669' }}
                >
                  <Icon name={typeMeta.icon} className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">{account.name}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {typeMeta.label} · {entries} entries
                  </div>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className={`text-base font-bold tabular-nums ${balance < 0 ? 'text-rose-600 dark:text-rose-400' : ''}`}>
                  {formatMoney(balance, state.currency)}
                </div>
                <div className="mt-1 flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => openSheet({ kind: 'account', id: account.id })}
                    className="rounded-lg p-1 text-slate-400 hover:text-emerald-600"
                    aria-label="Edit account"
                  >
                    <Icon name="pencil" className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (state.accounts.length <= 1) {
                        confirm({
                          title: 'Keep at least one account',
                          message: 'You need one account to log transactions against. Add another account first.',
                          confirmLabel: 'Got it',
                          onConfirm: () => undefined,
                        });
                        return;
                      }
                      confirm({
                        title: 'Delete Account?',
                        message: `Delete "${account.name}" and every transaction tied to it? This cannot be undone.`,
                        confirmLabel: 'Delete',
                        onConfirm: () => deleteAccount(account.id),
                      });
                    }}
                    className="rounded-lg p-1 text-slate-400 hover:text-rose-600"
                    aria-label="Delete account"
                  >
                    <Icon name="trash-2" className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

export default AccountsView;
