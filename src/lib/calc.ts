import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, TRANSFER_META } from './constants';
import type { Account, Transaction, VaultState } from './types';

export interface MonthStats {
  income: number;
  expense: number;
  net: number;
  savingsRate: number;
  byCategory: Record<string, number>;
}

export function categoryMeta(category: string, type?: string) {
  if (type === 'transfer' || category === 'Transfer') return TRANSFER_META;
  const pool = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return (
    pool.find((c) => c.id === category) ??
    EXPENSE_CATEGORIES.find((c) => c.id === category) ??
    INCOME_CATEGORIES.find((c) => c.id === category) ??
    { id: category || 'Other', color: '#64748b', icon: 'tag' }
  );
}

export function accountTypeMeta(accounts: Account[], type: string) {
  return accounts.find((a) => a.type === type);
}

export function computeBalances(accounts: Account[], transactions: Transaction[]): Record<string, number> {
  const balances: Record<string, number> = {};
  accounts.forEach((acc) => {
    balances[acc.id] = Number(acc.initialBalance) || 0;
  });
  transactions.forEach((tx) => {
    const amount = Number(tx.amount) || 0;
    if (tx.type === 'income' && balances[tx.accountId] !== undefined) balances[tx.accountId] += amount;
    else if (tx.type === 'expense' && balances[tx.accountId] !== undefined) balances[tx.accountId] -= amount;
    else if (tx.type === 'transfer') {
      if (balances[tx.accountId] !== undefined) balances[tx.accountId] -= amount;
      if (tx.toAccountId && balances[tx.toAccountId] !== undefined) balances[tx.toAccountId] += amount;
    }
  });
  return balances;
}

export function netWorth(state: Pick<VaultState, 'accounts' | 'transactions'>): number {
  const balances = computeBalances(state.accounts, state.transactions);
  return Object.values(balances).reduce((sum, value) => sum + value, 0);
}

export function monthStats(transactions: Transaction[], ym: string): MonthStats {
  let income = 0;
  let expense = 0;
  const byCategory: Record<string, number> = {};
  transactions.forEach((tx) => {
    if (!tx.date || !tx.date.startsWith(ym)) return;
    const amount = Number(tx.amount) || 0;
    if (tx.type === 'income') income += amount;
    else if (tx.type === 'expense') {
      expense += amount;
      byCategory[tx.category] = (byCategory[tx.category] || 0) + amount;
    }
  });
  const net = income - expense;
  return {
    income,
    expense,
    net,
    savingsRate: income > 0 ? Math.round((net / income) * 100) : 0,
    byCategory,
  };
}

export function totalSpentInCategories(stats: MonthStats, categories: string[]): number {
  return categories.reduce((sum, category) => sum + (stats.byCategory[category] || 0), 0);
}

export interface DailyTotal {
  day: number;
  income: number;
  expense: number;
}

/** Income and expense for every day of the month, zeros included. */
export function dailyTotals(transactions: Transaction[], ym: string): DailyTotal[] {
  const [year, month] = ym.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const rows: DailyTotal[] = Array.from({ length: daysInMonth }, (_, index) => ({
    day: index + 1,
    income: 0,
    expense: 0,
  }));
  transactions.forEach((tx) => {
    if (!tx.date || !tx.date.startsWith(ym)) return;
    const day = Number(tx.date.slice(8, 10));
    if (day < 1 || day > daysInMonth) return;
    const amount = Number(tx.amount) || 0;
    if (tx.type === 'income') rows[day - 1].income += amount;
    else if (tx.type === 'expense') rows[day - 1].expense += amount;
  });
  return rows;
}

export interface CategoryTotal {
  category: string;
  total: number;
  share: number;
}

/** Totals per category for one side of the ledger, biggest first. */
export function categoryTotals(
  transactions: Transaction[],
  ym: string,
  type: 'income' | 'expense',
): CategoryTotal[] {
  const byCategory: Record<string, number> = {};
  let sum = 0;
  transactions.forEach((tx) => {
    if (!tx.date || !tx.date.startsWith(ym) || tx.type !== type) return;
    const amount = Number(tx.amount) || 0;
    byCategory[tx.category] = (byCategory[tx.category] || 0) + amount;
    sum += amount;
  });
  return Object.entries(byCategory)
    .map(([category, total]) => ({ category, total, share: sum > 0 ? total / sum : 0 }))
    .sort((a, b) => b.total - a.total);
}

export interface DescriptionTotal {
  label: string;
  total: number;
  count: number;
}

/** Biggest individual descriptions (merchants) for one side of the ledger. */
export function topDescriptions(
  transactions: Transaction[],
  ym: string,
  type: 'income' | 'expense',
  limit = 5,
): DescriptionTotal[] {
  const map: Record<string, { total: number; count: number }> = {};
  transactions.forEach((tx) => {
    if (!tx.date || !tx.date.startsWith(ym) || tx.type !== type) return;
    const label = (tx.description || tx.category || 'Other').trim();
    const entry = map[label] ?? { total: 0, count: 0 };
    entry.total += Number(tx.amount) || 0;
    entry.count += 1;
    map[label] = entry;
  });
  return Object.entries(map)
    .map(([label, value]) => ({ label, ...value }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export interface AccountFlow {
  account: Account;
  inflow: number;
  outflow: number;
  net: number;
}

/** Money into and out of each account during the month, transfers included. */
export function accountFlow(accounts: Account[], transactions: Transaction[], ym: string): AccountFlow[] {
  return accounts.map((account) => {
    let inflow = 0;
    let outflow = 0;
    transactions.forEach((tx) => {
      if (!tx.date || !tx.date.startsWith(ym)) return;
      const amount = Number(tx.amount) || 0;
      if (tx.type === 'income' && tx.accountId === account.id) inflow += amount;
      else if (tx.type === 'expense' && tx.accountId === account.id) outflow += amount;
      else if (tx.type === 'transfer') {
        if (tx.accountId === account.id) outflow += amount;
        if (tx.toAccountId === account.id) inflow += amount;
      }
    });
    return { account, inflow, outflow, net: inflow - outflow };
  });
}
