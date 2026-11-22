import { CURRENCIES } from './constants';
import type { CurrencyCode } from './types';

export function formatMoney(amount: number, currency: CurrencyCode, showSign = false): string {
  const cfg = CURRENCIES[currency] ?? CURRENCIES.EGP;
  const num = Number(amount) || 0;
  const formatted = Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: cfg.decimals,
    maximumFractionDigits: cfg.decimals,
  });
  const sign = num < 0 ? '-' : showSign && num > 0 ? '+' : '';
  return sign + cfg.symbol + formatted;
}

export function formatMonthLabel(ym: string): string {
  const [year, month] = ym.split('-').map(Number);
  const d = new Date(year, (month || 1) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function shiftMonth(ym: string, delta: number): string {
  const [year, month] = ym.split('-').map(Number);
  const d = new Date(year, (month || 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Clamp a requested day to the last real day of the given month. */
export function dateInMonth(ym: string, day: number): string {
  const [year, month] = ym.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const safeDay = Math.min(Math.max(1, day || 1), lastDay);
  return `${ym}-${String(safeDay).padStart(2, '0')}`;
}

export function last6Months(endYm: string): string[] {
  const list: string[] = [];
  for (let i = 5; i >= 0; i--) list.push(shiftMonth(endYm, -i));
  return list;
}

export function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}
