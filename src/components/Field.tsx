import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes } from 'react';

const controlClass =
  'w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-slate-400">{children}</label>;
}

export function TextField({
  label,
  hint,
  className = 'h-11',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <div>
      <Label>
        {label}
        {hint ? <span className="ml-1 font-normal text-slate-400">{hint}</span> : null}
      </Label>
      <input {...props} className={`${controlClass} ${className}`} />
    </div>
  );
}

export function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type="number"
        step="0.01"
        inputMode="decimal"
        min="0"
        placeholder="0"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${controlClass} h-11 text-base font-bold tabular-nums`}
      />
    </div>
  );
}

export function SelectField({
  label,
  children,
  className = 'h-11',
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <div>
      {label ? <Label>{label}</Label> : null}
      <select {...props} className={`${controlClass} ${className}`}>
        {children}
      </select>
    </div>
  );
}

export function PrimaryButton({
  children,
  type = 'submit',
  onClick,
  tone = 'emerald',
}: {
  children: ReactNode;
  type?: 'submit' | 'button';
  onClick?: () => void;
  tone?: 'emerald' | 'rose';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={`h-12 w-full rounded-2xl text-sm font-bold text-white shadow-md transition-transform active:scale-[0.98] ${
        tone === 'rose' ? 'bg-rose-600 shadow-rose-600/20' : 'bg-emerald-600 shadow-emerald-600/20'
      }`}
    >
      {children}
    </button>
  );
}

export function ColorPicker({
  colors,
  value,
  onChange,
}: {
  colors: readonly string[];
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div>
      <Label>Color</Label>
      <div className="flex items-center gap-2.5">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Color ${color}`}
            aria-pressed={value === color}
            onClick={() => onChange(color)}
            className={`h-8 w-8 rounded-full ring-offset-2 transition-all dark:ring-offset-slate-900 ${
              value === color ? 'ring-2 ring-slate-900 dark:ring-white' : ''
            }`}
            style={{ background: color }}
          />
        ))}
      </div>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

export function ProgressBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, percent))}%`, background: color }} />
    </div>
  );
}
