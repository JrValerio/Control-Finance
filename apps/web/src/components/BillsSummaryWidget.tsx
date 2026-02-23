import { useEffect, useState } from "react";
import { billsService, type BillsSummary } from "../services/bills.service";
import { formatCurrency } from "../utils/formatCurrency";

interface BillsSummaryWidgetProps {
  onOpenBills?: () => void;
}

const BillsSummaryWidget = ({ onOpenBills }: BillsSummaryWidgetProps): JSX.Element | null => {
  const [summary, setSummary] = useState<BillsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    billsService
      .getSummary()
      .then(setSummary)
      .catch(() => {
        setSummary(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="rounded border border-cf-border bg-cf-surface p-4">
        <p className="text-xs text-cf-text-secondary">Carregando pendencias...</p>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="rounded border border-cf-border bg-cf-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-cf-text-primary">Pendencias</h3>
        {onOpenBills ? (
          <button
            type="button"
            onClick={onOpenBills}
            className="text-xs text-brand-1 hover:underline"
          >
            Ver pendencias →
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
          <p className="text-xs font-medium uppercase text-cf-text-secondary">Pendentes</p>
          <p className="text-sm font-semibold text-cf-text-primary">
            {formatCurrency(summary.pendingTotal)}
          </p>
          <p className="text-xs text-cf-text-secondary">
            {summary.pendingCount} {summary.pendingCount === 1 ? "conta" : "contas"}
          </p>
        </div>

        <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
          <p className="text-xs font-medium uppercase text-cf-text-secondary">Vencidas</p>
          <p
            className={`text-sm font-semibold ${summary.overdueCount > 0 ? "text-red-600" : "text-cf-text-primary"}`}
          >
            {formatCurrency(summary.overdueTotal)}
          </p>
          <p className={`text-xs ${summary.overdueCount > 0 ? "text-red-500" : "text-cf-text-secondary"}`}>
            {summary.overdueCount} {summary.overdueCount === 1 ? "conta" : "contas"}
          </p>
        </div>
      </div>
    </div>
  );
};

export default BillsSummaryWidget;
