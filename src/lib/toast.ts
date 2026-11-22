export type ToastVariant = 'default' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

type Listener = (item: ToastItem) => void;

const listeners = new Set<Listener>();
let nextId = 1;

export function toast(message: string, variant: ToastVariant = 'default'): void {
  const item: ToastItem = { id: nextId++, message, variant };
  listeners.forEach((listener) => listener(item));
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
