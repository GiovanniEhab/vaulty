import { Capacitor, registerPlugin } from '@capacitor/core';
import { useSyncExternalStore } from 'react';

export interface UpdateInfo {
  version: string;
  versionCode: number;
  url: string;
  sha256: string;
  notes: string;
  size: number;
  currentVersion: string;
  currentVersionCode: number;
  updateAvailable: boolean;
  installAllowed: boolean;
}

interface NativeUpdater {
  getInfo(): Promise<{ version: string; versionCode: number; installAllowed: boolean }>;
  check(options: { manifestUrl: string }): Promise<UpdateInfo>;
  download(options: { url: string; sha256: string; version: string }): Promise<{ path: string; size: number; sha256: string }>;
  install(options: { path: string }): Promise<void>;
  addListener(
    event: 'downloadProgress',
    listener: (data: { percent: number }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

const Native = registerPlugin<NativeUpdater>('AppUpdater');

/**
 * Where the app looks for new versions. A plain JSON manifest
 * (`{ version, versionCode, url, sha256, notes }`) or any GitHub "latest release" endpoint works.
 * Override at build time with VITE_UPDATE_FEED.
 *
 * The default is a static manifest served by raw.githubusercontent (CDN, no API quota), so a check
 * never fails because of GitHub's anonymous rate limit.
 */
export const UPDATE_FEED: string =
  (import.meta.env.VITE_UPDATE_FEED as string | undefined)?.trim() ||
  'https://raw.githubusercontent.com/GiovanniEhab/vaulty/main/update.json';

const LAST_CHECK_KEY = 'vaulty_update_checked_at';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function isAndroidApp(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'uptodate' | 'error';

export interface UpdateState {
  status: UpdateStatus;
  info: UpdateInfo | null;
  percent: number;
  message: string;
  currentVersion: string;
}

let snapshot: UpdateState = { status: 'idle', info: null, percent: 0, message: '', currentVersion: '' };
const listeners = new Set<() => void>();

function setState(patch: Partial<UpdateState>): void {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useUpdateState(): UpdateState {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

export function getUpdateState(): UpdateState {
  return snapshot;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Something went wrong.';
}

export async function installedVersion(): Promise<string> {
  if (!isAndroidApp()) return 'web';
  try {
    const info = await Native.getInfo();
    setState({ currentVersion: info.version });
    return info.version;
  } catch {
    return snapshot.currentVersion || 'unknown';
  }
}

/** Ask the release feed for the newest version. */
export async function checkForUpdates(): Promise<void> {
  if (!isAndroidApp()) {
    setState({
      status: 'uptodate',
      message: 'The browser build always loads the latest code. In-app updates apply to the Android app.',
    });
    return;
  }
  setState({ status: 'checking', message: 'Checking for updates…' });
  try {
    const info = await Native.check({ manifestUrl: UPDATE_FEED });
    localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
    setState({
      info,
      currentVersion: info.currentVersion,
      status: info.updateAvailable ? 'available' : 'uptodate',
      message: info.updateAvailable
        ? `Version ${info.version} is available. You have ${info.currentVersion}.`
        : `You are on the latest version (${info.currentVersion}).`,
    });
  } catch (error) {
    setState({ status: 'error', message: errorMessage(error) });
  }
}

/** Download the available APK (checksum-verified) and open Android's installer. */
export async function downloadAndInstall(): Promise<void> {
  const { info } = snapshot;
  if (!info || !isAndroidApp()) return;

  setState({ status: 'downloading', percent: 0, message: 'Downloading the update…' });
  let progressHandle: { remove: () => Promise<void> } | null = null;
  try {
    progressHandle = await Native.addListener('downloadProgress', ({ percent }) => {
      setState({ percent });
    });
    const file = await Native.download({ url: info.url, sha256: info.sha256 ?? '', version: info.version });
    setState({ status: 'ready', percent: 100, message: 'Downloaded. Confirm the install in Android.' });
    await Native.install({ path: file.path });
  } catch (error) {
    setState({ status: 'error', message: errorMessage(error) });
  } finally {
    if (progressHandle) void progressHandle.remove();
  }
}

/**
 * Launch-time check. Runs at most every six hours, and when auto-update is on it downloads the
 * new version and asks Android to install it.
 */
export async function autoCheckForUpdates(autoUpdate: boolean): Promise<void> {
  if (!isAndroidApp()) return;
  await installedVersion();
  const last = Number(localStorage.getItem(LAST_CHECK_KEY) ?? 0);
  if (Number.isFinite(last) && Date.now() - last < CHECK_INTERVAL_MS) return;
  await checkForUpdates();
  if (autoUpdate && getUpdateState().status === 'available') {
    await downloadAndInstall();
  }
}
