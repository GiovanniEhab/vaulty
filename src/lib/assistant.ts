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

export type AssistantLanguage = 'en' | 'ar';

export type AssistantPlan =
  | { kind: 'transaction'; transaction: Transaction; reply: string }
  | { kind: 'budget'; budget: Budget; reply: string }
  | { kind: 'goal'; goalId: string; delta: number; reply: string }
  | { kind: 'settings'; patch: Partial<Settings>; reply: string }
  | { kind: 'navigate'; view: ViewName; planTab?: PlanTab; reply: string }
  | { kind: 'insights'; reply: string }
  | { kind: 'delete'; id: string; reply: string }
  | { kind: 'answer'; reply: string };

const ARABIC_LETTERS = /[\u0600-\u06FF]/;

/** Lower-case, strip diacritics, fold Arabic letter variants, convert digits. */
function normalize(raw: string): string {
  let text = raw.toLowerCase();
  text = text.replace(/[\u064B-\u065F\u0670\u0640]/g, '');
  text = text.replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  text = text.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
  text = text.replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
  text = text.replace(/[^a-z0-9\u0600-\u06FF\s.']/g, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

/** Light normalisation that keeps Arabic spelling intact, for stored text. */
function lexical(raw: string): string {
  let text = raw.toLowerCase();
  text = text.replace(/[\u064B-\u065F\u0670\u0640]/g, '');
  text = text.replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  text = text.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
  text = text.replace(/[^a-z0-9\u0600-\u06FF\s.']/g, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

const kw = (words: string[]) => words.map(normalize);

const has = (text: string, words: string[]) => words.some((word) => word && text.includes(word));

const K = {
  help: kw(['help', 'what can you do', 'commands', 'مساعدة', 'مساعده', 'ماذا تفعل', 'ايش تعمل', 'الأوامر']),
  greeting: kw(['hi', 'hey', 'hello', 'yo', 'اهلا', 'سلام', 'السلام عليكم', 'هاي']),
  dark: kw(['dark mode', 'dark theme', 'night mode', 'الوضع الليلي', 'الوضع الداكن', 'ليلي', 'دارك']),
  light: kw(['light mode', 'light theme', 'day mode', 'الوضع النهاري', 'نهاري', 'لايت']),
  themeToggle: kw(['toggle theme', 'switch theme', 'بدل الوضع', 'غير الوضع']),
  notificationsOn: kw(['turn on notifications', 'enable notifications', 'notifications on', 'فعل الاشعارات', 'شغل الاشعارات', 'اشعارات']),
  notificationsOff: kw(['turn off notifications', 'disable notifications', 'اقفل الاشعارات', 'اطفي الاشعارات', 'بلاش اشعارات']),
  mute: kw(['stop talking', 'mute voice', 'be quiet', 'اسكت', 'بلاش كلام', 'مش تتكلم']),
  unmute: kw(['speak replies', 'read it out', 'unmute voice', 'اتكلم', 'قول بصوت', 'اقرا الرد']),
  remind: kw(['remind me', 'فكرني', 'نبهني', 'ذكرني']),
  currency: kw(['currency', 'use', 'switch', 'العملة', 'عملة', 'حول العملة', 'استخدم', 'خلي']),
  nextMonth: kw(['next month', 'الشهر الجاي', 'الشهر القادم', 'الشهر الجى']),
  lastMonth: kw(['last month', 'previous month', 'الشهر اللي فات', 'الشهر الماضي', 'الشهر السابق']),
  thisMonth: kw(['this month', 'current month', 'هذا الشهر', 'الشهر ده', 'الشهر الحالي']),
  open: kw(['open', 'show', 'go to', 'take me to', 'افتح', 'اعرض', 'روح', 'وديني']),
  accounts: kw(['accounts', 'wallets', 'balances', 'الحسابات', 'المحافظ', 'الارصدة']),
  transactions: kw(['activity', 'transactions', 'history', 'الحركات', 'المعاملات', 'العمليات', 'السجل']),
  home: kw(['home', 'dashboard', 'overview', 'الرئيسية', 'اللوحة']),
  budgets: kw(['budgets', 'budget', 'الميزانيات', 'الميزانية', 'ميزانية']),
  goals: kw(['goals', 'savings goal', 'الاهداف', 'هدف', 'اهداف']),
  recurring: kw(['bills', 'recurring', 'subscriptions', 'الفواتير', 'المتكررة', 'الاشتراكات']),
  insights: kw(['insights', 'analytics', 'charts', 'reports', 'diagrams', 'التحليلات', 'التقارير', 'الرسوم', 'الاحصائيات', 'الرسوم البيانية']),
  balance: kw(['balance', 'net worth', 'how much money', 'total money', 'how much do i have', 'رصيد', 'الرصيد', 'صافي', 'فلوسي', 'معايا']),
  savingsRate: kw(['savings rate', 'how much am i saving', 'نسبة التوفير', 'بوفر كام']),
  spentWords: kw(['spend', 'spent', 'spending', 'expenses', 'صرفت', 'صرف', 'مصروف', 'انفقت', 'المصروف']),
  incomeWords: kw(['income', 'earn', 'earned', 'دخل', 'كسبت', 'الدخل']),
  leftWords: kw(['left', 'remaining', 'فاضل', 'باقي', 'متبقي']),
  questionWords: kw(['how much', 'what', 'did', 'total', 'كم', 'بكام', 'ايه', 'كام']),
  transfer: kw(['transfer', 'move', 'حول', 'تحويل', 'انقل']),
  incomeVerbs: kw([
    'deposit',
    'income',
    'salary',
    'received',
    'receive',
    'earned',
    'got paid',
    'paycheck',
    'ايداع',
    'اودع',
    'اودعت',
    'راتب',
    'قبضت',
    'استلمت',
    'وصلني',
    'دخل',
  ]),
  expenseVerbs: kw([
    'spent',
    'spend',
    'paid',
    'pay',
    'bought',
    'buy',
    'expense',
    'cost',
    'صرفت',
    'صرف',
    'دفعت',
    'دفع',
    'اشتريت',
    'اشتري',
    'مصروف',
    'كلفني',
  ]),
  addVerbs: kw(['add', 'put', 'log', 'ضيف', 'اضف', 'سجل']),
  goalVerbs: kw(['add', 'put', 'save', 'contribute', 'ضيف', 'اضف', 'حوش', 'ادخر', 'ساهم']),
  setVerbs: kw(['set', 'change', 'update', 'make', 'create', 'raise', 'lower', 'حدد', 'عدل', 'غير', 'اعمل', 'خلي']),
  yesterday: kw(['yesterday', 'امبارح', 'امس']),
  lastWeek: kw(['last week', 'الاسبوع اللي فات', 'الاسبوع الماضي']),
  undo: kw(['undo', 'delete last', 'remove last', 'تراجع', 'امسح اخر', 'الغاء']),
  forWords: kw(['for', 'on', 'at', 'علي', 'على', 'في']),
  fromWords: kw(['from', 'من']),
};

const AR_NUMBER_WORDS: { word: string; value: number }[] = [
  { word: normalize('ألفين'), value: 2000 },
  { word: normalize('ميتين'), value: 200 },
  { word: normalize('خمسمية'), value: 500 },
  { word: normalize('مية'), value: 100 },
  { word: normalize('ألف'), value: 1000 },
];

function hasWord(text: string, word: string): boolean {
  if (!word) return false;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(text);
}

function parseAmount(text: string): number | null {
  const match = text.match(/(\d[\d,]*(?:\.\d+)?)/);
  if (match) {
    const value = Number.parseFloat(match[1].replace(/,/g, ''));
    if (!Number.isFinite(value)) return null;
    const tail = text.slice((match.index ?? 0) + match[1].length).trimStart();
    if (/^(k\b|thousand\b|الف(?=\s|$)|الاف(?=\s|$))/.test(tail)) return value * 1000;
    return value;
  }
  for (const entry of AR_NUMBER_WORDS) {
    if (hasWord(text, entry.word)) return entry.value;
  }
  return null;
}

const ACCOUNT_HINTS: { words: string[]; types: string[] }[] = [
  { words: kw(['توفير', 'سيفينج', 'savings']), types: ['savings'] },
  { words: kw(['كاش', 'نقدي', 'محفظة', 'cash']), types: ['cash'] },
  { words: kw(['كريدت', 'بطاقة', 'فيزا', 'credit']), types: ['credit'] },
  { words: kw(['بنك', 'جاري', 'checking']), types: ['checking'] },
];

const GENERIC_ACCOUNT_WORDS = new Set(
  ['account', 'bank', 'wallet', 'card', 'my', 'main', 'everyday', 'rewards', 'الحساب', 'حساب', 'محفظه', 'المحفظه', 'بنك', 'البنك', 'بطاقه', 'كارت'].map(
    normalize,
  ),
);

function findAccount(text: string, accounts: Account[], excludeId?: string): Account | null {
  if (!text.trim() || accounts.length === 0) return null;
  const pool = accounts.filter((account) => account.id !== excludeId);
  const direct = pool.find((account) => text.includes(normalize(account.name)));
  if (direct) return direct;

  let found: Account | null = null;
  let bestScore = 0;
  pool.forEach((account) => {
    const tokens = normalize(account.name)
      .split(' ')
      .filter((token) => token.length >= 3 && !GENERIC_ACCOUNT_WORDS.has(token));
    const score = tokens.filter((token) => text.includes(token)).length;
    if (score > bestScore) {
      bestScore = score;
      found = account;
    }
  });
  if (found) return found;

  const hint = ACCOUNT_HINTS.find((entry) => has(text, entry.words));
  if (hint) {
    const match = pool.find((account) => hint.types.includes(account.type));
    if (match) return match;
  }

  return null;
}

const CATEGORY_ALIASES: Record<string, string[]> = {
  Groceries: ['grocer', 'supermarket', 'food shop', 'بقال', 'سوبر ماركت', 'خضار', 'فاكه', 'سوق'],
  'Dining Out': ['dining', 'restaurant', 'cafe', 'coffee', 'lunch', 'dinner', 'takeout', 'مطعم', 'مطاعم', 'قهوه', 'كافيه', 'غدا', 'عشا', 'فطار', 'اكل'],
  Transport: ['transport', 'fuel', 'petrol', 'gas', 'uber', 'taxi', 'ride', 'commute', 'مواصلات', 'بنزين', 'تاكسي', 'اوبر', 'عربيه', 'صيانه'],
  Housing: ['housing', 'rent', 'mortgage', 'ايجار', 'سكن', 'شققه', 'شقه'],
  Utilities: ['utilities', 'electric', 'water', 'internet', 'phone bill', 'bills', 'فواتير', 'كهربا', 'مياه', 'نت', 'انترنت', 'تليفون'],
  Healthcare: ['healthcare', 'health', 'pharmacy', 'doctor', 'dentist', 'gym', 'صحه', 'دوا', 'دكتور', 'اسنان', 'جيم'],
  Shopping: ['shopping', 'clothes', 'jacket', 'shoes', 'amazon', 'تسوق', 'هدوم', 'ملابس', 'جزمه', 'شراء'],
  Entertainment: ['entertainment', 'movie', 'cinema', 'streaming', 'netflix', 'game', 'ترفيه', 'سينما', 'فيلم', 'نتفليكس', 'العاب'],
  Education: ['education', 'course', 'book', 'school', 'tuition', 'تعليم', 'كورس', 'كتاب', 'مدرسه', 'جامعه'],
  Salary: ['salary', 'paycheck', 'wage', 'payroll', 'راتب', 'مرتب'],
  Freelance: ['freelance', 'client', 'consult', 'فريلانس', 'عمل حر', 'عميل'],
  Investments: ['investment', 'dividend', 'stock', 'استثمار', 'اسهم'],
  'Gift / Bonus': ['gift', 'bonus', 'present', 'هديه', 'مكافاه', 'بونص'],
};

function findCategory(text: string, type: 'income' | 'expense'): { id: string; color: string } | null {
  const pool = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const direct = pool.find((category) => text.includes(normalize(category.id)));
  if (direct) return direct;
  for (const category of pool) {
    const aliases = (CATEGORY_ALIASES[category.id] ?? []).map(normalize);
    if (aliases.some((alias) => text.includes(alias))) return category;
  }
  return null;
}

function findGoal(text: string, goals: Goal[]): Goal | null {
  const direct = goals.find((goal) => text.includes(normalize(goal.name)));
  if (direct) return direct;
  let found: Goal | null = null;
  let bestScore = 0;
  goals.forEach((goal) => {
    const tokens = normalize(goal.name)
      .split(' ')
      .filter(
        (token) =>
          token.length >= 3 && !['fund', 'months', 'goal', 'savings', 'هدف', 'صندوق', 'الهدف'].map(normalize).includes(token),
      );
    const score = tokens.filter((token) => text.includes(token)).length;
    if (score > bestScore) {
      bestScore = score;
      found = goal;
    }
  });
  if (found) return found;

  const hints: { words: string[]; match: string[] }[] = [
    { words: kw(['طوارئ', 'emergency']), match: ['emergency'] },
    { words: kw(['سفر', 'اجازة', 'vacation']), match: ['vacation'] },
    { words: kw(['لابتوب', 'ماك', 'macbook']), match: ['macbook'] },
  ];
  for (const hint of hints) {
    if (!has(text, hint.words)) continue;
    const goal = goals.find((item) => hint.match.some((fragment) => normalize(item.name).includes(fragment)));
    if (goal) return goal;
  }

  return null;
}

function describeFrom(text: string, accounts: Account[], fallback: string): string {
  let working = text;
  accounts.forEach((account) => {
    working = working.replace(normalize(account.name), ' ');
  });

  const matches = working.matchAll(/(?:\bon\b|\bfor\b|\bat\b|علي|على|في)\s+([a-z0-9\u0600-\u06FF][a-z0-9\u0600-\u06FF .'-]{1,40})/g);
  for (const match of matches) {
    const cleaned = match[1]
      .replace(/\b(today|yesterday|please|thanks)\b/g, '')
      .replace(/النهارده|امبارح|لو سمحت/g, '')
      .replace(/\b(from|in|into|to)\b.*$/, '')
      .replace(/\s(?:من|الي).*$/g, '')
      .replace(/\s(?:ب|ل|ك)(?=\s|$)/g, ' ')
      .trim();
    if (!cleaned || /^[\d,.\s]+$/.test(cleaned)) continue;
    return titleCase(cleaned);
  }

  const leftover = working
    .replace(/\b\d[\d,]*(?:\.\d+)?\b/g, ' ')
    .replace(
      /\b(spent|spend|paid|pay|bought|buy|add|added|log|logged|cost|costs|please|today|yesterday|the|a|an|on|for|at|from|to|in|into|my)\b/g,
      ' ',
    )
    .replace(
      /(^|\s)(صرفت|صرف|دفعت|دفع|اشتريت|اشتري|ضيف|اضف|سجل|مصروف|النهارده|امبارح|علي|على)(?=\s|$)/g,
      ' ',
    )
    .replace(/\s(?:من|في)\s(?:البنك|بنك|الحساب|حساب|المحفظة|محفظة|الكاش|كاش)(?=\s|$)/g, ' ')
    .replace(/\s(?:ب|ل|ك)(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return leftover ? titleCase(leftover) : fallback;
}

const titleCase = (value: string) =>
  value
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

function commandDate(text: string, activeMonth: string): string {
  const date = new Date();
  if (has(text, K.yesterday)) date.setDate(date.getDate() - 1);
  else if (has(text, K.lastWeek)) date.setDate(date.getDate() - 7);
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  if (iso.startsWith(activeMonth)) return iso;
  return dateInMonth(activeMonth, 1);
}

const CURRENCY_WORDS: { words: string[]; code: CurrencyCode }[] = [
  { words: kw(['egyptian pound', 'egypt pound', 'egp', 'جنيه', 'جنية']), code: 'EGP' },
  { words: kw(['saudi riyal', 'riyal', 'sar', 'ريال']), code: 'SAR' },
  { words: kw(['dollar', 'usd', 'buck', 'دولار']), code: 'USD' },
  { words: kw(['euro', 'eur', 'يورو']), code: 'EUR' },
  { words: kw(['dirham', 'aed', 'درهم']), code: 'AED' },
  { words: kw(['pound', 'sterling', 'gbp', 'باوند', 'استرليني']), code: 'GBP' },
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

const AR_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

const CATEGORY_LABELS_AR: Record<string, string> = {
  Housing: 'السكن',
  Groceries: 'البقالة',
  'Dining Out': 'المطاعم',
  Transport: 'المواصلات',
  Utilities: 'الفواتير',
  Healthcare: 'الصحة',
  Shopping: 'التسوق',
  Entertainment: 'الترفيه',
  Education: 'التعليم',
  'Other Expense': 'مصروفات أخرى',
  Salary: 'الراتب',
  Freelance: 'الفريلانس',
  Investments: 'الاستثمار',
  'Gift / Bonus': 'الهدايا والمكافآت',
  'Other Income': 'دخل آخر',
  Transfer: 'التحويل',
};

const CURRENCY_LABELS_AR: Record<CurrencyCode, string> = {
  EGP: 'الجنيه المصري',
  USD: 'الدولار',
  EUR: 'اليورو',
  GBP: 'الجنيه الإسترليني',
  SAR: 'الريال السعودي',
  AED: 'الدرهم',
};

export const ASSISTANT_SUGGESTIONS: Record<AssistantLanguage, string[]> = {
  en: [
    'Spent 250 on groceries',
    'Deposit 5000 salary into main bank',
    'How much is left for groceries?',
    'Transfer 1000 from bank to savings',
    'Set groceries budget to 6000',
    'Add 500 to my emergency fund',
    'Show insights',
    'What can you do?',
  ],
  ar: [
    'صرفت ٢٥٠ على البقالة',
    'إيداع ٥٠٠٠ راتب في البنك',
    'فاضل كام في ميزانية البقالة؟',
    'حول ١٠٠٠ من البنك للتوفير',
    'حدد ميزانية البقالة ٦٠٠٠',
    'ضيف ٥٠٠ لهدف الطوارئ',
    'افتح التحليلات',
    'مساعدة',
  ],
};

export function assistantHelp(language: AssistantLanguage = 'en'): string {
  if (language === 'ar') {
    return [
      'أقدر أسجل فلوس وأغير Vaulty. جرب:',
      '• "صرفت ٢٥٠ على البقالة" — مصروف',
      '• "إيداع ٥٠٠٠ راتب في البنك" — دخل',
      '• "حول ١٠٠٠ من البنك للتوفير"',
      '• "حدد ميزانية البقالة ٦٠٠٠"',
      '• "ضيف ٥٠٠ لهدف الطوارئ"',
      '• "فاضل كام في ميزانية البقالة؟"',
      '• "الوضع الليلي"، "استخدم الدولار"، "الشهر الجاي"، "افتح التحليلات"',
    ].join('\n');
  }
  return [
    'I can log money and change Vaulty. Try:',
    '• "Spent 250 on groceries" — adds an expense',
    '• "Deposit 5000 salary into main bank" — adds income',
    '• "Transfer 1000 from bank to savings"',
    '• "Set groceries budget to 6000"',
    '• "Add 500 to my emergency fund"',
    '• "How much is left for groceries?"',
    '• "Dark mode", "Use dollars", "Next month", "Open insights"',
  ].join('\n');
}

/** Turns a spoken/typed sentence into an executable plan plus a spoken reply. */
export function planCommand(
  raw: string,
  state: VaultState,
  preferredLanguage: AssistantLanguage = 'en',
): AssistantPlan {
  const language: AssistantLanguage = ARABIC_LETTERS.test(raw) ? 'ar' : preferredLanguage;
  const text = normalize(raw);
  const lex = lexical(raw);
  const t = (english: string, arabic: string) => (language === 'ar' ? arabic : english);
  const money = (value: number) => formatMoney(value, state.currency);
  const stats = monthStats(state.transactions, state.activeMonth);
  const amount = parseAmount(text);
  const monthLabel = language === 'ar' ? monthLabelAr(state.activeMonth) : formatMonthLabel(state.activeMonth);
  const catName = (id: string) => (language === 'ar' ? (CATEGORY_LABELS_AR[id] ?? id) : id);
  const asksAQuestion = has(text, K.questionWords) || has(text, K.leftWords);

  if (!text) {
    return {
      kind: 'answer',
      reply: t('I did not hear anything. Tap the microphone and try again.', 'مسمعتش حاجة. دوس على المايك وجرب تاني.'),
    };
  }

  if (has(text, K.help)) {
    return { kind: 'answer', reply: assistantHelp(language) };
  }

  if (K.greeting.some((word) => text === word || text.startsWith(`${word} `))) {
    const total = Object.values(netWorthBalances(state)).reduce((a, b) => a + b, 0);
    return {
      kind: 'answer',
      reply: t(
        `Hi. You have ${money(total)} across ${state.accounts.length} accounts. Ask me to log something or say "help".`,
        `أهلاً. معاك ${money(total)} في ${state.accounts.length} حسابات. اطلب مني أسجل حاجة أو قول "مساعدة".`,
      ),
    };
  }

  /* ---------- preferences ---------- */
  if (has(text, K.dark)) {
    return { kind: 'settings', patch: { theme: 'dark' }, reply: t('Dark mode on.', 'الوضع الليلي مفعل.') };
  }
  if (has(text, K.light)) {
    return { kind: 'settings', patch: { theme: 'light' }, reply: t('Light mode on.', 'الوضع النهاري مفعل.') };
  }
  if (has(text, K.themeToggle)) {
    const next = state.theme === 'dark' ? 'light' : 'dark';
    return {
      kind: 'settings',
      patch: { theme: next },
      reply: next === 'dark' ? t('Dark mode on.', 'الوضع الليلي مفعل.') : t('Light mode on.', 'الوضع النهاري مفعل.'),
    };
  }
  if (has(text, K.notificationsOn) && !has(text, K.notificationsOff)) {
    return {
      kind: 'settings',
      patch: { notificationsEnabled: true },
      reply: t('Notifications on.', 'الإشعارات مفعلة.'),
    };
  }
  if (has(text, K.notificationsOff)) {
    return {
      kind: 'settings',
      patch: { notificationsEnabled: false },
      reply: t('Notifications off.', 'الإشعارات متوقفة.'),
    };
  }
  if (has(text, K.mute)) {
    return { kind: 'settings', patch: { voiceReplies: false }, reply: t('Okay, I will stay quiet.', 'تمام، مش هتكلم.') };
  }
  if (has(text, K.unmute) && !amount) {
    return {
      kind: 'settings',
      patch: { voiceReplies: true },
      reply: t('I will read my answers out loud.', 'هقرأ الردود بصوت عالي.'),
    };
  }
  const reminderMatch = text.match(/(?:remind me (?:at|on)|فكرني|نبهني)\s*(?:الساعه|الساعة|at)?\s*(\d{1,2})(?::\d{2})?\s*(am|pm|ص|م)?/);
  if (reminderMatch) {
    let hour = Number.parseInt(reminderMatch[1], 10);
    if ((reminderMatch[2] === 'pm' || reminderMatch[2] === 'م') && hour < 12) hour += 12;
    if ((reminderMatch[2] === 'am' || reminderMatch[2] === 'ص') && hour === 12) hour = 0;
    hour = Math.min(23, Math.max(0, hour));
    const label = `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? 'AM' : 'PM'}`;
    return {
      kind: 'settings',
      patch: { notificationsEnabled: true, reminderHour: hour },
      reply: t(
        `I will remind you at ${label} each day while Vaulty is open.`,
        `هفكرك الساعة ${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? 'صباحاً' : 'مساءً'} كل يوم طالما Vaulty مفتوح.`,
      ),
    };
  }
  if (has(text, K.currency)) {
    const entry = CURRENCY_WORDS.find((item) => has(text, item.words));
    if (entry) {
      return {
        kind: 'settings',
        patch: { currency: entry.code },
        reply: t(
          `Currency set to ${CURRENCIES[entry.code].label}.`,
          `تم تغيير العملة إلى ${CURRENCY_LABELS_AR[entry.code]}.`,
        ),
      };
    }
  }

  /* ---------- month navigation ---------- */
  if (has(text, K.nextMonth) && !asksAQuestion) {
    const next = shiftMonth(state.activeMonth, 1);
    return {
      kind: 'settings',
      patch: { activeMonth: next },
      reply: t(
        `Showing ${formatMonthLabel(next)}.`,
        `بعرض ${monthLabelAr(next)}.`,
      ),
    };
  }
  if (has(text, K.lastMonth) && !asksAQuestion) {
    const previous = shiftMonth(state.activeMonth, -1);
    return {
      kind: 'settings',
      patch: { activeMonth: previous },
      reply: t(
        `Showing ${formatMonthLabel(previous)}.`,
        `بعرض ${monthLabelAr(previous)}.`,
      ),
    };
  }
  if (has(text, K.thisMonth) && !asksAQuestion) {
    return {
      kind: 'settings',
      patch: { activeMonth: todayISO().slice(0, 7) },
      reply: t('Showing this month.', 'بعرض الشهر الحالي.'),
    };
  }
  const monthName = MONTH_NAMES.find((name) => text.includes(name));
  if (monthName && has(text, K.open)) {
    const month = String(MONTH_NAMES.indexOf(monthName) + 1).padStart(2, '0');
    const target = `${state.activeMonth.slice(0, 4)}-${month}`;
    return {
      kind: 'settings',
      patch: { activeMonth: target },
      reply: t(`Showing ${formatMonthLabel(target)}.`, `بعرض ${monthLabelAr(target)}.`),
    };
  }

  /* ---------- insights ---------- */
  if (has(text, K.insights)) {
    return { kind: 'insights', reply: t('Opening insights.', 'بفتح التحليلات.') };
  }

  /* ---------- navigation ---------- */
  if (has(text, K.open)) {
    if (has(text, K.recurring)) {
      return { kind: 'navigate', view: 'plan', planTab: 'recurring', reply: t('Opening recurring bills.', 'بفتح الفواتير المتكررة.') };
    }
    if (has(text, K.goals)) {
      return { kind: 'navigate', view: 'plan', planTab: 'goals', reply: t('Opening savings goals.', 'بفتح أهداف التوفير.') };
    }
    if (has(text, K.budgets)) {
      return { kind: 'navigate', view: 'plan', planTab: 'budgets', reply: t('Opening budgets.', 'بفتح الميزانيات.') };
    }
    if (has(text, K.accounts)) {
      return { kind: 'navigate', view: 'accounts', reply: t('Opening accounts.', 'بفتح الحسابات.') };
    }
    if (has(text, K.transactions)) {
      return { kind: 'navigate', view: 'transactions', reply: t('Opening activity.', 'بفتح الحركات.') };
    }
    if (has(text, K.home)) {
      return { kind: 'navigate', view: 'overview', reply: t('Opening home.', 'بفتح الرئيسية.') };
    }
  }

  /* ---------- questions ---------- */
  if (has(text, K.balance) && !amount) {
    const total = Object.values(netWorthBalances(state)).reduce((a, b) => a + b, 0);
    return {
      kind: 'answer',
      reply: t(
        `Your net worth is ${money(total)} across ${state.accounts.length} accounts.`,
        `صافي ثروتك ${money(total)} في ${state.accounts.length} حسابات.`,
      ),
    };
  }
  if (has(text, K.savingsRate)) {
    return {
      kind: 'answer',
      reply: t(
        `You saved ${stats.savingsRate}% of your income in ${monthLabel}.`,
        `وفرت ${stats.savingsRate}% من دخلك في ${monthLabel}.`,
      ),
    };
  }
  if (has(text, K.leftWords) || (has(text, K.budgets) && has(text, K.questionWords))) {
    const category = findCategory(text, 'expense');
    if (category) {
      const budget = state.budgets.find((item) => item.category === category.id);
      const spent = stats.byCategory[category.id] || 0;
      if (!budget) {
        return {
          kind: 'answer',
          reply: t(
            `You have no budget for ${catName(category.id)}. Spent so far: ${money(spent)}.`,
            `مفيش ميزانية لـ ${catName(category.id)}. صرفت لحد دلوقتي ${money(spent)}.`,
          ),
        };
      }
      const left = budget.limit - spent;
      return {
        kind: 'answer',
        reply:
          left >= 0
            ? t(
                `${money(left)} left for ${catName(category.id)} — ${money(spent)} spent of ${money(budget.limit)}.`,
                `فاضل ${money(left)} لميزانية ${catName(category.id)} — صرفت ${money(spent)} من ${money(budget.limit)}.`,
              )
            : t(
                `You are ${money(Math.abs(left))} over the ${catName(category.id)} budget (${money(spent)} of ${money(budget.limit)}).`,
                `تجاوزت ميزانية ${catName(category.id)} بـ ${money(Math.abs(left))} (صرفت ${money(spent)} من ${money(budget.limit)}).`,
              ),
      };
    }
    const totalLimit = state.budgets.reduce((sum, item) => sum + item.limit, 0);
    const totalSpent = state.budgets.reduce((sum, item) => sum + (stats.byCategory[item.category] || 0), 0);
    const left = totalLimit - totalSpent;
    return {
      kind: 'answer',
      reply:
        totalLimit === 0
          ? t('You have no budgets yet. Say "set groceries budget to 6000".', 'مفيش ميزانيات لسه. قول "حدد ميزانية البقالة ٦٠٠٠".')
          : left >= 0
            ? t(
                `${money(left)} left across your budgets. ${money(totalSpent)} spent of ${money(totalLimit)}.`,
                `فاضل ${money(left)} في كل الميزانيات. صرفت ${money(totalSpent)} من ${money(totalLimit)}.`,
              )
            : t(
                `You are ${money(Math.abs(left))} over budget this month.`,
                `تجاوزت الميزانيات بـ ${money(Math.abs(left))} الشهر ده.`,
              ),
    };
  }
  if (has(text, K.spentWords) && has(text, K.questionWords)) {
    const category = findCategory(text, 'expense');
    if (category) {
      return {
        kind: 'answer',
        reply: t(
          `You spent ${money(stats.byCategory[category.id] || 0)} on ${catName(category.id)} in ${monthLabel}.`,
          `صرفت ${money(stats.byCategory[category.id] || 0)} على ${catName(category.id)} في ${monthLabel}.`,
        ),
      };
    }
    return {
      kind: 'answer',
      reply: t(
        `You spent ${money(stats.expense)} in ${monthLabel} and earned ${money(stats.income)}.`,
        `صرفت ${money(stats.expense)} في ${monthLabel} وكسبت ${money(stats.income)}.`,
      ),
    };
  }
  if (has(text, K.incomeWords) && has(text, K.questionWords)) {
    return {
      kind: 'answer',
      reply: t(
        `Income in ${monthLabel} is ${money(stats.income)}.`,
        `دخلك في ${monthLabel} هو ${money(stats.income)}.`,
      ),
    };
  }

  /* ---------- savings goals ---------- */
  const goal = findGoal(text, state.goals);
  if (goal && amount && has(text, K.goalVerbs)) {
    const after = Math.max(0, goal.current + amount);
    const pct = goal.target > 0 ? Math.min(100, Math.round((after / goal.target) * 100)) : 0;
    return {
      kind: 'goal',
      goalId: goal.id,
      delta: amount,
      reply: t(
        `Added ${money(amount)} to "${goal.name}". You are at ${pct}% of the target.`,
        `ضفت ${money(amount)} لهدف "${goal.name}". وصلت ${pct}% من الهدف.`,
      ),
    };
  }

  /* ---------- budgets ---------- */
  if (has(text, K.budgets) && amount && has(text, K.setVerbs)) {
    const category = findCategory(text, 'expense') ?? EXPENSE_CATEGORIES.find((item) => item.id === 'Other Expense')!;
    const existing = state.budgets.find((item) => item.category === category.id);
    const budget: Budget = { id: existing?.id ?? makeId('bud'), category: category.id, limit: amount };
    return {
      kind: 'budget',
      budget,
      reply: existing
        ? t(
            `Updated the ${catName(category.id)} budget to ${money(amount)}.`,
            `تم تحديث ميزانية ${catName(category.id)} إلى ${money(amount)}.`,
          )
        : t(
            `Set a ${money(amount)} budget for ${catName(category.id)}.`,
            `تم تحديد ميزانية ${money(amount)} لـ ${catName(category.id)}.`,
          ),
    };
  }

  /* ---------- money movement ---------- */
  if (state.accounts.length === 0) {
    return {
      kind: 'answer',
      reply: t(
        'Create an account first, then I can log money for you.',
        'اعمل حساب الأول وبعدين أقدر أسجل لك.',
      ),
    };
  }

  if (has(text, K.transfer) && amount) {
    const toMarker = language === 'ar' ? /\s(?:الي|الى|ل)/ : /\s(?:to|into)\s/;
    const fromMarker = language === 'ar' ? /\sمن\s/ : /\sfrom\s/;
    const toPart = text.split(toMarker)[1] ?? '';
    const fromPart = (text.split(fromMarker)[1] ?? '').split(toMarker)[0] ?? '';
    const to = findAccount(toPart, state.accounts) ?? findAccount(text, state.accounts);
    const from =
      findAccount(fromPart, state.accounts, to?.id) ?? state.accounts.find((account) => account.id !== to?.id) ?? null;

    if (to && from && to.id !== from.id) {
      const transaction: Transaction = {
        id: makeId('tx'),
        type: 'transfer',
        amount,
        date: commandDate(text, state.activeMonth),
        accountId: from.id,
        toAccountId: to.id,
        category: 'Transfer',
        description: `${language === 'ar' ? 'تحويل إلى' : 'Transfer to'} ${to.name}`,
        notes: 'Logged by assistant',
      };
      return {
        kind: 'transaction',
        transaction,
        reply: t(
          `Moved ${money(amount)} from ${from.name} to ${to.name}.`,
          `حولت ${money(amount)} من ${from.name} إلى ${to.name}.`,
        ),
      };
    }
    return {
      kind: 'answer',
      reply: t(
        'Tell me the amount and both accounts, like "transfer 1000 from bank to savings".',
        'قولي المبلغ والحسابين، زي "حول ١٠٠٠ من البنك للتوفير".',
      ),
    };
  }

  const hasDestination =
    language === 'ar'
      ? has(text, kw(['الي', 'الى', 'في']))
      : hasWord(text, 'to') || hasWord(text, 'into') || hasWord(text, 'in');
  const hasFor =
    language === 'ar'
      ? has(text, kw(['علي', 'في']))
      : hasWord(text, 'for') || hasWord(text, 'on') || hasWord(text, 'at');

  const isIncome = has(text, K.incomeVerbs) || (has(text, K.addVerbs) && hasDestination && !hasFor);
  const isExpense = has(text, K.expenseVerbs) || (has(text, K.addVerbs) && hasFor);

  if (amount && (isIncome || isExpense)) {
    const type: 'income' | 'expense' = isIncome && !isExpense ? 'income' : 'expense';
    const category = findCategory(text, type);

    let account: Account | null = null;
    if (type === 'income') {
      const target =
        language === 'ar'
          ? (text.split(/\s(?:في|الي|الى)\s?/)[1] ?? '')
          : text.split(/\b(?:to|into|in)\b/).slice(1).join(' ');
      account = findAccount(target, state.accounts) ?? findAccount(text, state.accounts);
    } else {
      const from = language === 'ar' ? (text.split(/\sمن\s/)[1] ?? '') : (text.split(/\sfrom\s/)[1] ?? '');
      account = findAccount(from, state.accounts) ?? findAccount(text, state.accounts);
    }
    const resolved = account ?? state.accounts[0];

    const description =
      type === 'income'
        ? catName(category?.id ?? 'Other Income')
        : describeFrom(lex, state.accounts, catName(category?.id ?? 'Other Expense'));

    const transaction: Transaction = {
      id: makeId('tx'),
      type,
      amount,
      date: commandDate(text, state.activeMonth),
      accountId: resolved.id,
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
          ? t(
              `Added ${money(amount)} of income to ${resolved.name}${category ? ` under ${catName(category.id)}` : ''}.`,
              `ضفت دخل ${money(amount)} لحساب ${resolved.name}${category ? ` تحت ${catName(category.id)}` : ''}.`,
            )
          : t(
              `Logged ${money(amount)} for ${description} from ${resolved.name}${category ? ` under ${catName(category.id)}` : ''}.`,
              `سجلت مصروف ${money(amount)} لـ ${description} من ${resolved.name}${category ? ` تحت ${catName(category.id)}` : ''}.`,
            ),
    };
  }

  /* ---------- undo ---------- */
  if (has(text, K.undo)) {
    const latest = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0];
    if (!latest) {
      return { kind: 'answer', reply: t('There is nothing to undo.', 'مفيش حاجة أمسحها.') };
    }
    return {
      kind: 'delete',
      id: latest.id,
      reply: t(
        `Deleted "${latest.description || latest.category}" (${money(latest.amount)}).`,
        `مسحت "${latest.description || latest.category}" (${money(latest.amount)}).`,
      ),
    };
  }

  return {
    kind: 'answer',
    reply: t(
      'I did not catch that. Try "spent 250 on groceries", "deposit 5000 salary into main bank", or say "help".',
      'مفهمتش. جرب "صرفت ٢٥٠ على البقالة" أو "إيداع ٥٠٠٠ راتب في البنك" أو قول "مساعدة".',
    ),
  };
}

function monthLabelAr(ym: string): string {
  const [year, month] = ym.split('-').map(Number);
  return `${AR_MONTHS[(month || 1) - 1]} ${year}`;
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
