import { useEffect, useState } from "react";
import {
  salaryService,
  type ConsignadoOverview,
  type ConsignacaoType,
  type MarginStatus,
} from "../services/salary.service";
import { formatCurrency } from "../utils/formatCurrency";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CONSIGNACAO_TYPE_LABEL: Record<ConsignacaoType, string> = {
  loan:  "Empréstimo",
  card:  "Cartão",
  other: "Outro",
};

const MARGIN_COLORS: Record<MarginStatus, string> = {
  safe:     "bg-emerald-500",
  warning:  "bg-amber-500",
  exceeded: "bg-red-500",
};

const MARGIN_TEXT: Record<MarginStatus, string> = {
  safe:     "text-emerald-600",
  warning:  "text-amber-600",
  exceeded: "text-red-600",
};

const MARGIN_LABEL: Record<MarginStatus, string> = {
  safe:     "Dentro do limite",
  warning:  "Próximo do limite",
  exceeded: "Limite ultrapassado",
};

const formatEndDate = (value: string | null): string | null => {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
};

// ─── Widget ───────────────────────────────────────────────────────────────────

const ConsignadoOverviewWidget = (): JSX.Element | null => {
  const [overview, setOverview] = useState<ConsignadoOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    salaryService
      .getConsignadoOverview()
      .then(setOverview)
      .catch(() => {/* non-blocking */})
      .finally(() => setIsLoading(false));
  }, []);

  // Don't render if no consignações
  if (!isLoading && (overview === null || overview.contracts.length === 0)) return null;

  const hasMargin = overview?.comprometimentoPct != null && overview?.marginStatus != null;
  const pct = overview?.comprometimentoPct ?? 0;
  const status = overview?.marginStatus ?? "safe";
  const contracts = overview?.contracts ?? [];
  const visibleContracts = contracts.slice(0, 6);
  const hiddenContractsCount = Math.max(contracts.length - visibleContracts.length, 0);

  return (
    <section className="rounded-lg border border-cf-border bg-cf-surface p-4 md:p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-cf-text-primary">Consignado</h3>
          <p className="text-xs text-cf-text-secondary">Descontos em folha / benefício</p>
        </div>

        {!isLoading && overview && (
          <div className="text-right">
            <p className="text-lg font-semibold leading-none text-cf-text-primary">
              {formatCurrency(overview.monthlyTotal)}
            </p>
            <p className="mt-1 text-[11px] text-cf-text-secondary">
              /mês · {overview.contracts.length} contrato{overview.contracts.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}

        {isLoading && (
          <div className="animate-pulse text-right">
            <div className="mb-1 h-5 w-24 rounded bg-cf-border" />
            <div className="h-3 w-16 rounded bg-cf-border" />
          </div>
        )}
      </div>

      {/* Margin bar (INSS beneficiary only) */}
      {!isLoading && hasMargin && (
        <div className="mb-3 rounded-lg border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
          <div className="mb-1 flex items-center justify-between">
            <span className={`text-xs font-medium ${MARGIN_TEXT[status]}`}>
              {MARGIN_LABEL[status]}
            </span>
            <span className={`text-xs font-semibold ${MARGIN_TEXT[status]}`}>
              {pct.toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-cf-border">
            <div
              className={`h-full rounded-full transition-all ${MARGIN_COLORS[status]}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <div className="mt-0.5 flex justify-between">
            <span className="text-[10px] text-cf-text-secondary">0%</span>
            <span className="text-[10px] text-amber-500">25%</span>
            <span className="text-[10px] text-red-500">35%</span>
            <span className="text-[10px] text-cf-text-secondary">100%</span>
          </div>
        </div>
      )}

      {/* Net after consignado */}
      {!isLoading && overview?.netAfterConsignado != null && (
        <p className="mb-3 text-[11px] text-cf-text-secondary">
          Líquido após descontos:{" "}
          <span className="font-medium text-cf-text-primary">
            {formatCurrency(overview.netAfterConsignado)}
          </span>
        </p>
      )}

      {/* Contract list */}
      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-cf-bg-subtle px-3 py-2.5">
              <div className="space-y-1">
                <div className="h-3 w-32 rounded bg-cf-border" />
                <div className="h-2.5 w-20 rounded bg-cf-border" />
              </div>
              <div className="h-4 w-16 rounded bg-cf-border" />
            </div>
          ))}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {visibleContracts.map((c) => {
            const endLabel = formatEndDate(c.endDate);
            return (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-cf-border/70 bg-cf-bg-subtle px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-cf-text-primary">
                    {c.description}
                  </p>
                  <p className="text-[10px] text-cf-text-secondary">
                    {CONSIGNACAO_TYPE_LABEL[c.consignacaoType]}
                    {endLabel ? ` · até ${endLabel}` : ""}
                  </p>
                </div>
                <span className="ml-3 shrink-0 text-xs font-semibold text-cf-text-primary">
                  {formatCurrency(c.amount)}
                </span>
              </li>
            );
          })}
          {hiddenContractsCount > 0 ? (
            <li className="px-1 text-[11px] text-cf-text-secondary">
              + {hiddenContractsCount} contrato(s) adicionais na visão completa de renda.
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
};

export default ConsignadoOverviewWidget;
