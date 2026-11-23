export type TxType = 'income' | 'expense' | 'transfer';
export type AccountType = 'checking' | 'cash' | 'savings' | 'credit';
export type CurrencyCode = 'EGP' | 'USD' | 'EUR' | 'GBP' | 'SAR' | 'AED';
export type Theme = 'light' | 'dark';
export type WidgetId = 'netWorth' | 'month' | 'budget' | 'goal' | 'voice';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  initialBalance: number;
  color: string;
}

export interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  /** ISO date, YYYY-MM-DD */
  date: string;
  accountId: string;
  toAccountId: string | null;
  category: string;
  description: string;
  notes: string;
}

export interface Budget {
  id: string;
  category: string;
  limit: number;
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  current: number;
  deadline: string;
  color: string;
}

export interface Recurring {
  id: string;
  title: string;
  type: 'income' | 'expense';
  amount: number;
  dayOfMonth: number;
  accountId: string;
  category: string;
  lastLoggedMonth: string;
}

/** Preferences that live alongside the ledger. */
export interface Settings {
  currency: CurrencyCode;
  theme: Theme;
  /** Active month as YYYY-MM */
  activeMonth: string;
  isDemoData: boolean;
  demoBannerDismissed: boolean;
  /** Assistant reads its answers out loud. */
  voiceReplies: boolean;
  notificationsEnabled: boolean;
  /** 0-23, local time for the daily check-in reminder. */
  reminderHour: number;
  widgetIds: WidgetId[];
  /** Language the assistant listens and answers in. */
  assistantLanguage: 'en' | 'ar';
}

export interface VaultData {
  accounts: Account[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  recurring: Recurring[];
}

export type VaultState = VaultData & Settings;

export type CollectionName = 'accounts' | 'transactions' | 'budgets' | 'goals' | 'recurring';

export type ViewName = 'overview' | 'transactions' | 'accounts' | 'plan';
export type PlanTab = 'budgets' | 'goals' | 'recurring';
