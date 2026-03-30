import { useEffect, useState } from "react";
import { useMaskedCurrency } from "../context/DiscreetModeContext";
import { billsService, type Bill, type UtilityPanel } from "../services/bills.service";
import { aiService, type UtilityInsight } from "../services/ai.service";

const BILL_TYPE_LABELS: Record<string, string> = {
  energy: "Energia",
  water: "Água",
  internet: "Internet",
  phone: "Telefone",
  gas: "Gás",
};

const formatDueDate = (iso: string): string => {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
};

const BillRow = ({
  bill,
  urgency,
  money,
}: {
  bill: Bill;
  urgency: "overdue" | "due_soon" | "upcoming";
  money: (v: number) => string;
}) => {
  const typeLabel = bill.billType ? (BILL_TYPE_LABELS[bill.billType] ?? bill.billType) : null;

  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full ${
              urgency === "overdue"
                ? "bg-red-500"
                : urgency === "due_soon"
                  ? "bg-amber-500"
                  : "bg-cf-text-secondary"
            }`}
          />
          <span className="truncate text-xs text-cf-text-primary">{bill.title}</span>
          {typeLabel ? (
            <span className="flex-shrink-0 rounded bg-cf-bg-subtle px-1 py-0.5 text-[10px] text-cf-text-secondary">
              {typeLabel}
            </span>
          ) : null}
        </div>
        {bill.provider ? (
          <p className="ml-3 text-[10px] text-cf-text-secondary">{bill.provider}</p>
        ) : null}
      </div>
      <div className="flex-shrink-0 text-right">
        <p
          className={`text-xs font-medium ${
            urgency === "overdue" ? "text-red-600" : "text-cf-text-primary"
          }`}
        >
          {money(bill.amount)}
        </p>
        <p
          className={`text-[10px] ${urgency === "overdue" ? "text-red-500" : "text-cf-text-secondary"}`}
        >
          {urgency === "overdue" ? "venceu " : ""}
          {formatDueDate(bill.dueDate)}
        </p>
      </div>
    </div>
  );
};

const EMPTY_PANEL: UtilityPanel = {
  overdue: [],
  dueSoon: [],
  upcoming: [],
  summary: {
    totalPending: 0,
    totalAmount: 0,
    overdueCount: 0,
    overdueAmount: 0,
    dueSoonCount: 0,
    dueSoonAmount: 0,
  },
};

const UtilityBillsWidget = (): JSX.Element => {
  const [panel, setPanel] = useState<UtilityPanel>(EMPTY_PANEL);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [insight, setInsight] = useState<UtilityInsight | null>(null);
  const money = useMaskedCurrency();

  useEffect(() => {
    billsService
      .getUtilityPanel()
      .then((data) => {
        setPanel(data);
        setHasError(false);
      })
      .catch(() => setHasError(true))
      .finally(() => setIsLoading(false));
  }, []);

  // Insight fetched once on mount — soft triagem signal, not synchronized with data refreshes.
  useEffect(() => {
    aiService.getUtilityInsight().then(setInsight).catch(() => {/* non-blocking */});
  }, []);

  if (isLoading) {
    return (
      <div className="rounded border border-cf-border bg-cf-surface p-4">
        <p className="text-xs text-cf-text-secondary">Carregando contas de consumo...</p>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="rounded border border-cf-border bg-cf-surface p-4">
        <h3 className="mb-1 text-sm font-medium text-cf-text-primary">Contas de consumo</h3>
        <p className="text-sm text-cf-text-secondary">Não foi possível carregar as contas.</p>
      </div>
    );
  }

  const { overdue, dueSoon, upcoming, summary } = panel;
  const hasAny = summary.totalPending > 0;

  return (
    <div className="rounded border border-cf-border bg-cf-surface p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-cf-text-primary">Contas de consumo</h3>
          <p className="text-xs text-cf-text-secondary">
            {hasAny
              ? `${summary.totalPending} ${summary.totalPending === 1 ? "conta pendente" : "contas pendentes"}`
              : "Nenhuma conta de consumo pendente."}
          </p>
        </div>
        {hasAny ? (
          <div className="text-right">
            <p className="text-xs font-semibold text-cf-text-primary">{money(summary.totalAmount)}</p>
            <p className="text-[10px] text-cf-text-secondary">total pendente</p>
          </div>
        ) : null}
      </div>

      {/* Empty state */}
      {!hasAny ? (
        <div className="rounded border border-dashed border-cf-border bg-cf-bg-subtle px-3 py-3 text-sm text-cf-text-secondary">
          Cadastre suas contas de água, energia e internet para acompanhar o vencimento aqui.
        </div>
      ) : (
        <>
          {/* AI insight banner */}
          {insight ? (
            <div
              className={`mb-3 flex items-start gap-2 rounded border px-3 py-2 ${
                insight.type === "critical"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : insight.type === "warning"
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              <span className="mt-0.5 flex-shrink-0 text-xs font-semibold uppercase tracking-wide">
                {insight.riskLabel}
              </span>
              <span className="text-xs leading-relaxed">{insight.message}</span>
            </div>
          ) : null}

          {/* Vencidas */}
          {overdue.length > 0 ? (
            <div className="mb-3">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-red-600">
                  Vencidas ({overdue.length})
                </p>
                <p className="text-[10px] font-medium text-red-600">{money(summary.overdueAmount)}</p>
              </div>
              <div className="divide-y divide-cf-border rounded border border-red-200 bg-red-50 px-3">
                {overdue.map((b) => (
                  <BillRow key={b.id} bill={b} urgency="overdue" money={money} />
                ))}
              </div>
            </div>
          ) : null}

          {/* A vencer em 7 dias */}
          {dueSoon.length > 0 ? (
            <div className="mb-3">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                  Vence em breve ({dueSoon.length})
                </p>
                <p className="text-[10px] font-medium text-amber-600">{money(summary.dueSoonAmount)}</p>
              </div>
              <div className="divide-y divide-cf-border rounded border border-amber-200 bg-amber-50 px-3">
                {dueSoon.map((b) => (
                  <BillRow key={b.id} bill={b} urgency="due_soon" money={money} />
                ))}
              </div>
            </div>
          ) : null}

          {/* Futuras */}
          {upcoming.length > 0 ? (
            <div>
              <div className="mb-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-cf-text-secondary">
                  Próximas ({upcoming.length})
                </p>
              </div>
              <div className="divide-y divide-cf-border rounded border border-cf-border bg-cf-bg-subtle px-3">
                {upcoming.map((b) => (
                  <BillRow key={b.id} bill={b} urgency="upcoming" money={money} />
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};

export default UtilityBillsWidget;
