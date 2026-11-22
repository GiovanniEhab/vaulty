import { useState, type FormEvent } from 'react';
import { EXPENSE_CATEGORIES } from '../lib/constants';
import { makeId } from '../lib/format';
import { toast } from '../lib/toast';
import type { Budget } from '../lib/types';
import { useVault } from '../store/VaultContext';
import { MoneyField, PrimaryButton, SelectField } from '../components/Field';
import Sheet from '../components/Sheet';

export function BudgetSheet({ id, onClose }: { id?: string; onClose: () => void }) {
  const { state, saveBudget } = useVault();
  const existing = id ? state.budgets.find((b) => b.id === id) : undefined;

  const used = new Set(state.budgets.filter((b) => b.id !== existing?.id).map((b) => b.category));
  const available = EXPENSE_CATEGORIES.filter((category) => !used.has(category.id));

  const [category, setCategory] = useState(existing?.category ?? available[0]?.id ?? EXPENSE_CATEGORIES[0].id);
  const [limit, setLimit] = useState(existing ? String(existing.limit) : '');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const numeric = Number.parseFloat(limit);
    if (!numeric || numeric <= 0) {
      toast('Enter a monthly limit greater than 0.', 'error');
      return;
    }
    const budget: Budget = { id: existing?.id ?? makeId('bud'), category, limit: numeric };
    saveBudget(budget);
    onClose();
  };

  if (!existing && available.length === 0) {
    return (
      <Sheet title="Set Category Budget" onClose={onClose}>
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Every expense category already has a budget.
        </p>
      </Sheet>
    );
  }

  return (
    <Sheet title={existing ? 'Edit Budget' : 'Set Category Budget'} onClose={onClose}>
      <form className="space-y-3.5" onSubmit={submit}>
        <SelectField
          label="Category"
          value={category}
          disabled={Boolean(existing)}
          className={`h-11 ${existing ? 'opacity-60' : ''}`}
          onChange={(event) => setCategory(event.target.value)}
        >
          {(existing ? [{ id: existing.category }] : available).map((item) => (
            <option key={item.id} value={item.id}>
              {item.id}
            </option>
          ))}
        </SelectField>

        <MoneyField label={`Monthly Limit (${state.currency})`} value={limit} onChange={setLimit} />

        <PrimaryButton>{existing ? 'Update Budget' : 'Save Budget'}</PrimaryButton>
      </form>
    </Sheet>
  );
}

export default BudgetSheet;
