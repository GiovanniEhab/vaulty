import { useState, type FormEvent } from 'react';
import { formatMoney } from '../lib/format';
import { toast } from '../lib/toast';
import { useVault } from '../store/VaultContext';
import { MoneyField, PrimaryButton } from '../components/Field';
import Sheet from '../components/Sheet';

export function ContributeSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { state, contributeToGoal } = useVault();
  const goal = state.goals.find((g) => g.id === id);
  const [amount, setAmount] = useState('');

  if (!goal) {
    return (
      <Sheet title="Update Goal" onClose={onClose}>
        <p className="py-6 text-center text-sm text-slate-500">This goal no longer exists.</p>
      </Sheet>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const delta = Number.parseFloat(amount);
    if (!delta) {
      toast('Enter an amount (negative to withdraw).', 'error');
      return;
    }
    contributeToGoal(goal.id, delta);
    onClose();
  };

  return (
    <Sheet title="Update Goal" onClose={onClose}>
      <form className="space-y-3.5" onSubmit={submit}>
        <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3 text-xs dark:bg-slate-800">
          <span className="font-bold">{goal.name}</span>
          <span className="tabular-nums text-slate-500 dark:text-slate-400">
            {formatMoney(goal.current, state.currency)} / {formatMoney(goal.target, state.currency)}
          </span>
        </div>

        <MoneyField label={`Amount (${state.currency})`} value={amount} onChange={setAmount} />
        <p className="-mt-1 text-[11px] text-slate-400">Use a negative amount to withdraw from this goal.</p>

        <PrimaryButton>Apply Contribution</PrimaryButton>
      </form>
    </Sheet>
  );
}

export default ContributeSheet;
