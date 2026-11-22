import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  setDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import type { CollectionName, Settings, VaultState, WidgetId } from './types';

export const COLLECTIONS: CollectionName[] = ['accounts', 'transactions', 'budgets', 'goals', 'recurring'];

export type SyncMode = 'local' | 'firebase';

export interface SyncInfo {
  mode: SyncMode;
  status: 'local' | 'connecting' | 'connected' | 'error';
  uid: string | null;
  projectId: string | null;
  message: string;
}

export type RemotePatch = Partial<VaultState>;

export interface Repo {
  info: SyncInfo;
  subscribe(onPatch: (patch: RemotePatch) => void, onError: (message: string) => void): () => void;
  seedIfEmpty(state: VaultState): Promise<void>;
  put(col: CollectionName, item: { id: string }): Promise<void>;
  remove(col: CollectionName, id: string): Promise<void>;
  removeMany(col: CollectionName, ids: string[]): Promise<void>;
  putSettings(settings: Settings): Promise<void>;
  replaceAll(state: VaultState): Promise<void>;
}

interface FirebaseEnvConfig {
  apiKey: string;
  authDomain?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

/**
 * Firebase web config is not secret; it is supplied through Vite env vars so
 * the same build can run without a project at all (pure local mode).
 */
export function readFirebaseConfig(): FirebaseEnvConfig | null {
  const env = import.meta.env as Record<string, string | undefined>;
  const config: FirebaseEnvConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY ?? '',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID ?? '',
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID ?? '',
  };
  if (!config.apiKey || !config.projectId || !config.appId) return null;
  return config;
}

export function isFirebaseConfigured(): boolean {
  return readFirebaseConfig() !== null;
}

export const pickSettings = (state: VaultState): Settings => ({
  currency: state.currency,
  theme: state.theme,
  activeMonth: state.activeMonth,
  isDemoData: state.isDemoData,
  demoBannerDismissed: state.demoBannerDismissed,
  voiceReplies: state.voiceReplies,
  notificationsEnabled: state.notificationsEnabled,
  reminderHour: state.reminderHour,
  widgetIds: state.widgetIds,
});

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Strip anything Firestore would reject (undefined values, functions). */
function plain<T extends object>(item: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  Object.entries(item as Record<string, unknown>).forEach(([key, value]) => {
    out[key] = value === undefined ? null : value;
  });
  return out;
}

export class LocalRepo implements Repo {
  info: SyncInfo = {
    mode: 'local',
    status: 'local',
    uid: null,
    projectId: null,
    message: 'Saved on this device only',
  };

  subscribe(): () => void {
    return () => undefined;
  }

  async seedIfEmpty(): Promise<void> {}

  async put(): Promise<void> {}

  async remove(): Promise<void> {}

  async removeMany(): Promise<void> {}

  async putSettings(): Promise<void> {}

  async replaceAll(): Promise<void> {}
}

class FirebaseRepo implements Repo {
  info: SyncInfo;

  private userDoc;

  constructor(
    private db: Firestore,
    uid: string,
    projectId: string,
  ) {
    this.info = {
      mode: 'firebase',
      status: 'connected',
      uid,
      projectId,
      message: 'Synced to Firestore',
    };
    this.userDoc = doc(this.db, 'users', uid);
  }

  private colRef(col: CollectionName) {
    return collection(this.db, 'users', this.info.uid as string, col);
  }

  subscribe(onPatch: (patch: RemotePatch) => void, onError: (message: string) => void): () => void {
    const unsubscribers: (() => void)[] = [];
    unsubscribers.push(
      onSnapshot(
        this.userDoc,
        (snap) => {
          if (!snap.exists()) return;
          const data = snap.data() as Partial<Settings>;
          onPatch({
            currency: data.currency ?? 'EGP',
            theme: data.theme === 'dark' ? 'dark' : 'light',
            activeMonth: typeof data.activeMonth === 'string' ? data.activeMonth : undefined,
            isDemoData: Boolean(data.isDemoData),
            demoBannerDismissed: Boolean(data.demoBannerDismissed),
            voiceReplies: data.voiceReplies !== false,
            notificationsEnabled: Boolean(data.notificationsEnabled),
            reminderHour: typeof data.reminderHour === 'number' ? data.reminderHour : 20,
            widgetIds: Array.isArray(data.widgetIds)
              ? (data.widgetIds as WidgetId[])
              : ['netWorth', 'month', 'budget', 'voice'],
          });
        },
        (error) => onError(error.message),
      ),
    );

    COLLECTIONS.forEach((col) => {
      unsubscribers.push(
        onSnapshot(
          this.colRef(col),
          (snap) => {
            const items = snap.docs.map((d) => ({ ...(d.data() as Record<string, unknown>), id: d.id }));
            onPatch({ [col]: items } as RemotePatch);
          },
          (error) => onError(error.message),
        ),
      );
    });

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }

  async seedIfEmpty(state: VaultState): Promise<void> {
    const existing = await getDoc(this.userDoc);
    if (existing.exists()) return;
    await this.replaceAll(state);
  }

  async put(col: CollectionName, item: { id: string }): Promise<void> {
    await setDoc(doc(this.colRef(col), item.id), plain(item), { merge: true });
  }

  async remove(col: CollectionName, id: string): Promise<void> {
    await deleteDoc(doc(this.colRef(col), id));
  }

  async removeMany(col: CollectionName, ids: string[]): Promise<void> {
    for (const group of chunk(ids, 400)) {
      const batch = writeBatch(this.db);
      group.forEach((id) => batch.delete(doc(this.colRef(col), id)));
      await batch.commit();
    }
  }

  async putSettings(settings: Settings): Promise<void> {
    await setDoc(this.userDoc, plain(settings), { merge: true });
  }

  async replaceAll(state: VaultState): Promise<void> {
    for (const col of COLLECTIONS) {
      const existing = await getDocs(this.colRef(col));
      if (!existing.empty) {
        await this.removeMany(
          col,
          existing.docs.map((d) => d.id),
        );
      }
    }
    const writes: { col: CollectionName; item: { id: string } }[] = [];
    COLLECTIONS.forEach((col) => {
      (state[col] as { id: string }[]).forEach((item) => writes.push({ col, item }));
    });
    for (const group of chunk(writes, 400)) {
      const batch = writeBatch(this.db);
      group.forEach(({ col, item }) => batch.set(doc(this.colRef(col), item.id), plain(item)));
      await batch.commit();
    }
    await this.putSettings(pickSettings(state));
  }
}

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;
let cachedRepo: FirebaseRepo | null = null;

/**
 * Connects to Firestore with anonymous auth. Returns null when no Firebase
 * config is present so the app keeps working fully offline.
 */
export async function connectFirebase(): Promise<FirebaseRepo | null> {
  const config = readFirebaseConfig();
  if (!config) return null;
  if (cachedRepo) return cachedRepo;

  if (!cachedApp) cachedApp = initializeApp(config, 'vaulty');
  if (!cachedAuth) cachedAuth = getAuth(cachedApp);

  if (!cachedAuth.currentUser) {
    try {
      await signInAnonymously(cachedAuth);
    } catch (error) {
      const code = (error as { code?: string }).code ?? '';
      if (code.includes('admin-restricted-operation') || code.includes('operation-not-allowed')) {
        throw new Error(
          'Anonymous sign-in is disabled. Enable it in Firebase Console → Authentication → Sign-in method → Anonymous.',
        );
      }
      throw new Error(`Firebase sign-in failed${code ? ` (${code})` : ''}. Check Authentication and Authorized domains.`);
    }
  }

  const user = cachedAuth.currentUser;
  if (!user) throw new Error('Firebase sign-in did not return a user. Enable Anonymous sign-in and retry.');

  cachedRepo = new FirebaseRepo(getFirestore(cachedApp), user.uid, config.projectId);
  return cachedRepo;
}
