import { createContext, useContext } from 'react';
import type { PlanTab, Transaction, ViewName } from '../lib/types';

export type SheetState =
  | { kind: 'tx'; id?: string; defaultType?: Transaction['type'] }
  | { kind: 'account'; id?: string }
  | { kind: 'budget'; id?: string }
  | { kind: 'goal'; id?: string }
  | { kind: 'contribute'; id: string }
  | { kind: 'recurring' }
  | { kind: 'data' }
  | { kind: 'confirm'; title: string; message: string; confirmLabel: string; onConfirm: () => void };

export interface UIActions {
  view: ViewName;
  setView: (view: ViewName) => void;
  planTab: PlanTab;
  setPlanTab: (tab: PlanTab) => void;
  goToPlan: (tab: PlanTab) => void;
  openSheet: (sheet: SheetState) => void;
  closeSheet: () => void;
  confirm: (options: { title: string; message: string; confirmLabel: string; onConfirm: () => void }) => void;
}

export const UIContext = createContext<UIActions | null>(null);

export function useUI(): UIActions {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used inside <UIContext.Provider>');
  return ctx;
}
