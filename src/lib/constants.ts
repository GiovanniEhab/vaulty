import type { AccountType, CurrencyCode, WidgetId } from './types';

export const CURRENCIES: Record<CurrencyCode, { symbol: string; code: CurrencyCode; decimals: number; label: string }> = {
  EGP: { symbol: 'E£', code: 'EGP', decimals: 0, label: 'Egyptian Pound' },
  USD: { symbol: '$', code: 'USD', decimals: 2, label: 'US Dollar' },
  EUR: { symbol: '€', code: 'EUR', decimals: 2, label: 'Euro' },
  GBP: { symbol: '£', code: 'GBP', decimals: 2, label: 'British Pound' },
  SAR: { symbol: 'SAR ', code: 'SAR', decimals: 2, label: 'Saudi Riyal' },
  AED: { symbol: 'AED ', code: 'AED', decimals: 2, label: 'UAE Dirham' },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

export const EXPENSE_CATEGORIES = [
  { id: 'Housing', color: '#6366f1', icon: 'home' },
  { id: 'Groceries', color: '#10b981', icon: 'shopping-cart' },
  { id: 'Dining Out', color: '#f59e0b', icon: 'utensils' },
  { id: 'Transport', color: '#3b82f6', icon: 'car' },
  { id: 'Utilities', color: '#06b6d4', icon: 'zap' },
  { id: 'Healthcare', color: '#ef4444', icon: 'heart-pulse' },
  { id: 'Shopping', color: '#ec4899', icon: 'shopping-bag' },
  { id: 'Entertainment', color: '#8b5cf6', icon: 'film' },
  { id: 'Education', color: '#14b8a6', icon: 'graduation-cap' },
  { id: 'Other Expense', color: '#64748b', icon: 'tag' },
] as const;

export const INCOME_CATEGORIES = [
  { id: 'Salary', color: '#10b981', icon: 'briefcase' },
  { id: 'Freelance', color: '#0ea5e9', icon: 'laptop' },
  { id: 'Investments', color: '#8b5cf6', icon: 'trending-up' },
  { id: 'Gift / Bonus', color: '#f59e0b', icon: 'gift' },
  { id: 'Other Income', color: '#64748b', icon: 'plus-circle' },
] as const;

export const TRANSFER_META = { id: 'Transfer', color: '#6366f1', icon: 'arrow-left-right' } as const;

export const ACCOUNT_TYPES: { value: AccountType; label: string; icon: string }[] = [
  { value: 'checking', label: 'Bank / Checking', icon: 'landmark' },
  { value: 'cash', label: 'Cash Wallet', icon: 'banknote' },
  { value: 'savings', label: 'Savings Account', icon: 'piggy-bank' },
  { value: 'credit', label: 'Credit Card', icon: 'credit-card' },
];

export const ALL_CATEGORIES = [
  ...EXPENSE_CATEGORIES.map((c) => c.id),
  ...INCOME_CATEGORIES.map((c) => c.id),
  'Transfer',
];

export const ACCOUNT_COLORS = ['#059669', '#6366f1', '#f59e0b', '#e11d48', '#0ea5e9', '#8b5cf6'];
export const GOAL_COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#0ea5e9'];

export const WIDGET_CATALOG: { id: WidgetId; label: string; icon: string; description: string }[] = [
  { id: 'netWorth', label: 'Net worth', icon: 'wallet', description: 'Total balance across every account' },
  { id: 'month', label: 'This month', icon: 'receipt', description: 'Spent and earned this month' },
  { id: 'budget', label: 'Top budget', icon: 'pie-chart', description: 'The budget closest to its limit' },
  { id: 'goal', label: 'Top goal', icon: 'piggy-bank', description: 'Progress on your largest savings goal' },
  { id: 'voice', label: 'Ask Vaulty', icon: 'mic', description: 'One tap to speak a command' },
];
