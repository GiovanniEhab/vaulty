import type { SheetState } from '../ui/UIContext';
import AccountSheet from './AccountSheet';
import AssistantSheet from './AssistantSheet';
import BudgetSheet from './BudgetSheet';
import ConfirmSheet from './ConfirmSheet';
import ContributeSheet from './ContributeSheet';
import DataSheet from './DataSheet';
import GoalSheet from './GoalSheet';
import InsightsSheet from './InsightsSheet';
import RecurringSheet from './RecurringSheet';
import TransactionSheet from './TransactionSheet';
import WidgetsSheet from './WidgetsSheet';

export function SheetHost({ sheet, onClose }: { sheet: SheetState | null; onClose: () => void }) {
  if (!sheet) return null;

  switch (sheet.kind) {
    case 'tx':
      return <TransactionSheet id={sheet.id} defaultType={sheet.defaultType} onClose={onClose} />;
    case 'account':
      return <AccountSheet id={sheet.id} onClose={onClose} />;
    case 'budget':
      return <BudgetSheet id={sheet.id} onClose={onClose} />;
    case 'goal':
      return <GoalSheet id={sheet.id} onClose={onClose} />;
    case 'contribute':
      return <ContributeSheet id={sheet.id} onClose={onClose} />;
    case 'recurring':
      return <RecurringSheet onClose={onClose} />;
    case 'assistant':
      return <AssistantSheet onClose={onClose} />;
    case 'widgets':
      return <WidgetsSheet onClose={onClose} />;
    case 'insights':
      return <InsightsSheet onClose={onClose} />;
    case 'data':
      return <DataSheet onClose={onClose} />;
    case 'confirm':
      return (
        <ConfirmSheet
          title={sheet.title}
          message={sheet.message}
          confirmLabel={sheet.confirmLabel}
          onConfirm={sheet.onConfirm}
          onClose={onClose}
        />
      );
    default:
      return null;
  }
}

export default SheetHost;
