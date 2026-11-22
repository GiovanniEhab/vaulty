import { useState, type FormEvent } from 'react';
import { ACCOUNT_COLORS, ACCOUNT_TYPES } from '../lib/constants';
import { makeId } from '../lib/format';
import { toast } from '../lib/toast';
import type { Account, AccountType } from '../lib/types';
import { useVault } from '../store/VaultContext';
import { ColorPicker, MoneyField, PrimaryButton, SelectField, TextField } from '../components/Field';
import Sheet from '../components/Sheet';

export function AccountSheet({ id, onClose }: { id?: string; onClose: () => void }) {
  const { state, saveAccount } = useVault();
  const existing = id ? state.accounts.find((a) => a.id === id) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<AccountType>(existing?.type ?? 'checking');
  const [initialBalance, setInitialBalance] = useState(existing ? String(existing.initialBalance) : '0');
  const [color, setColor] = useState(existing?.color ?? ACCOUNT_COLORS[0]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      toast('Give the account a name.', 'error');
      return;
    }
    const account: Account = {
      id: existing?.id ?? makeId('acc'),
      name: name.trim(),
      type,
      initialBalance: Number.parseFloat(initialBalance) || 0,
      color,
    };
    saveAccount(account);
    onClose();
  };

  return (
    <Sheet title={existing ? 'Edit Account' : 'New Account'} onClose={onClose}>
      <form className="space-y-3.5" onSubmit={submit}>
        <TextField
          label="Account Name"
          type="text"
          required
          value={name}
          placeholder="e.g., Bank Checking, Cash Wallet"
          onChange={(event) => setName(event.target.value)}
        />

        <div className="grid grid-cols-2 gap-2.5">
          <SelectField label="Type" value={type} onChange={(event) => setType(event.target.value as AccountType)}>
            {ACCOUNT_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <MoneyField label="Opening Balance" value={initialBalance} onChange={setInitialBalance} />
        </div>

        <ColorPicker colors={ACCOUNT_COLORS} value={color} onChange={setColor} />

        <PrimaryButton>{existing ? 'Save Account' : 'Create Account'}</PrimaryButton>
      </form>
    </Sheet>
  );
}

export default AccountSheet;
