import { useEffect, useState, useCallback } from "react";
import { useMaskedCurrency } from "../context/DiscreetModeContext";
import {
  billsService,
  type Bill,
  type UtilityPanel,
  type MatchCandidate,
} from "../services/bills.service";
import { aiService, type UtilityInsight } from "../services/ai.service";

const BILL_TYPE_LABELS: Record<string, string> = {
  energy: "Energia",
  water: "Água",
  internet: "Internet",
  phone: "Telefone",
  tv: "TV",
  gas: "Gás",
};

const formatDueDate = (iso: string): string => {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
};

const formatDisplayDate = (value: string | null): string => {
  if (!value) return "";
  const isoDate = value.includes("T") ? value.slice(0, 10) : value;
  return formatDueDate(isoDate);
};

// ─── Reconciliation state per bill ───────────────────────────────────────────

type ReconcilePhase =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "candidates"; candidates: MatchCandidate[] }
  | { phase: "confirm_divergence"; candidate: MatchCandidate; billAmount: number }
  | { phase: "confirming" }
  | { phase: "error"; message: string };

interface ReconcileState {
  billId: number;
  inner: ReconcilePhase;
}

// ─── Candidate row ────────────────────────────────────────────────────────────

const CandidateRow = ({
  candidate,
  money,
  onConfirm,
}: {
  candidate: MatchCandidate;
  money: (v: number) => string;
  onConfirm: (c: MatchCandidate) => void;
}) => {
  const confidenceLabel = candidate.score >= 0.75 ? "Alta" : "Média";
  const confidenceClass =
    candidate.score >= 0.75
      ? "bg-emerald-100 text-emerald-700"
      : "bg-amber-100 text-amber-700";

  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <div className="min-w-0">
        <p className="truncate text-xs text-cf-text-primary">
          {candidate.description ?? "Sem descrição"}
        </p>
        <p className="text-[10px] text-cf-text-secondary">
          {formatDueDate(candidate.date)} · {money(candidate.amount)}
          {candidate.divergencePercent > 1
            ? ` · divergência ${candidate.divergencePercent.toFixed(1)}%`
            : null}
        </p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1.5">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${confidenceClass}`}>
          {confidenceLabel}
        </span>
        <button
          type="button"
          onClick={() => onConfirm(candidate)}
          className="rounded border border-cf-border px-2 py-0.5 text-[10px] text-cf-text-secondary hover:border-emerald-400 hover:text-emerald-700"
        >
          Confirmar
        </button>
      </div>
    </div>
  );
};

// ─── Bill row ─────────────────────────────────────────────────────────────────

const BillRow = ({
  bill,
  urgency,
  money,
  reconcile,
  onConciliar,
  onConfirmCandidate,
  onConfirmDivergence,
  onCancelReconcile,
  onUnmatch,
}: {
  bill: Bill;
  urgency: "overdue" | "due_soon" | "upcoming";
  money: (v: number) => string;
  reconcile: ReconcileState | null;
  onConciliar: () => void;
  onConfirmCandidate: (c: MatchCandidate) => void;
  onConfirmDivergence: () => void;
  onCancelReconcile: () => void;
  onUnmatch: () => void;
}) => {
  const typeLabel = bill.billType ? (BILL_TYPE_LABELS[bill.billType] ?? bill.billType) : null;
  const isMatched = bill.matchStatus === "matched";
  const phase = reconcile?.billId === bill.id ? reconcile.inner : null;

  return (
    <div className="py-1.5">
      {/* Main row */}
      <div className="flex items-center justify-between gap-2">
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
            {isMatched ? (
              <span className="flex-shrink-0 rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-medium text-emerald-700">
                Conciliada
              </span>
            ) : null}
          </div>
          {bill.provider ? (
            <p className="ml-3 text-[10px] text-cf-text-secondary">{bill.provider}</p>
          ) : null}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <div className="text-right">
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
          {isMatched ? (
            <button
              type="button"
              onClick={onUnmatch}
              title="Desfazer conciliação"
              className="rounded px-1.5 py-0.5 text-[10px] text-cf-text-secondary hover:bg-cf-border hover:text-cf-text-primary"
            >
              Desfazer
            </button>
          ) : phase === null ? (
            <button
              type="button"
              onClick={onConciliar}
              className="rounded border border-cf-border px-1.5 py-0.5 text-[10px] text-cf-text-secondary hover:border-brand-1 hover:text-brand-1"
            >
              Conciliar
            </button>
          ) : null}
        </div>
      </div>

      {/* Reconcile panel — inline below the row */}
      {phase ? (
        <div className="ml-3 mt-2 rounded border border-cf-border bg-cf-bg-page px-3 py-2">
          {phase.phase === "loading" ? (
            <p className="text-[10px] text-cf-text-secondary">Buscando transações...</p>
          ) : phase.phase === "candidates" ? (
            <>
              {phase.candidates.length === 0 ? (
                <p className="text-[10px] text-cf-text-secondary">
                  Nenhuma transação compatível encontrada na janela de ±10 dias.
                </p>
              ) : (
                <div className="divide-y divide-cf-border">
                  {phase.candidates.map((c) => (
                    <CandidateRow
                      key={c.transactionId}
                      candidate={c}
                      money={money}
                      onConfirm={onConfirmCandidate}
                    />
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={onCancelReconcile}
                className="mt-2 text-[10px] text-cf-text-secondary hover:text-cf-text-primary"
              >
                Cancelar
              </button>
            </>
          ) : phase.phase === "confirm_divergence" ? (
            <>
              <p className="mb-2 text-[10px] text-amber-700">
                Divergência de{" "}
                <strong>{phase.candidate.divergencePercent.toFixed(1)}%</strong> entre a conta (
                {money(phase.billAmount)}) e a transação ({money(phase.candidate.amount)}).
                Confirmar mesmo assim?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onConfirmDivergence}
                  className="rounded bg-amber-600 px-2 py-0.5 text-[10px] font-medium text-white hover:opacity-90"
                >
                  Confirmar divergência
                </button>
                <button
                  type="button"
                  onClick={onCancelReconcile}
                  className="text-[10px] text-cf-text-secondary hover:text-cf-text-primary"
                >
                  Cancelar
                </button>
              </div>
            </>
          ) : phase.phase === "confirming" ? (
            <p className="text-[10px] text-cf-text-secondary">Salvando conciliação...</p>
          ) : phase.phase === "error" ? (
            <>
              <p className="text-[10px] text-red-600">{phase.message}</p>
              <button
                type="button"
                onClick={onCancelReconcile}
                className="mt-1 text-[10px] text-cf-text-secondary hover:text-cf-text-primary"
              >
                Fechar
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

// ─── Widget ───────────────────────────────────────────────────────────────────

const EMPTY_PANEL: UtilityPanel = {
  overdue: [],
  dueSoon: [],
  upcoming: [],
  paid: [],
  summary: {
    totalPending: 0,
    totalAmount: 0,
    overdueCount: 0,
    overdueAmount: 0,
    dueSoonCount: 0,
    dueSoonAmount: 0,
    paidCount: 0,
    paidAmount: 0,
  },
};

const UtilityBillsWidget = (): JSX.Element => {
  const [panel, setPanel] = useState<UtilityPanel>(EMPTY_PANEL);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [insight, setInsight] = useState<UtilityInsight | null>(null);
  const [reconcile, setReconcile] = useState<ReconcileState | null>(null);
  const [unmatchError, setUnmatchError] = useState<string | null>(null);
  const money = useMaskedCurrency();

  const load = useCallback(() => {
    billsService
      .getUtilityPanel()
      .then((data) => {
        setPanel(data);
        setHasError(false);
      })
      .catch(() => setHasError(true))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Insight fetched once on mount — soft triagem signal, not synchronized with data refreshes.
  useEffect(() => {
    aiService.getUtilityInsight().then(setInsight).catch(() => {/* non-blocking */});
  }, []);

  // ─── Reconcile handlers ─────────────────────────────────────────────────────

  const handleConciliar = async (bill: Bill) => {
    setReconcile({ billId: bill.id, inner: { phase: "loading" } });
    try {
      const result = await billsService.getMatchCandidates(bill.id);
      setReconcile({ billId: bill.id, inner: { phase: "candidates", candidates: result.candidates } });
    } catch {
      setReconcile({ billId: bill.id, inner: { phase: "error", message: "Erro ao buscar candidatos." } });
    }
  };

  const handleConfirmCandidate = (bill: Bill, candidate: MatchCandidate) => {
    if (candidate.requiresDivergenceConfirmation) {
      setReconcile({
        billId: bill.id,
        inner: { phase: "confirm_divergence", candidate, billAmount: bill.amount },
      });
      return;
    }
    doConfirm(bill, candidate, false);
  };

  const handleConfirmDivergence = (bill: Bill) => {
    const phase = reconcile?.inner;
    if (phase?.phase !== "confirm_divergence") return;
    doConfirm(bill, phase.candidate, true);
  };

  const doConfirm = async (bill: Bill, candidate: MatchCandidate, confirmDivergence: boolean) => {
    setReconcile({ billId: bill.id, inner: { phase: "confirming" } });
    try {
      await billsService.confirmMatch(bill.id, candidate.transactionId, confirmDivergence);
      setReconcile(null);
      load();
    } catch {
      setReconcile({
        billId: bill.id,
        inner: { phase: "error", message: "Erro ao salvar conciliação. Tente novamente." },
      });
    }
  };

  const handleUnmatch = async (bill: Bill) => {
    setUnmatchError(null);
    try {
      await billsService.unmatch(bill.id);
      load();
    } catch {
      setUnmatchError("Não foi possível desfazer a conciliação. Tente novamente.");
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

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

  const { overdue, dueSoon, upcoming, paid, summary } = panel;
  const hasAnyPending = summary.totalPending > 0;
  const hasAnyOperational = hasAnyPending || summary.paidCount > 0;

  const renderBillRow = (bill: Bill, urgency: "overdue" | "due_soon" | "upcoming") => (
    <BillRow
      key={bill.id}
      bill={bill}
      urgency={urgency}
      money={money}
      reconcile={reconcile}
      onConciliar={() => handleConciliar(bill)}
      onConfirmCandidate={(c) => handleConfirmCandidate(bill, c)}
      onConfirmDivergence={() => handleConfirmDivergence(bill)}
      onCancelReconcile={() => setReconcile(null)}
      onUnmatch={() => handleUnmatch(bill)}
    />
  );

  return (
    <div className="rounded border border-cf-border bg-cf-surface p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-cf-text-primary">Contas de consumo</h3>
          <p className="text-xs text-cf-text-secondary">
            {hasAnyPending
              ? `${summary.totalPending} ${summary.totalPending === 1 ? "conta pendente" : "contas pendentes"}`
              : summary.paidCount > 0
                ? `${summary.paidCount} ${summary.paidCount === 1 ? "conta já paga" : "contas já pagas"}`
                : "Nenhuma conta de consumo pendente."}
          </p>
        </div>
        {hasAnyPending ? (
          <div className="text-right">
            <p className="text-xs font-semibold text-cf-text-primary">{money(summary.totalAmount)}</p>
            <p className="text-[10px] text-cf-text-secondary">total pendente</p>
          </div>
        ) : null}
      </div>

      {/* Empty state */}
      {!hasAnyOperational ? (
        <div className="rounded border border-dashed border-cf-border bg-cf-bg-subtle px-3 py-3 text-sm text-cf-text-secondary">
          Cadastre suas contas de água, energia, internet, telefone e TV para acompanhar o vencimento aqui.
        </div>
      ) : (
        <>
          {/* Unmatch error */}
          {unmatchError ? (
            <p className="mb-2 text-xs text-red-600">{unmatchError}</p>
          ) : null}

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
                {overdue.map((b) => renderBillRow(b, "overdue"))}
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
                {dueSoon.map((b) => renderBillRow(b, "due_soon"))}
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
                {upcoming.map((b) => renderBillRow(b, "upcoming"))}
              </div>
            </div>
          ) : null}

          {/* Já pagas */}
          {paid.length > 0 ? (
            <div className={upcoming.length > 0 ? "mt-3" : ""}>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                  Já pagas ({paid.length})
                </p>
                <p className="text-[10px] font-medium text-emerald-700">{money(summary.paidAmount)}</p>
              </div>
              <div className="divide-y divide-cf-border rounded border border-emerald-200 bg-emerald-50 px-3">
                {paid.slice(0, 5).map((bill) => {
                  const typeLabel = bill.billType
                    ? (BILL_TYPE_LABELS[bill.billType] ?? bill.billType)
                    : null;

                  return (
                    <div key={bill.id} className="flex items-center justify-between gap-2 py-1.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-xs text-cf-text-primary">{bill.title}</span>
                          {typeLabel ? (
                            <span className="flex-shrink-0 rounded bg-white/70 px-1 py-0.5 text-[10px] text-cf-text-secondary">
                              {typeLabel}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[10px] text-emerald-700">
                          pago em {formatDisplayDate(bill.paidAt) || formatDueDate(bill.dueDate)}
                        </p>
                      </div>
                      <p className="text-xs font-medium text-emerald-700">{money(bill.amount)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};

export default UtilityBillsWidget;
