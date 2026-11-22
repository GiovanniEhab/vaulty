import { useEffect, useState } from 'react';
import { subscribeToasts, type ToastItem } from '../lib/toast';

export function Toasts() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(
    () =>
      subscribeToasts((item) => {
        setItems((prev) => [...prev, item]);
        setTimeout(() => {
          setItems((prev) => prev.filter((t) => t.id !== item.id));
        }, 2600);
      }),
    [],
  );

  return (
    <div className="pointer-events-none absolute bottom-20 left-1/2 z-50 flex w-[90%] -translate-x-1/2 flex-col items-center gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={`animate-toast pointer-events-auto rounded-2xl px-4 py-2.5 text-center text-xs font-semibold shadow-xl ${
            item.variant === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
          }`}
        >
          {item.message}
        </div>
      ))}
    </div>
  );
}

export default Toasts;
