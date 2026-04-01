import { useEffect, useState } from "react";
import { billsService, type BillsSummary } from "../services/bills.service";
import { useMaskedCurrency } from "../context/DiscreetModeContext";
import { OperationalSeverityBadge, OperationalStateBlock, type OperationalSeverity } from "./OperationalStateBlock";

interface BillsSummaryWidgetProps {
  onOpenBills?: () => void;
}

const BillsSummaryWidget = ({ onOpenBills }: BillsSummaryWidgetProps): JSX.Element | null => {
  const [summary, setSummary] = useState<BillsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);

  useEffect(() => {
    billsService
      .getSummary()
      .then((data) => {
        setSummary(data);
        setHasLoadError(false);
      })
      .catch(() => {
        setSummary(null);
        setHasLoadError(true);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const money = useMaskedCurrency();
  if (isLoading) {
    return (
      <div className="rounded border border-cf-border bg-cf-surface p-4">
        <p className="text-xs text-cf-text-secondary">Carregando pendências...</p>
      </div>
    );
  }

  if (hasLoadError) {
    return (
      <div className="rounded border border-red-300 bg-cf-surface p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-cf-text-primary">Pendências</h3>
          <OperationalSeverityBadge severity="risco" />
        </div>

        <OperationalStateBlock
          severity="risco"
          title="Resumo de pendências indisponível"
          happened="A consulta de contas pendentes e vencidas falhou nesta tentativa."
          impact="Você pode perder visibilidade de cobrança imediata e risco de juros."
          nextStep={
            onOpenBills
              ? "Abra o módulo de contas para revisar os lançamentos manualmente agora."
              : "Atualize a página em instantes para tentar carregar o resumo novamente."
          }
          ctaLabel={onOpenBills ? "Ver pendências" : undefined}
          onCta={onOpenBills}
        />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="rounded border border-amber-300 bg-cf-surface p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-cf-text-primary">Pendências</h3>
          <OperationalSeverityBadge severity="atencao" />
        </div>

        <OperationalStateBlock
          severity="atencao"
          title="Sem base suficiente para o resumo"
          happened="Ainda não há dados de pendências consolidados para este período."
          impact="A triagem de contas pode ficar incompleta até que novas contas sejam registradas."
          nextStep="Cadastre ou atualize contas para liberar esta leitura operacional."
        />
      </div>
    );
  }

  const hasOverdueBills = summary.overdueCount > 0;
  const hasPendingBills = summary.pendingCount > 0;
  const severityLevel: OperationalSeverity = hasOverdueBills ? "risco" : hasPendingBills ? "atencao" : "normal";
  const cardToneClass = hasOverdueBills ? "border-red-300" : hasPendingBills ? "border-amber-300" : "border-cf-border";
  const statusContext = hasOverdueBills
    ? "Há contas vencidas exigindo ação imediata."
    : hasPendingBills
      ? "Há contas pendentes sem atraso no momento."
      : "Sem pendências ou vencimentos no recorte atual.";

  return (
    <div className={`rounded border bg-cf-surface p-4 ${cardToneClass}`}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-cf-text-primary">Pendências</h3>
          <OperationalSeverityBadge severity={severityLevel} />
        </div>
        {onOpenBills ? (
          <button
            type="button"
            onClick={onOpenBills}
            className="text-xs text-brand-1 hover:underline"
          >
            Ver pendências →
          </button>
        ) : null}
      </div>

      <p className="mb-3 text-xs text-cf-text-secondary">
        {statusContext}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className={`rounded border bg-cf-bg-subtle px-3 py-2.5 ${hasOverdueBills ? "border-red-200" : "border-cf-border"}`}>
          <p className="text-xs font-medium uppercase text-cf-text-secondary">Vencidas</p>
          <p
            className={`text-sm font-semibold ${summary.overdueCount > 0 ? "text-red-600" : "text-cf-text-primary"}`}
          >
            {money(summary.overdueTotal)}
          </p>
          <p className={`text-xs ${summary.overdueCount > 0 ? "text-red-500" : "text-cf-text-secondary"}`}>
            {summary.overdueCount} {summary.overdueCount === 1 ? "conta" : "contas"}
          </p>
        </div>

        <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
          <p className="text-xs font-medium uppercase text-cf-text-secondary">Pendentes</p>
          <p className="text-sm font-semibold text-cf-text-primary">
            {money(summary.pendingTotal)}
          </p>
          <p className="text-xs text-cf-text-secondary">
            {summary.pendingCount} {summary.pendingCount === 1 ? "conta" : "contas"}
          </p>
        </div>
      </div>
    </div>
  );
};

export default BillsSummaryWidget;
