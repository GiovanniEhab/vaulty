import { monthStats } from './calc';
import { CURRENCIES, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from './constants';
import { dateInMonth, formatMoney, formatMonthLabel, makeId, shiftMonth, todayISO } from './format';
import type {
  Account,
  Budget,
  CurrencyCode,
  Goal,
  PlanTab,
  Settings,
  Transaction,
  VaultState,
  ViewName,
} from './types';

export type AssistantPlan =
  | { kind: 'transaction'; transaction: Transaction; reply: string }
  | { kind: 'budget'; budget: Budget; reply: string }
  | { kind: 'goal'; goalId: string; delta: number; reply: string }
  | { kind: 'settings'; patch: Partial<Settings>; reply: string }
  | { kind: 'navigate'; view: ViewName; planTab?: PlanTab; reply: string }
  | { kind: 'delete'; id: string; reply: string }
  | { kind: 'answer'; reply: string };

const norm = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s.']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const titleCase = (value: string) =>
  value
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const GENERIC_ACCOUNT_WORDS = new Set(['account', 'bank', 'wallet', 'card', 'my', 'main', 'everyday', 'rewards']);

function parseAmount(text: string): number | null {
  const match = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(k\b|thousand\b)?/);
  if (!match) return null;
  let value = Number.parseFloat(match[1].replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  if (match[2]) value *= 1000;
  return value;
}

function findAccount(text: string, accounts: Account[], excludeId?: string): Account | null {
  if (!text.trim() || accounts.length === 0) return null;
  const pool = accounts.filter((account) => account.id !== excludeId);
  const direct = pool.find((account) => text.includes(norm(account.name)));
  if (direct) return direct;

  let best: { account: Account; score: number } | null = null;
  pool.forEach((account) => {
    const tokens = norm(account.name)
      .split(' ')
      .filter((token) => token.length >= 4 && !GENERIC_ACCOUNT_WORDS.has(token));
    const score = tokens.filter((token) => text.includes(token)).length;
    if (score > 0 && (!best || score > best.score)) best = { account, score };
  });
  return best ? (best as { account: Account }).account : null;
}

const CATEGORY_ALIASES: Record<string, string[]> = {
  Groceries: ['grocer', 'supermarket', 'food shop'],
  'Dining Out': ['dining', 'restaurant', 'cafe', 'coffee', 'lunch', 'dinner', 'takeout', 'eat out'],
  Transport: ['transport', 'fuel', 'petrol', 'gas', 'uber', 'taxi', 'ride', 'commute'],
  Housing: ['housing', 'rent', 'mortgage'],
  Utilities: ['utilities', 'electric', 'water', 'internet', 'phone bill', 'bills'],
  Healthcare: ['healthcare', 'health', 'pharmacy', 'doctor', 'dentist', 'gym'],
  Shopping: ['shopping', 'clothes', 'jacket', 'shoes', 'amazon'],
  Entertainment: ['entertainment', 'movie', 'cinema', 'streaming', 'netflix', 'game'],
  Education: ['education', 'course', 'book', 'school', 'tuition'],
  Salary: ['salary', 'paycheck', 'wage', 'payroll'],
  Freelance: ['freelance', 'client', 'consult'],
  Investments: ['investment', 'dividend', 'stock'],
  'Gift / Bonus': ['gift', 'bonus', 'present'],
};

function findCategory(text: string, type: 'income' | 'expense'): { id: string; color: string } | null {
  const pool = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const direct = pool.find((category) => text.includes(norm(category.id)));
  if (direct) return direct;
  for (const category of pool) {
    const aliases = CATEGORY_ALIASES[category.id] ?? [];
    if (aliases.some((alias) => text.includes(alias))) return category;
  }
  return null;
}

function findGoal(text: string, goals: Goal[]): Goal | null {
  const direct = goals.find((goal) => text.includes(norm(goal.name)));
  if (direct) return direct;
  let best: { goal: Goal; score: number } | null = null;
  goals.forEach((goal) => {
    const tokens = norm(goal.name)
      .split(' ')
      .filter((token) => token.length >= 4 && !['fund', 'months', 'goal', 'savings'].includes(token));
    const score = tokens.filter((token) => text.includes(token)).length;
    if (score > 0 && (!best || score > best.score)) best = { goal, score };
  });
  return best ? (best as { goal: Goal }).goal : null;
}

function describeFrom(text: string, accounts: Account[], fallback: string): string {
  let working = text;
  accounts.forEach((account) => {
    working = working.replace(norm(account.name), ' ');
  });

  /* "250 on groceries" → Groceries, but never accept a bare number. */
  const matches = working.matchAll(/\b(?:on|for|at)\s+([a-z0-9][a-z0-9 .'-]{1,40})/g);
  for (const match of matches) {
    const cleaned = match[1]
      .replace(/\b(today|yesterday|please|thanks)\b/g, '')
      .replace(/\b(from|in|into|to)\b.*$/, '')
      .trim();
    if (!cleaned || /^[\d,.\s]+$/.test(cleaned)) continue;
    return titleCase(cleaned);
  }

  /* "bought a jacket for 800" → Jacket */
  const leftover = working
    .replace(/\b\d[\d,]*(?:\.\d+)?\b/g, ' ')
    .replace(
      /\b(spent|spend|paid|pay|bought|buy|add|added|log|logged|cost|costs|please|today|yesterday|the|a|an|on|for|at|from|to|in|into|my)\b/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
  return leftover ? titleCase(leftover) : fallback;
}

function commandDate(text: string, activeMonth: string): string {
  const date = new Date();
  if (/\byesterday\b/.test(text)) date.setDate(date.getDate() - 1);
  else if (/\blast week\b/.test(text)) date.setDate(date.getDate() - 7);
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  if (iso.startsWith(activeMonth)) return iso;
  return dateInMonth(activeMonth, 1);
}

const CURRENCY_WORDS: { words: string[]; code: CurrencyCode }[] = [
  { words: ['egyptian pound', 'egypt pound', 'egp'], code: 'EGP' },
  { words: ['saudi riyal', 'riyal', 'sar'], code: 'SAR' },
  { words: ['dollar', 'usd', 'buck'], code: 'USD' },
  { words: ['euro', 'eur'], code: 'EUR' },
  { words: ['dirham', 'aed'], code: 'AED' },
  { words: ['pound', 'sterling', 'gbp'], code: 'GBP' },
];

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

export const ASSISTANT_SUGGESTIONS = [
  'Spent 250 on groceries',
  'Deposit 5000 salary into main bank',
  'How much is left for groceries?',
  'Transfer 1000 from bank to savings',
  'Set groceries budget to 6000',
  'Add 500 to my emergency fund',
  'Dark mode',
  'What can you do?',
];

export function assistantHelp(): string {
  return [
    'I can log money and change Vaulty. Try:',
    '• "Spent 250 on groceries" — adds an expense',
    '• "Deposit 5000 salary into main bank" — adds income',
    '• "Transfer 1000 from bank to savings"',
    '• "Set groceries budget to 6000"',
    '• "Add 500 to my emergency fund"',
    '• "How much is left for groceries?"',
    '• "Dark mode", "Use dollars", "Next month", "Open budgets"',
  ].join('\n');
}

/** Turns a spoken/typed sentence into an executable plan plus a spoken reply. */
export function planCommand(raw: string, state: VaultState): AssistantPlan {
  const text = norm(raw);
  const money = (value: number) => formatMoney(value, state.currency);
  const stats = monthStats(state.transactions, state.activeMonth);
  const amount = parseAmount(text);

  if (!text) {
    return { kind: 'answer', reply: 'I did not hear anything. Tap the microphone and try again.' };
  }

  if (/\b(help|what can you do|commands|what do you do)\b/.test(text)) {
    return { kind: 'answer', reply: assistantHelp() };
  }

  if (/^(hi|hey|hello|yo)\b/.test(text)) {
    return { kind: 'answer', reply: `Hi. You have ${money(Object.values(netWorthBalances(state)).reduce((a, b) => a + b, 0))} across ${state.accounts.length} accounts. Ask me to log something or say "help".` };
  }

  /* ---------- preferences ---------- */
  if (/\b(dark mode|dark theme|night mode)\b/.test(text)) {
    return { kind: 'settings', patch: { theme: 'dark' }, reply: 'Dark mode on.' };
  }
  if (/\b(light mode|light theme|day mode)\b/.test(text)) {
    return { kind: 'settings', patch: { theme: 'light' }, reply: 'Light mode on.' };
  }
  if (/\b(toggle|switch)\b.*\b(theme|mode)\b/.test(text)) {
    return {
      kind: 'settings',
      patch: { theme: state.theme === 'dark' ? 'light' : 'dark' },
      reply: `${state.theme === 'dark' ? 'Light' : 'Dark'} mode on.`,
    };
  }
  if (/\b(turn on|enable|start)\b.*notifications?\b/.test(text)) {
    return { kind: 'settings', patch: { notificationsEnabled: true }, reply: 'Notifications on.' };
  }
  if (/\b(turn off|disable|stop|mute)\b.*notifications?\b/.test(text)) {
    return { kind: 'settings', patch: { notificationsEnabled: false }, reply: 'Notifications off.' };
  }
  if (/\b(stop talking|mute voice|stop speaking|be quiet)\b/.test(text)) {
    return { kind: 'settings', patch: { voiceReplies: false }, reply: 'Okay, I will stay quiet.' };
  }
  if (/\b(speak|talk to me|read it out|unmute voice)\b/.test(text) && !amount) {
    return { kind: 'settings', patch: { voiceReplies: true }, reply: 'I will read my answers out loud.' };
  }
  const reminderMatch = text.match(/remind me (?:at|on) (\d{1,2})(?::\d{2})?\s*(am|pm)?/);
  if (reminderMatch) {
    let hour = Number.parseInt(reminderMatch[1], 10);
    if (reminderMatch[2] === 'pm' && hour < 12) hour += 12;
    if (reminderMatch[2] === 'am' && hour === 12) hour = 0;
    hour = Math.min(23, Math.max(0, hour));
    const label = `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? 'AM' : 'PM'}`;
    return {
      kind: 'settings',
      patch: { notificationsEnabled: true, reminderHour: hour },
      reply: `I will remind you at ${label} each day while Vaulty is open.`,
    };
  }
  const currencyWord = CURRENCY_WORDS.find((entry) => entry.words.some((word) => text.includes(word)));
  if (currencyWord && /\b(currency|use|switch|change|show|in)\b/.test(text)) {
    return {
      kind: 'settings',
      patch: { currency: currencyWord.code },
      reply: `Currency set to ${CURRENCIES[currencyWord.code].label}.`,
    };
  }

  /* ---------- month navigation ---------- */
  const asksAQuestion = /\b(how much|what|did|earn|earned|spend|spent|left)\b/.test(text);
  if (/\bnext month\b/.test(text) && !asksAQuestion) {
    const next = shiftMonth(state.activeMonth, 1);
    return { kind: 'settings', patch: { activeMonth: next }, reply: `Showing ${formatMonthLabel(next)}.` };
  }
  if (/\b(last month|previous month|back a month)\b/.test(text) && !asksAQuestion) {
    const previous = shiftMonth(state.activeMonth, -1);
    return { kind: 'settings', patch: { activeMonth: previous }, reply: `Showing ${formatMonthLabel(previous)}.` };
  }
  if (/\b(this month|current month)\b/.test(text) && !asksAQuestion) {
    return { kind: 'settings', patch: { activeMonth: todayISO().slice(0, 7) }, reply: 'Showing this month.' };
  }
  const monthName = MONTH_NAMES.find((name) => text.includes(name));
  if (monthName && /\b(show|open|go to|switch)\b/.test(text)) {
    const month = String(MONTH_NAMES.indexOf(monthName) + 1).padStart(2, '0');
    const target = `${state.activeMonth.slice(0, 4)}-${month}`;
    return { kind: 'settings', patch: { activeMonth: target }, reply: `Showing ${formatMonthLabel(target)}.` };
  }

  /* ---------- navigation ---------- */
  const wantsOpen = /\b(open|show|go to|take me to)\b/.test(text);
  if (wantsOpen) {
    if (/\b(bills|recurring|subscriptions)\b/.test(text)) {
      return { kind: 'navigate', view: 'plan', planTab: 'recurring', reply: 'Opening recurring bills.' };
    }
    if (/\b(goals|savings goal)\b/.test(text)) {
      return { kind: 'navigate', view: 'plan', planTab: 'goals', reply: 'Opening savings goals.' };
    }
    if (/\bbudgets?\b/.test(text)) {
      return { kind: 'navigate', view: 'plan', planTab: 'budgets', reply: 'Opening budgets.' };
    }
    if (/\b(accounts|wallets|balances)\b/.test(text)) {
      return { kind: 'navigate', view: 'accounts', reply: 'Opening accounts.' };
    }
    if (/\b(activity|transactions|history)\b/.test(text)) {
      return { kind: 'navigate', view: 'transactions', reply: 'Opening activity.' };
    }
    if (/\b(home|dashboard|overview)\b/.test(text)) {
      return { kind: 'navigate', view: 'overview', reply: 'Opening home.' };
    }
  }

  /* ---------- questions ---------- */
  if (/\b(balance|net worth|how much money|total money|how much do i have)\b/.test(text) && !amount) {
    const total = Object.values(netWorthBalances(state)).reduce((a, b) => a + b, 0);
    return { kind: 'answer', reply: `Your net worth is ${money(total)} across ${state.accounts.length} accounts.` };
  }
  if (/\b(savings rate|how much am i saving)\b/.test(text)) {
    return { kind: 'answer', reply: `You saved ${stats.savingsRate}% of your income in ${formatMonthLabel(state.activeMonth)}.` };
  }
  if (/\bleft\b|\bremaining\b|\bbudget\b/.test(text) && /\b(how much|what|left|remaining|status)\b/.test(text) && !/\bset\b|\bchange\b|\bupdate\b/.test(text)) {
    const category = findCategory(text, 'expense');
    if (category) {
      const budget = state.budgets.find((item) => item.category === category.id);
      if (!budget) {
        return { kind: 'answer', reply: `You have no budget for ${category.id}. Spent so far: ${money(stats.byCategory[category.id] || 0)}.` };
      }
      const spent = stats.byCategory[category.id] || 0;
      const left = budget.limit - spent;
      return {
        kind: 'answer',
        reply:
          left >= 0
            ? `${money(left)} left for ${category.id} — ${money(spent)} spent of ${money(budget.limit)}.`
            : `You are ${money(Math.abs(left))} over the ${category.id} budget (${money(spent)} of ${money(budget.limit)}).`,
      };
    }
    const totalLimit = state.budgets.reduce((sum, item) => sum + item.limit, 0);
    const totalSpent = state.budgets.reduce((sum, item) => sum + (stats.byCategory[item.category] || 0), 0);
    const left = totalLimit - totalSpent;
    return {
      kind: 'answer',
      reply:
        totalLimit === 0
          ? 'You have no budgets yet. Say "set groceries budget to 6000".'
          : left >= 0
            ? `${money(left)} left across your budgets. ${money(totalSpent)} spent of ${money(totalLimit)}.`
            : `You are ${money(Math.abs(left))} over budget this month.`,
    };
  }
  if (/\b(spend|spent|spending|expenses)\b/.test(text) && /\b(how much|what|total|this month)\b/.test(text)) {
    const category = findCategory(text, 'expense');
    if (category) {
      return {
        kind: 'answer',
        reply: `You spent ${money(stats.byCategory[category.id] || 0)} on ${category.id} in ${formatMonthLabel(state.activeMonth)}.`,
      };
    }
    return {
      kind: 'answer',
      reply: `You spent ${money(stats.expense)} in ${formatMonthLabel(state.activeMonth)} and earned ${money(stats.income)}.`,
    };
  }
  if (/\b(income|earn|earned)\b/.test(text) && /\b(how much|total|this month)\b/.test(text)) {
    return { kind: 'answer', reply: `Income in ${formatMonthLabel(state.activeMonth)} is ${money(stats.income)}.` };
  }

  /* ---------- savings goals ---------- */
  const goal = findGoal(text, state.goals);
  if (goal && amount && /\b(add|put|save|contribute|deposit)\b/.test(text)) {
    const after = Math.max(0, goal.current + amount);
    const pct = goal.target > 0 ? Math.min(100, Math.round((after / goal.target) * 100)) : 0;
    return {
      kind: 'goal',
      goalId: goal.id,
      delta: amount,
      reply: `Added ${money(amount)} to "${goal.name}". You are at ${pct}% of the target.`,
    };
  }

  /* ---------- budgets ---------- */
  if (/\bbudget\b/.test(text) && amount && /\b(set|change|update|make|create|raise|lower)\b/.test(text)) {
    const category = findCategory(text, 'expense') ?? EXPENSE_CATEGORIES.find((item) => item.id === 'Other Expense')!;
    const existing = state.budgets.find((item) => item.category === category.id);
    const budget: Budget = { id: existing?.id ?? makeId('bud'), category: category.id, limit: amount };
    return {
      kind: 'budget',
      budget,
      reply: existing ? `Updated the ${category.id} budget to ${money(amount)}.` : `Set a ${money(amount)} budget for ${category.id}.`,
    };
  }

  /* ---------- money movement ---------- */
  if (state.accounts.length === 0) {
    return { kind: 'answer', reply: 'Create an account first, then I can log money for you.' };
  }

  if (/\b(transfer|move)\b/.test(text) && amount) {
    const parts = text.split(/\bto\b/);
    const to = findAccount(parts[1] ?? '', state.accounts) ?? findAccount(text, state.accounts);
    const fromPart = parts[0].split(/\bfrom\b/)[1] ?? '';
    const from = findAccount(fromPart, state.accounts, to?.id) ?? state.accounts.find((account) => account.id !== to?.id);
    if (to && from && to.id !== from.id) {
      const transaction: Transaction = {
        id: makeId('tx'),
        type: 'transfer',
        amount,
        date: commandDate(text, state.activeMonth),
        accountId: from.id,
        toAccountId: to.id,
        category: 'Transfer',
        description: `Transfer to ${to.name}`,
        notes: 'Logged by assistant',
      };
      return {
        kind: 'transaction',
        transaction,
        reply: `Moved ${money(amount)} from ${from.name} to ${to.name}.`,
      };
    }
    return { kind: 'answer', reply: 'Tell me the amount and both accounts, like "transfer 1000 from bank to savings".' };
  }

  const isIncome =
    /\b(deposit|income|salary|received|receive|earned|got paid|paycheck|freelance payment)\b/.test(text) ||
    (/\b(add|put)\b/.test(text) && /\b(to|into|in)\b/.test(text) && !/\b(for|on)\b/.test(text));

  const isExpense =
    /\b(spent|spend|paid|pay|bought|buy|expense|cost)\b/.test(text) ||
    (/\b(add|put|log)\b/.test(text) && /\b(for|on)\b/.test(text));

  if (amount && (isIncome || isExpense)) {
    const type: 'income' | 'expense' = isIncome && !isExpense ? 'income' : 'expense';
    const category = findCategory(text, type);
    const targetWord = type === 'income' ? text.split(/\b(to|into|in)\b/).slice(1).join(' ') : text.split(/\bfrom\b/)[1] ?? '';
    const account = findAccount(targetWord, state.accounts) ?? findAccount(text, state.accounts) ?? state.accounts[0];
    const description =
      type === 'income'
        ? category?.id ?? 'Voice income'
        : describeFrom(text, state.accounts, category?.id ?? 'Voice expense');
    const transaction: Transaction = {
      id: makeId('tx'),
      type,
      amount,
      date: commandDate(text, state.activeMonth),
      accountId: account.id,
      toAccountId: null,
      category: type === 'income' ? category?.id ?? 'Other Income' : category?.id ?? 'Other Expense',
      description,
      notes: 'Logged by assistant',
    };
    return {
      kind: 'transaction',
      transaction,
      reply:
        type === 'income'
          ? `Added ${money(amount)} of income to ${account.name}${category ? ` under ${category.id}` : ''}.`
          : `Logged ${money(amount)} for ${description} from ${account.name}${category ? ` under ${category.id}` : ''}.`,
    };
  }

  /* ---------- undo ---------- */
  if (/\b(undo|delete last|remove last)\b/.test(text)) {
    const latest = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0];
    if (!latest) return { kind: 'answer', reply: 'There is nothing to undo.' };
    return {
      kind: 'delete',
      id: latest.id,
      reply: `Deleted "${latest.description || latest.category}" (${money(latest.amount)}).`,
    };
  }

  return {
    kind: 'answer',
    reply:
      'I did not catch that. Try "spent 250 on groceries", "deposit 5000 salary into main bank", or say "help".',
  };
}

function netWorthBalances(state: VaultState): Record<string, number> {
  const balances: Record<string, number> = {};
  state.accounts.forEach((account) => {
    balances[account.id] = Number(account.initialBalance) || 0;
  });
  state.transactions.forEach((tx) => {
    const value = Number(tx.amount) || 0;
    if (tx.type === 'income' && balances[tx.accountId] !== undefined) balances[tx.accountId] += value;
    else if (tx.type === 'expense' && balances[tx.accountId] !== undefined) balances[tx.accountId] -= value;
    else if (tx.type === 'transfer') {
      if (balances[tx.accountId] !== undefined) balances[tx.accountId] -= value;
      if (tx.toAccountId && balances[tx.toAccountId] !== undefined) balances[tx.toAccountId] += value;
    }
  });
  return balances;
}
