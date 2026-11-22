import { useState, type FormEvent } from 'react';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../lib/constants';
import { makeId, todayISO } from '../lib/format';
import { toast } from '../lib/toast';
import type { Transaction, TxType } from '../lib/types';
import { useVault } from '../store/VaultContext';
import { MoneyField, PrimaryButton, SelectField, TextField } from '../components/Field';
import Sheet from '../components/Sheet';

function defaultDate(activeMonth: string): string {
  const today = todayISO();
  return today.startsWith(activeMonth) ? today : `${activeMonth}-01`;
}

export function TransactionSheet({
  id,
  defaultType = 'expense',
  onClose,
}: {
  id?: string;
  defaultType?: TxType;
  onClose: () => void;
}) {
  const { state, saveTransaction } = useVault();
  const existing = id ? state.transactions.find((t) => t.id === id) : undefined;

  const [type, setType] = useState<TxType>(existing?.type ?? defaultType);
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '');
  const [date, setDate] = useState(existing?.date ?? defaultDate(state.activeMonth));
  const [description, setDescription] = useState(existing?.description ?? '');
  const [accountId, setAccountId] = useState(existing?.accountId ?? state.accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(
    existing?.toAccountId ?? state.accounts[1]?.id ?? state.accounts[0]?.id ?? '',
  );
  const [category, setCategory] = useState(existing?.category ?? EXPENSE_CATEGORIES[0].id);
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const categoryPool = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const changeType = (next: TxType) => {
    setType(next);
    if (next !== 'transfer') {
      const pool = next === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
      if (!pool.some((c) => c.id === category)) setCategory(pool[0].id);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const numeric = Number.parseFloat(amount);
    if (!numeric || numeric <= 0) {
      toast('Enter an amount greater than 0.', 'error');
      return;
    }
    if (!accountId) {
      toast('Pick an account first.', 'error');
      return;
    }
    if (type === 'transfer' && accountId === toAccountId) {
      toast('Pick two different accounts.', 'error');
      return;
    }
    const resolvedCategory = type === 'transfer' ? 'Transfer' : category;
    const tx: Transaction = {
      id: existing?.id ?? makeId('tx'),
      type,
      amount: numeric,
      date: date || todayISO(),
      description: description.trim() || resolvedCategory,
      accountId,
      toAccountId: type === 'transfer' ? toAccountId : null,
      category: resolvedCategory,
      notes: notes.trim(),
    };
    saveTransaction(tx);
    onClose();
  };

  if (state.accounts.length === 0) {
    return (
      <Sheet title={existing ? 'Edit Transaction' : 'Add Transaction'} onClose={onClose}>
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Create an account first — open the Accounts tab and tap “New Account”.
        </p>
      </Sheet>
    );
  }

  const typeStyles: Record<TxType, string> = {
    expense: 'bg-rose-600 text-white',
    income: 'bg-emerald-600 text-white',
    transfer: 'bg-indigo-600 text-white',
  };

  return (
    <Sheet title={existing ? 'Edit Transaction' : 'Add Transaction'} onClose={onClose}>
      <form className="space-y-3.5" onSubmit={submit}>
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
          {(['expense', 'income', 'transfer'] as TxType[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => changeType(option)}
              className={`rounded-xl py-2 text-xs font-bold capitalize transition-colors ${
                type === option ? typeStyles[option] : 'text-slate-500 dark:text-slate-300'
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <MoneyField label={`Amount (${state.currency})`} value={amount} onChange={setAmount} />
          <TextField label="Date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <TextField
          label="Description"
          type="text"
          required
          value={description}
          placeholder="e.g., Groceries, Coffee, Salary"
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-2.5">
          <SelectField
            label={type === 'transfer' ? 'From' : 'Account'}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {state.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </SelectField>

          {type === 'transfer' ? (
            <SelectField label="To Account" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
              {state.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </SelectField>
          ) : (
            <SelectField label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categoryPool.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id}
                </option>
              ))}
            </SelectField>
          )}
        </div>

        <TextField
          label="Notes (optional)"
          type="text"
          value={notes}
          placeholder="Optional note"
          onChange={(e) => setNotes(e.target.value)}
        />

        <PrimaryButton>{existing ? 'Save Changes' : 'Save Transaction'}</PrimaryButton>
      </form>
    </Sheet>
  );
}

export default TransactionSheet;
