import { useState, type FormEvent } from 'react';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../lib/constants';
import { makeId } from '../lib/format';
import { toast } from '../lib/toast';
import type { Recurring } from '../lib/types';
import { useVault } from '../store/VaultContext';
import { MoneyField, PrimaryButton, SelectField, TextField } from '../components/Field';
import Sheet from '../components/Sheet';

export function RecurringSheet({ onClose }: { onClose: () => void }) {
  const { state, saveRecurring } = useVault();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [accountId, setAccountId] = useState(state.accounts[0]?.id ?? '');
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0].id);

  const pool = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const changeType = (next: 'income' | 'expense') => {
    setType(next);
    const categories = next === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    if (!categories.some((c) => c.id === category)) setCategory(categories[0].id);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const numeric = Number.parseFloat(amount);
    if (!title.trim() || !numeric || numeric <= 0) {
      toast('Add a title and an amount.', 'error');
      return;
    }
    if (!accountId) {
      toast('Create an account first.', 'error');
      return;
    }
    const item: Recurring = {
      id: makeId('rec'),
      title: title.trim(),
      type,
      amount: numeric,
      dayOfMonth: Math.min(28, Math.max(1, Number.parseInt(dayOfMonth, 10) || 1)),
      accountId,
      category,
      lastLoggedMonth: '',
    };
    saveRecurring(item);
    onClose();
  };

  if (state.accounts.length === 0) {
    return (
      <Sheet title="Add Recurring Item" onClose={onClose}>
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Create an account first — recurring items are posted to an account.
        </p>
      </Sheet>
    );
  }

  return (
    <Sheet title="Add Recurring Item" onClose={onClose}>
      <form className="space-y-3.5" onSubmit={submit}>
        <TextField
          label="Title"
          type="text"
          required
          value={title}
          placeholder="e.g., Rent, Internet, Salary"
          onChange={(event) => setTitle(event.target.value)}
        />

        <div className="grid grid-cols-3 gap-2">
          <SelectField
            label="Type"
            value={type}
            className="h-11 px-2"
            onChange={(event) => changeType(event.target.value as 'income' | 'expense')}
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </SelectField>
          <MoneyField label="Amount" value={amount} onChange={setAmount} />
          <TextField
            label="Day"
            type="number"
            min={1}
            max={28}
            required
            value={dayOfMonth}
            onChange={(event) => setDayOfMonth(event.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <SelectField label="Account" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            {state.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Category" value={category} onChange={(event) => setCategory(event.target.value)}>
            {pool.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id}
              </option>
            ))}
          </SelectField>
        </div>

        <PrimaryButton>Save Recurring</PrimaryButton>
      </form>
    </Sheet>
  );
}

export default RecurringSheet;
