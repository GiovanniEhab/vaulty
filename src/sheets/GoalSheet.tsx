import { useState, type FormEvent } from 'react';
import { GOAL_COLORS } from '../lib/constants';
import { makeId } from '../lib/format';
import { toast } from '../lib/toast';
import type { Goal } from '../lib/types';
import { useVault } from '../store/VaultContext';
import { ColorPicker, MoneyField, PrimaryButton, TextField } from '../components/Field';
import Sheet from '../components/Sheet';

export function GoalSheet({ id, onClose }: { id?: string; onClose: () => void }) {
  const { state, saveGoal } = useVault();
  const existing = id ? state.goals.find((g) => g.id === id) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [target, setTarget] = useState(existing ? String(existing.target) : '');
  const [current, setCurrent] = useState(existing ? String(existing.current) : '0');
  const [deadline, setDeadline] = useState(existing?.deadline ?? '');
  const [color, setColor] = useState(existing?.color ?? GOAL_COLORS[0]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      toast('Name your goal.', 'error');
      return;
    }
    const numericTarget = Number.parseFloat(target);
    if (!numericTarget || numericTarget <= 0) {
      toast('Enter a target amount.', 'error');
      return;
    }
    const goal: Goal = {
      id: existing?.id ?? makeId('goal'),
      name: name.trim(),
      target: numericTarget,
      current: Math.max(0, Number.parseFloat(current) || 0),
      deadline,
      color,
    };
    saveGoal(goal);
    onClose();
  };

  return (
    <Sheet title={existing ? 'Edit Savings Goal' : 'New Savings Goal'} onClose={onClose}>
      <form className="space-y-3.5" onSubmit={submit}>
        <TextField
          label="Goal Name"
          type="text"
          required
          value={name}
          placeholder="e.g., Emergency Fund"
          onChange={(event) => setName(event.target.value)}
        />

        <div className="grid grid-cols-2 gap-2.5">
          <MoneyField label={`Target (${state.currency})`} value={target} onChange={setTarget} />
          <MoneyField label="Saved So Far" value={current} onChange={setCurrent} />
        </div>

        <TextField label="Target Date (optional)" type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} />

        <ColorPicker colors={GOAL_COLORS} value={color} onChange={setColor} />

        <PrimaryButton>{existing ? 'Save Goal' : 'Create Goal'}</PrimaryButton>
      </form>
    </Sheet>
  );
}

export default GoalSheet;
