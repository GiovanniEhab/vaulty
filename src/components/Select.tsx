import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

export interface SelectOption {
  value: string;
  label: ReactNode;
  hint?: string;
  disabled?: boolean;
}

type SelectVariant = 'field' | 'compact' | 'bare';

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  variant?: SelectVariant;
  align?: 'auto' | 'left' | 'right';
}

interface PanelPosition {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

const triggerClasses: Record<SelectVariant, string> = {
  field:
    'flex h-11 w-full items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-left text-sm text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',
  compact:
    'flex h-8 items-center justify-between gap-1 rounded-xl border border-slate-200/70 bg-slate-100 px-2 text-[11px] font-bold text-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-200',
  bare:
    'flex items-center justify-between gap-1 bg-transparent text-[11px] font-semibold text-slate-600 transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300',
};

/**
 * Dropdown that looks the same on every Android WebView and desktop browser.
 * The native <select> popup cannot be styled, so the list is rendered in a portal
 * with a floating panel, keyboard support and an iOS/Android-style check mark.
 */
export function Select({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder = 'Select…',
  disabled = false,
  className = '',
  variant = 'field',
  align = 'auto',
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [panel, setPanel] = useState<PanelPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listId = useId();
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    const minWidth = variant === 'field' ? rect.width : variant === 'compact' ? 172 : 148;
    const width = Math.min(Math.max(rect.width, minWidth), viewportWidth - 16);

    let left = rect.left;
    const overflowsRight = rect.left + width > viewportWidth - 8;
    if (align === 'right' || (align === 'auto' && overflowsRight && rect.right - width >= 8)) {
      left = rect.right - width;
    }
    left = Math.max(8, Math.min(left, viewportWidth - width - 8));

    const spaceBelow = viewportHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(300, (openUp ? spaceAbove : spaceBelow) - 6));

    setPanel(
      openUp
        ? { left, width, bottom: viewportHeight - rect.top + 6, maxHeight }
        : { left, width, top: rect.bottom + 6, maxHeight },
    );
  }, [align, variant]);

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => reposition();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('resize', onResize);
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const option = optionRefs.current[activeIndex];
    option?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const move = (direction: 1 | -1) => {
    if (options.length === 0) return;
    let next = activeIndex;
    for (let step = 0; step < options.length; step += 1) {
      next = (next + direction + options.length) % options.length;
      if (!options[next].disabled) {
        setActiveIndex(next);
        return;
      }
    }
  };

  const openMenu = () => {
    if (disabled) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };

  const choose = (option: SelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) openMenu();
        else move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) openMenu();
        else move(-1);
        break;
      case 'Home':
        if (open) {
          event.preventDefault();
          setActiveIndex(0);
        }
        break;
      case 'End':
        if (open) {
          event.preventDefault();
          setActiveIndex(options.length - 1);
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (!open) openMenu();
        else if (options[activeIndex]) choose(options[activeIndex]);
        break;
      case 'Escape':
        if (open) {
          event.preventDefault();
          setOpen(false);
        }
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        break;
    }
  };

  const panelStyle: CSSProperties | undefined = panel
    ? {
        position: 'fixed',
        left: panel.left,
        width: panel.width,
        top: panel.top,
        bottom: panel.bottom,
        maxHeight: panel.maxHeight,
        zIndex: 120,
      }
    : undefined;

  const listbox =
    open && panel
      ? createPortal(
          <div
            ref={panelRef}
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            style={panelStyle}
            className="animate-select-in overflow-y-auto overscroll-contain rounded-2xl border border-slate-200/80 bg-white/98 p-1.5 shadow-2xl shadow-slate-900/20 backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/98"
          >
            {options.length === 0 ? (
              <p className="px-2.5 py-2 text-xs text-slate-400">No options</p>
            ) : (
              options.map((option, index) => {
                const isSelected = option.value === value;
                const isActive = index === activeIndex;
                return (
                  <button
                    key={`${option.value}-${index}`}
                    ref={(node) => {
                      optionRefs.current[index] = node;
                    }}
                    id={`${listId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={option.disabled}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(option)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      isSelected
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                        : isActive
                          ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                          : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{option.label}</span>
                      {option.hint ? (
                        <span className="mt-0.5 block truncate text-[10px] font-normal text-slate-400">{option.hint}</span>
                      ) : null}
                    </span>
                    {isSelected ? <Icon name="check" className="h-4 w-4 shrink-0" /> : null}
                  </button>
                );
              })
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-option-${activeIndex}` : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={`${triggerClasses[variant]} ${open ? 'ring-2 ring-emerald-500/70' : ''} ${className}`}
      >
        <span className={`min-w-0 flex-1 truncate text-left ${selected ? '' : 'text-slate-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <Icon
          name="chevron-down"
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {listbox}
    </>
  );
}

export default Select;
