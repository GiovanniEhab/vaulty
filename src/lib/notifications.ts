import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import { monthStats } from './calc';
import { formatMoney, todayISO } from './format';
import type { VaultState } from './types';

const LOG_KEY = 'vaulty_notifications_v1';
const CHANNEL_ID = 'vaulty-alerts';
const CHANNEL_NAME = 'Vaulty alerts';
const SMALL_ICON = 'ic_stat_vaulty';
const MAX_PER_PASS = 3;

/** IDs reserved for scheduled Vaulty notifications. Anything else is a one-off alert. */
const MANAGED_MIN = 900000;
const MANAGED_MAX = 999999;
const DAILY_ID = 900001;
const BILL_ID_BASE = 910000;

type Log = Record<string, string>;
export type NotificationPermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

interface VaultyNative {
  notificationsEnabled(): Promise<{ enabled: boolean }>;
}

const Native = registerPlugin<VaultyNative>('VaultyNative');

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export function notificationsSupported(): boolean {
  if (isNativeAndroid()) return true;
  return typeof window !== 'undefined' && 'Notification' in window;
}

function mapPermission(state: string): NotificationPermissionState {
  if (state === 'granted') return 'granted';
  if (state === 'denied') return 'denied';
  return 'prompt';
}

export async function notificationPermission(): Promise<NotificationPermissionState> {
  if (isNativeAndroid()) {
    try {
      // NotificationManagerCompat is the source of truth on Android 13+: the plugin can report
      // "prompt" even when the user turned notifications off from Android settings.
      const [pluginPermission, native] = await Promise.all([
        LocalNotifications.checkPermissions(),
        Native.notificationsEnabled(),
      ]);
      if (!native.enabled) return 'denied';
      return mapPermission(pluginPermission.display);
    } catch {
      try {
        return mapPermission((await LocalNotifications.checkPermissions()).display);
      } catch {
        return 'prompt';
      }
    }
  }
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission === 'default' ? 'prompt' : Notification.permission;
}

let channelReady = false;

async function ensureChannel(): Promise<void> {
  if (!isNativeAndroid() || channelReady) return;
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: CHANNEL_NAME,
      description: 'Budget alerts, bill reminders and your daily check-in',
      importance: 4,
      visibility: 1,
      lights: true,
      lightColor: '#059669',
      vibration: true,
    });
  } catch {
    /* the channel may already exist; notifications still work */
  }
  channelReady = true;
}

/** Android 12+ exact-alarm access; without it reminders still fire, but timing may drift. */
export async function exactAlarmPermission(): Promise<NotificationPermissionState> {
  if (!isNativeAndroid()) return 'unsupported';
  try {
    const state = (await LocalNotifications.checkExactNotificationSetting()).exact_alarm;
    return state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : 'prompt';
  } catch {
    return 'unsupported';
  }
}

export async function requestExactAlarmAccess(): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  try {
    const state = (await LocalNotifications.changeExactNotificationSetting()).exact_alarm;
    return state === 'granted';
  } catch {
    return false;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (isNativeAndroid()) {
    try {
      await ensureChannel();
      const current = await LocalNotifications.checkPermissions();
      if (current.display === 'granted') return true;
      const next = await LocalNotifications.requestPermissions();
      return next.display === 'granted';
    } catch {
      return false;
    }
  }
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

/** Stable positive 32-bit id for a tag, outside the scheduled 900000-999999 range. */
function hashId(tag: string): number {
  let hash = 2166136261;
  for (let index = 0; index < tag.length; index += 1) {
    hash ^= tag.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 800000 + 100;
}

async function send(title: string, body: string, tag: string): Promise<boolean> {
  if (isNativeAndroid()) {
    try {
      await ensureChannel();
      const permission = await notificationPermission();
      if (permission !== 'granted') return false;
      await LocalNotifications.schedule({
        notifications: [
          {
            id: hashId(tag),
            title,
            body,
            channelId: CHANNEL_ID,
            smallIcon: SMALL_ICON,
            autoCancel: true,
            schedule: { at: new Date(Date.now() + 750) },
          },
        ],
      });
      return true;
    } catch {
      return false;
    }
  }
  try {
    new Notification(title, { body, tag, icon: '/icon.svg', badge: '/icon.svg' });
    return true;
  } catch {
    /* some browsers only allow notifications from a service worker */
    return false;
  }
}

export async function sendTestNotification(): Promise<boolean> {
  const permission = await notificationPermission();
  if (permission !== 'granted') return false;
  return send(
    'Vaulty notifications are working',
    'This is a test alert. Budget, bill and daily check-in reminders will arrive like this.',
    'test',
  );
}

/**
 * Checks budget thresholds and, in a browser, bills and the daily check-in.
 * On Android the daily check-in and bill reminders are scheduled natively so they
 * still fire when Vaulty is closed; only budget alerts need the app open.
 */
export async function checkNotifications(state: VaultState): Promise<number> {
  if (!state.notificationsEnabled) return 0;
  const permission = await notificationPermission();
  if (permission !== 'granted') return 0;

  const native = isNativeAndroid();
  const today = todayISO();
  const month = state.activeMonth;
  const log = readLog(month);
  let attempts = 0;
  const jobs: Promise<{ key: string; ok: boolean }>[] = [];

  const fire = (key: string, title: string, body: string) => {
    if (log[key] || attempts >= MAX_PER_PASS) return;
    attempts += 1;
    jobs.push(send(title, body, key).then((ok) => ({ key, ok })));
  };

  // The native build schedules this as a repeating local notification.
  if (!native && state.reminderHour === new Date().getHours()) {
    fire(`reminder:${today}`, 'Vaulty daily check-in', "Log today's spending so your budgets stay accurate.");
  }

  // Native bill reminders are scheduled separately, so they work with the app closed.
  if (!native && month === today.slice(0, 7)) {
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

  const results = await Promise.all(jobs);
  // Only remember alerts that were actually delivered, so a failed send can be
  // retried on the next pass instead of being suppressed for the rest of the month.
  results.forEach(({ key, ok }) => {
    if (ok) log[key] = today;
  });
  writeLog(log);
  return results.filter((result) => result.ok).length;
}

async function cancelManagedNotifications(): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    const pending = await LocalNotifications.getPending();
    const managed = pending.notifications
      .filter((notification) => notification.id >= MANAGED_MIN && notification.id <= MANAGED_MAX)
      .map((notification) => ({ id: notification.id }));
    if (managed.length > 0) await LocalNotifications.cancel({ notifications: managed });
  } catch {
    /* nothing scheduled, or the plugin is unavailable */
  }
}

export async function cancelScheduledNotifications(): Promise<void> {
  await cancelManagedNotifications();
}

function nextBillDate(item: VaultState['recurring'][number], now: Date): Date {
  const day = Math.min(28, Math.max(1, Math.round(item.dayOfMonth)));
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let year = now.getFullYear();
  let month = now.getMonth();

  if (item.lastLoggedMonth === currentMonth) {
    month += 1;
  } else {
    const thisMonthDue = new Date(year, month, day, 9, 0, 0, 0);
    if (thisMonthDue <= now) month += 1;
  }

  return new Date(year, month, day, 9, 0, 0, 0);
}

/**
 * Rebuilds the native schedule. Called whenever the reminder hour, the recurring
 * list or the notification toggle changes. Cancel + schedule keeps it idempotent.
 */
export async function syncScheduledNotifications(state: VaultState): Promise<void> {
  if (!isNativeAndroid()) return;
  await ensureChannel();
  await cancelManagedNotifications();
  if (!state.notificationsEnabled) return;

  const permission = await notificationPermission();
  if (permission !== 'granted') return;

  const hour = Math.min(23, Math.max(0, Math.round(state.reminderHour)));
  const notifications: LocalNotificationSchema[] = [
    {
      id: DAILY_ID,
      title: 'Vaulty daily check-in',
      body: "Log today's spending so your budgets stay accurate.",
      channelId: CHANNEL_ID,
      smallIcon: SMALL_ICON,
      autoCancel: true,
      schedule: { on: { hour, minute: 0 }, allowWhileIdle: true },
    },
  ];

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  state.recurring.slice(0, 500).forEach((item, index) => {
    const id = BILL_ID_BASE + index;
    const isLogged = item.lastLoggedMonth === currentMonth;
    const day = Math.min(28, Math.max(1, Math.round(item.dayOfMonth)));
    const title = item.type === 'income' ? 'Income expected' : 'Bill due';
    const body = `${item.title} (${formatMoney(item.amount, state.currency)}) ${
      item.type === 'income' ? 'is expected' : 'is due'
    }. Open Vaulty to log it.`;

    notifications.push({
      id,
      title,
      body,
      channelId: CHANNEL_ID,
      smallIcon: SMALL_ICON,
      autoCancel: true,
      // Logged this month: skip straight to next month. Otherwise a monthly cron
      // keeps reminding even if the app is never opened again.
      schedule: isLogged
        ? { at: nextBillDate(item, now), allowWhileIdle: true }
        : { on: { day, hour: 9, minute: 0 }, allowWhileIdle: true },
    });
  });

  try {
    await LocalNotifications.schedule({ notifications });
  } catch {
    /* permissions can change between the check and the schedule call */
  }
}
