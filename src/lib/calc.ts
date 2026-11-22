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
