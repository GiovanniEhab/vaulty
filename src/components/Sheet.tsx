import type { ReactNode } from 'react';
import Icon from './Icon';

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Bottom sheet scoped to the phone shell, like the reference app. */
export function Sheet({ title, onClose, children }: SheetProps) {
  return (
    <div
      className="absolute inset-0 z-50 flex flex-col justify-end bg-slate-950/60 backdrop-blur-sm"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="animate-sheet-up flex max-h-[88%] w-full flex-col rounded-t-3xl border-t border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex shrink-0 justify-center pb-1 pt-2.5">
          <div className="h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-2.5 dark:border-slate-800">
          <h2 className="text-base font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-100 p-1.5 text-slate-500 active:scale-95 dark:bg-slate-800 dark:text-slate-300"
            aria-label="Close"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
        <div className="no-scrollbar overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export default Sheet;
