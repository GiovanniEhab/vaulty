import { Switch } from '../components/Field';
import Icon from '../components/Icon';
import Sheet from '../components/Sheet';
import { WIDGET_CATALOG } from '../lib/constants';
import { useVault } from '../store/VaultContext';

export function WidgetsSheet({ onClose }: { onClose: () => void }) {
  const { state, updateSettings } = useVault();

  const toggle = (id: (typeof WIDGET_CATALOG)[number]['id'], enabled: boolean) => {
    const next = enabled
      ? [...state.widgetIds, id].filter((value, index, all) => all.indexOf(value) === index)
      : state.widgetIds.filter((value) => value !== id);
    updateSettings({ widgetIds: next });
  };

  return (
    <Sheet title="Widgets" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          Pick the cards that sit on your home screen. Widgets update as you log money.
        </p>

        {WIDGET_CATALOG.map((widget) => {
          const enabled = state.widgetIds.includes(widget.id);
          return (
            <div
              key={widget.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                  <Icon name={widget.icon} className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{widget.label}</div>
                  <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">{widget.description}</div>
                </div>
              </div>
              <Switch checked={enabled} label={`Show ${widget.label} widget`} onChange={(value) => toggle(widget.id, value)} />
            </div>
          );
        })}

        {state.widgetIds.length === 0 ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
            All widgets are hidden. Turn one on to see it on the home screen.
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}

export default WidgetsSheet;
