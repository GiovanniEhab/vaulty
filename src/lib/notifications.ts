import { monthStats } from './calc';
import { formatMoney, todayISO } from './format';
import type { VaultState } from './types';

const LOG_KEY = 'vaulty_notifications_v1';
const MAX_PER_PASS = 2;

type Log = Record<string, string>;

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch {
    return false;
  }
}

function readLog(month: string): Log {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (!raw) return { __month: month };
    const parsed = JSON.parse(raw) as Log;
    if (parsed.__month !== month) return { __month: month };
    return parsed;
  } catch {
    return { __month: month };
  }
}

function writeLog(log: Log): void {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch {
    /* ignore quota errors */
  }
}

function send(title: string, body: string, tag: string): void {
  try {
    new Notification(title, { body, tag, icon: '/icon.svg', badge: '/icon.svg' });
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}

/**
 * Checks budget thresholds, bills due this month and the daily check-in.
 * Runs while the app is open; each alert fires at most once per month.
 */
export function checkNotifications(state: VaultState): number {
  if (!notificationsSupported() || Notification.permission !== 'granted') return 0;

  const today = todayISO();
  const month = state.activeMonth;
  const log = readLog(month);
  let sent = 0;

  const fire = (key: string, title: string, body: string) => {
    if (log[key] || sent >= MAX_PER_PASS) return;
    log[key] = today;
    send(title, body, key);
    sent += 1;
  };

  if (state.reminderHour === new Date().getHours()) {
    fire(`reminder:${today}`, 'Vaulty daily check-in', "Log today's spending so your budgets stay accurate.");
  }

  if (month === today.slice(0, 7)) {
    const day = Number(today.slice(8, 10));
    state.recurring.forEach((item) => {
      if (item.lastLoggedMonth === month || day < item.dayOfMonth) return;
      fire(
        `recurring:${item.id}:${month}`,
        'Bill due',
        `${item.title} (${formatMoney(item.amount, state.currency)}) is due. Open Vaulty to log it.`,
      );
    });
  }

  const stats = monthStats(state.transactions, month);
  state.budgets.forEach((budget) => {
    const limit = Number(budget.limit) || 0;
    if (limit <= 0) return;
    const spent = stats.byCategory[budget.category] || 0;
    const ratio = spent / limit;
    if (ratio >= 1) {
      fire(
        `budget:over:${budget.id}:${month}`,
        'Budget exceeded',
        `${budget.category}: ${formatMoney(spent, state.currency)} of ${formatMoney(limit, state.currency)}.`,
      );
    } else if (ratio >= 0.9) {
      fire(
        `budget:90:${budget.id}:${month}`,
        'Budget almost used',
        `${budget.category}: ${formatMoney(spent, state.currency)} of ${formatMoney(limit, state.currency)}.`,
      );
    }
  });

  writeLog(log);
  return sent;
}
