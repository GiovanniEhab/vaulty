import { currentMonth, dateInMonth, shiftMonth } from './format';
import type { Budget, Goal, Recurring, Transaction, VaultState } from './types';

export function emptyState(currency: VaultState['currency'] = 'EGP', theme: VaultState['theme'] = 'light'): VaultState {
  return {
    currency,
    theme,
    activeMonth: currentMonth(),
    isDemoData: false,
    demoBannerDismissed: true,
    voiceReplies: true,
    notificationsEnabled: false,
    reminderHour: 20,
    widgetIds: ['netWorth', 'month', 'budget', 'voice'],
    assistantLanguage: 'en',
    autoUpdate: true,
    accounts: [
      { id: 'acc_main', name: 'Main Bank Account', type: 'checking', initialBalance: 0, color: '#059669' },
      { id: 'acc_wallet', name: 'Cash Wallet', type: 'cash', initialBalance: 0, color: '#f59e0b' },
    ],
    transactions: [],
    budgets: [],
    goals: [],
    recurring: [],
  };
}

/**
 * Sample ledger relative to the current month, so the first launch has
 * something to explore. "Start Fresh" clears it in one tap.
 */
export function sampleState(currency: VaultState['currency'] = 'EGP', theme: VaultState['theme'] = 'light'): VaultState {
  const thisMonth = currentMonth();
  const lastMonth = shiftMonth(thisMonth, -1);
  const twoAgo = shiftMonth(thisMonth, -2);

  const accounts = [
    { id: 'acc_bank', name: 'Main Bank Checking', type: 'checking' as const, initialBalance: 24500, color: '#059669' },
    { id: 'acc_cash', name: 'Everyday Cash Wallet', type: 'cash' as const, initialBalance: 9500, color: '#f59e0b' },
    { id: 'acc_sav', name: 'High-Yield Savings', type: 'savings' as const, initialBalance: 48000, color: '#6366f1' },
    { id: 'acc_cc', name: 'Rewards Credit Card', type: 'credit' as const, initialBalance: -4200, color: '#e11d48' },
  ];

  const tx = (
    id: string,
    type: Transaction['type'],
    amount: number,
    date: string,
    accountId: string,
    category: string,
    description: string,
    notes = '',
    toAccountId: string | null = null,
  ): Transaction => ({ id, type, amount, date, accountId, toAccountId, category, description, notes });

  const transactions: Transaction[] = [
    tx('tx_101', 'income', 34000, dateInMonth(thisMonth, 1), 'acc_bank', 'Salary', 'Monthly Salary Deposit', 'Primary employer'),
    tx('tx_102', 'expense', 9500, dateInMonth(thisMonth, 2), 'acc_bank', 'Housing', 'Apartment Rent', 'This month rent'),
    tx('tx_103', 'expense', 1450, dateInMonth(thisMonth, 4), 'acc_bank', 'Utilities', 'Electricity, Gas & Fiber Internet'),
    tx('tx_104', 'expense', 2680, dateInMonth(thisMonth, 6), 'acc_cc', 'Groceries', 'Supermarket Weekly Run', 'Fresh produce & pantry'),
    tx('tx_105', 'income', 6500, dateInMonth(thisMonth, 9), 'acc_bank', 'Freelance', 'UI Consulting Milestone', 'Client invoice #14'),
    tx('tx_106', 'expense', 920, dateInMonth(thisMonth, 11), 'acc_cash', 'Transport', 'Fuel & Ride-hailing'),
    tx('tx_107', 'expense', 1180, dateInMonth(thisMonth, 14), 'acc_cc', 'Dining Out', 'Dinner with Friends', 'Bistro downtown'),
    tx('tx_108', 'transfer', 6000, dateInMonth(thisMonth, 15), 'acc_bank', 'Transfer', 'Monthly Savings Allocation', 'Auto-transfer', 'acc_sav'),
    tx('tx_109', 'expense', 2150, dateInMonth(thisMonth, 17), 'acc_cc', 'Groceries', 'Organic Market & Coffee Beans'),
    tx('tx_110', 'expense', 1650, dateInMonth(thisMonth, 19), 'acc_bank', 'Shopping', 'Winter Jacket & Essentials'),
    tx('tx_111', 'expense', 640, dateInMonth(thisMonth, 21), 'acc_cash', 'Entertainment', 'Cinema & Streaming'),
    tx('tx_112', 'expense', 750, dateInMonth(thisMonth, 22), 'acc_cc', 'Healthcare', 'Pharmacy & Dental Checkup'),

    tx('tx_201', 'income', 34000, dateInMonth(lastMonth, 1), 'acc_bank', 'Salary', 'Monthly Salary Deposit'),
    tx('tx_202', 'income', 4200, dateInMonth(lastMonth, 16), 'acc_bank', 'Freelance', 'Design Audit'),
    tx('tx_203', 'expense', 9500, dateInMonth(lastMonth, 2), 'acc_bank', 'Housing', 'Apartment Rent'),
    tx('tx_204', 'expense', 5200, dateInMonth(lastMonth, 12), 'acc_cc', 'Groceries', 'Monthly Groceries'),
    tx('tx_205', 'expense', 3100, dateInMonth(lastMonth, 18), 'acc_cc', 'Dining Out', 'Cafes & Restaurants'),
    tx('tx_206', 'expense', 2400, dateInMonth(lastMonth, 22), 'acc_bank', 'Transport', 'Fuel & Car Service'),
    tx('tx_207', 'expense', 1550, dateInMonth(lastMonth, 25), 'acc_bank', 'Utilities', 'Monthly Bills'),

    tx('tx_301', 'income', 32500, dateInMonth(twoAgo, 1), 'acc_bank', 'Salary', 'Monthly Salary Deposit'),
    tx('tx_302', 'expense', 9500, dateInMonth(twoAgo, 2), 'acc_bank', 'Housing', 'Apartment Rent'),
    tx('tx_303', 'expense', 4900, dateInMonth(twoAgo, 14), 'acc_cc', 'Groceries', 'Monthly Groceries'),
    tx('tx_304', 'expense', 4600, dateInMonth(twoAgo, 20), 'acc_bank', 'Shopping', 'Home Office Desk Chair'),
    tx('tx_305', 'expense', 2100, dateInMonth(twoAgo, 24), 'acc_cash', 'Dining Out', 'Dining & Coffee'),
  ];

  const budgets: Budget[] = [
    { id: 'bud_1', category: 'Housing', limit: 10000 },
    { id: 'bud_2', category: 'Groceries', limit: 6000 },
    { id: 'bud_3', category: 'Dining Out', limit: 2500 },
    { id: 'bud_4', category: 'Transport', limit: 2000 },
    { id: 'bud_5', category: 'Utilities', limit: 1800 },
    { id: 'bud_6', category: 'Shopping', limit: 2000 },
    { id: 'bud_7', category: 'Entertainment', limit: 1500 },
  ];

  const goals: Goal[] = [
    { id: 'goal_1', name: 'Emergency Fund (6 Months)', target: 150000, current: 86000, deadline: `${Number(thisMonth.slice(0, 4)) + 1}-06-30`, color: '#10b981' },
    { id: 'goal_2', name: 'New MacBook Pro', target: 65000, current: 42500, deadline: `${Number(thisMonth.slice(0, 4)) + 1}-03-01`, color: '#6366f1' },
    { id: 'goal_3', name: 'Spring Vacation Fund', target: 35000, current: 18000, deadline: `${Number(thisMonth.slice(0, 4)) + 1}-04-15`, color: '#f59e0b' },
  ];

  const recurring: Recurring[] = [
    { id: 'rec_1', title: 'Monthly Salary', type: 'income', amount: 34000, dayOfMonth: 1, accountId: 'acc_bank', category: 'Salary', lastLoggedMonth: thisMonth },
    { id: 'rec_2', title: 'Apartment Rent', type: 'expense', amount: 9500, dayOfMonth: 2, accountId: 'acc_bank', category: 'Housing', lastLoggedMonth: thisMonth },
    { id: 'rec_3', title: 'Fiber Internet & Mobile', type: 'expense', amount: 850, dayOfMonth: 10, accountId: 'acc_bank', category: 'Utilities', lastLoggedMonth: '' },
    { id: 'rec_4', title: 'Gym Membership', type: 'expense', amount: 1100, dayOfMonth: 25, accountId: 'acc_cc', category: 'Healthcare', lastLoggedMonth: '' },
  ];

  return {
    currency,
    theme,
    activeMonth: thisMonth,
    isDemoData: true,
    demoBannerDismissed: false,
    voiceReplies: true,
    notificationsEnabled: false,
    reminderHour: 20,
    widgetIds: ['netWorth', 'month', 'budget', 'goal', 'voice'],
    assistantLanguage: 'en',
    autoUpdate: true,
    accounts,
    transactions,
    budgets,
    goals,
    recurring,
  };
}

/** Narrow an unknown value (imported JSON, Firestore doc) into a VaultState. */
export function normalizeState(input: unknown, fallback: VaultState): VaultState | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Partial<VaultState>;
  if (!Array.isArray(raw.accounts) || !Array.isArray(raw.transactions)) return null;
  return {
    ...fallback,
    currency: raw.currency ?? fallback.currency,
    theme: raw.theme === 'dark' ? 'dark' : 'light',
    activeMonth: typeof raw.activeMonth === 'string' ? raw.activeMonth : fallback.activeMonth,
    isDemoData: Boolean(raw.isDemoData),
    demoBannerDismissed: Boolean(raw.demoBannerDismissed),
    voiceReplies: typeof raw.voiceReplies === 'boolean' ? raw.voiceReplies : true,
    notificationsEnabled: Boolean(raw.notificationsEnabled),
    reminderHour: typeof raw.reminderHour === 'number' ? raw.reminderHour : 20,
    widgetIds: Array.isArray(raw.widgetIds) && raw.widgetIds.length > 0 ? raw.widgetIds : fallback.widgetIds,
    assistantLanguage: raw.assistantLanguage === 'ar' ? 'ar' : 'en',
    autoUpdate: raw.autoUpdate !== false,
    accounts: raw.accounts,
    transactions: raw.transactions,
    budgets: Array.isArray(raw.budgets) ? raw.budgets : [],
    goals: Array.isArray(raw.goals) ? raw.goals : [],
    recurring: Array.isArray(raw.recurring) ? raw.recurring : [],
  };
}
