import { useEffect, useMemo, useRef, useState } from "react";
import { useMaskedCurrency } from "../context/DiscreetModeContext";
import {
  creditCardsService,
  type CreditCardItem,
  type CreditCardInvoicePdf,
} from "../services/credit-cards.service";

interface CreditCardsSummaryWidgetProps {
  onOpenCreditCards?: () => void;
}

interface CreditCardsAggregate {
  cardsCount: number;
  limitTotal: number;
  limitUsed: number;
  availableTotal: number;
  openPurchasesTotal: number;
  pendingInvoicesTotal: number;
  pendingInvoicesCount: number;
  usagePct: number;
  usageStatus: "unused" | "using" | "exceeded";
}

const resolveAggregateUsageStatus = (
  limitTotal: number,
  limitUsed: number,
): "unused" | "using" | "exceeded" => {
  if (limitUsed > limitTotal && limitTotal > 0) return "exceeded";
  if (limitUsed > 0) return "using";
  return "unused";
};

const buildAggregate = (items: CreditCardItem[]): CreditCardsAggregate =>
  {
    const aggregate = items.reduce<CreditCardsAggregate>(
    (aggregate, card) => ({
      cardsCount: aggregate.cardsCount + 1,
      limitTotal: aggregate.limitTotal + card.usage.total,
      limitUsed: aggregate.limitUsed + card.usage.used,
      availableTotal: aggregate.availableTotal + card.usage.available,
      openPurchasesTotal: aggregate.openPurchasesTotal + card.openPurchasesTotal,
      pendingInvoicesTotal: aggregate.pendingInvoicesTotal + card.pendingInvoicesTotal,
      pendingInvoicesCount: aggregate.pendingInvoicesCount + card.pendingInvoicesCount,
      usagePct: 0,
      usageStatus: "unused",
    }),
    {
      cardsCount: 0,
      limitTotal: 0,
      limitUsed: 0,
      availableTotal: 0,
      openPurchasesTotal: 0,
      pendingInvoicesTotal: 0,
      pendingInvoicesCount: 0,
      usagePct: 0,
      usageStatus: "unused",
    },
  );

    const usagePct =
      aggregate.limitTotal > 0 ? Number(((aggregate.limitUsed / aggregate.limitTotal) * 100).toFixed(2)) : 0;
    return {
      ...aggregate,
      usagePct,
      usageStatus: resolveAggregateUsageStatus(aggregate.limitTotal, aggregate.limitUsed),
    };
  };

const USAGE_STATUS_LABELS = {
  unused: "Sem uso",
  using: "Em uso",
  exceeded: "Excedido",
} as const;

const USAGE_STATUS_CLASSNAMES = {
  unused: "border-cf-border bg-cf-bg-subtle text-cf-text-secondary",
  using: "border-amber-200 bg-amber-50 text-amber-700",
  exceeded: "border-red-200 bg-red-50 text-red-700",
} as const;

const USAGE_PROGRESS_CLASSNAMES = {
  unused: "bg-cf-border",
  using: "bg-amber-500",
  exceeded: "bg-red-500",
} as const;

const formatDMY = (iso: string): string => {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
};

// ─── Invoice PDF panel per card ───────────────────────────────────────────────

type UploadPhase =
  | { phase: "idle" }
  | { phase: "uploading" }
  | { phase: "done"; invoice: CreditCardInvoicePdf }
  | { phase: "error"; message: string };

const InvoicePdfPanel = ({
  card,
  money,
}: {
  card: CreditCardItem;
  money: (v: number) => string;
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>({ phase: "idle" });
  const [recentInvoice, setRecentInvoice] = useState<CreditCardInvoicePdf | null>(null);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  // Load most recent invoice for this card on first open
  useEffect(() => {
    setLoadingInvoices(true);
    creditCardsService
      .listInvoicesPdf(card.id)
      .then((invoices) => {
        setRecentInvoice(invoices[0] ?? null);
      })
      .catch(() => {/* non-blocking */})
      .finally(() => setLoadingInvoices(false));
  }, [card.id]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be re-uploaded
    if (fileInputRef.current) fileInputRef.current.value = "";

    setUploadPhase({ phase: "uploading" });
    try {
      const invoice = await creditCardsService.parseInvoicePdf(card.id, file);
      setUploadPhase({ phase: "done", invoice });
      setRecentInvoice(invoice);
    } catch (err: unknown) {
      const apiMessage =
        err instanceof Object && "response" in err
          ? ((err as { response?: { data?: { message?: string } } }).response?.data?.message ?? null)
          : null;
      setUploadPhase({
        phase: "error",
        message: apiMessage ?? "Não foi possível processar a fatura. Verifique se é um PDF do Itaú.",
      });
    }
  };

  const displayInvoice =
    uploadPhase.phase === "done" ? uploadPhase.invoice : recentInvoice;

  return (
    <div className="mt-2 rounded border border-cf-border bg-cf-bg-page px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-cf-text-secondary">
          Fatura PDF — {card.name}
        </p>
        <label className="cursor-pointer rounded border border-cf-border px-2 py-0.5 text-[10px] text-cf-text-secondary hover:border-brand-1 hover:text-brand-1">
          {uploadPhase.phase === "uploading" ? "Processando..." : "+ Importar fatura"}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            disabled={uploadPhase.phase === "uploading"}
            onChange={handleFileChange}
          />
        </label>
      </div>

      {uploadPhase.phase === "error" ? (
        <p className="mb-2 text-[10px] text-red-600">{uploadPhase.message}</p>
      ) : null}

      {loadingInvoices && !displayInvoice ? (
        <p className="text-[10px] text-cf-text-secondary">Carregando...</p>
      ) : displayInvoice ? (
        <div>
          {displayInvoice.parseConfidence === "low" ? (
            <p className="mb-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-700">
              Período inferido pelo dia de fechamento do cartão — confirme os valores antes de usar.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            <div>
              <p className="text-[10px] text-cf-text-secondary">Total da fatura</p>
              <p className="text-xs font-semibold text-cf-text-primary">
                {money(displayInvoice.totalAmount)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-cf-text-secondary">Vencimento</p>
              <p className="text-xs font-semibold text-cf-text-primary">
                {formatDMY(displayInvoice.dueDate)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-cf-text-secondary">Ciclo</p>
              <p className="text-xs text-cf-text-primary">
                {formatDMY(displayInvoice.periodStart)} – {formatDMY(displayInvoice.periodEnd)}
              </p>
            </div>
            {displayInvoice.financedBalance ? (
              <div>
                <p className="text-[10px] text-cf-text-secondary">Saldo financiado</p>
                <p className="text-xs font-semibold text-amber-700">
                  {money(displayInvoice.financedBalance)}
                </p>
              </div>
            ) : null}
          </div>
          {displayInvoice.cardLast4 ? (
            <p className="mt-1 text-[10px] text-cf-text-secondary">
              Cartão final {displayInvoice.cardLast4}
              {" · "}
              <span
                className={`font-medium ${
                  displayInvoice.parseConfidence === "high" ? "text-emerald-600" : "text-amber-600"
                }`}
              >
                {displayInvoice.parseConfidence === "high" ? "Alta confiança" : "Baixa confiança"}
              </span>
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-[10px] text-cf-text-secondary">
          Nenhuma fatura importada ainda para este cartão.
        </p>
      )}
    </div>
  );
};

// ─── Widget ───────────────────────────────────────────────────────────────────

const CreditCardsSummaryWidget = ({
  onOpenCreditCards,
}: CreditCardsSummaryWidgetProps): JSX.Element | null => {
  const [cards, setCards] = useState<CreditCardItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [expandedInvoiceCardId, setExpandedInvoiceCardId] = useState<number | null>(null);
  const money = useMaskedCurrency();

  useEffect(() => {
    creditCardsService
      .list()
      .then((result) => {
        setCards(result.items);
        setHasError(false);
      })
      .catch(() => {
        setCards([]);
        setHasError(true);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const aggregate = useMemo(() => buildAggregate(cards), [cards]);
  const usageStatusLabel = USAGE_STATUS_LABELS[aggregate.usageStatus];
  const usageStatusClassName = USAGE_STATUS_CLASSNAMES[aggregate.usageStatus];
  const usageProgressClassName = USAGE_PROGRESS_CLASSNAMES[aggregate.usageStatus];
  const usageProgressWidthPct = Math.min(100, aggregate.usagePct);
  const hasCriticalInvoices = aggregate.pendingInvoicesCount > 0;
  const hasExceededLimit = aggregate.usageStatus === "exceeded";
  const cardToneClass = hasExceededLimit
    ? "border-red-300"
    : hasCriticalInvoices
      ? "border-amber-300"
      : "border-cf-border";
  const statusBadgeClass = hasExceededLimit
    ? "border-red-200 bg-red-50 text-red-700"
    : hasCriticalInvoices
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";
  const statusBadgeLabel = hasExceededLimit
    ? "Limite excedido"
    : hasCriticalInvoices
      ? "Atenção"
      : "Estável";

  if (isLoading) {
    return (
      <div className="rounded border border-cf-border bg-cf-surface p-4">
        <p className="text-xs text-cf-text-secondary">Carregando cartões...</p>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="rounded border border-cf-border bg-cf-surface p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-cf-text-primary">Cartões</h3>
          {onOpenCreditCards ? (
            <button
              type="button"
              onClick={onOpenCreditCards}
              className="text-xs text-brand-1 hover:underline"
            >
              Ver cartões →
            </button>
          ) : null}
        </div>
        <p className="text-sm text-cf-text-secondary">
          Não foi possível carregar o resumo de cartões agora.
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded border bg-cf-surface p-4 ${cardToneClass}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-cf-text-primary">Cartões</h3>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass}`}>
              {statusBadgeLabel}
            </span>
          </div>
          <p className="text-xs text-cf-text-secondary">
            {aggregate.cardsCount === 0
              ? "Nenhum cartão cadastrado ainda."
              : aggregate.cardsCount === 1
                ? "1 cartão ativo"
                : `${aggregate.cardsCount} cartões ativos`}
          </p>
        </div>
        {onOpenCreditCards ? (
          <button
            type="button"
            onClick={onOpenCreditCards}
            className="text-xs text-brand-1 hover:underline"
          >
            Ver cartões →
          </button>
        ) : null}
      </div>

      {aggregate.cardsCount === 0 ? (
        <div className="rounded border border-dashed border-cf-border bg-cf-bg-subtle px-3 py-3 text-sm text-cf-text-secondary">
          Cadastre um cartão para acompanhar limite disponível, compras abertas e faturas pendentes.
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs text-cf-text-secondary">
            Priorize faturas pendentes e acompanhe o uso de limite para evitar estouro no fechamento.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className={`rounded border bg-cf-bg-subtle px-3 py-2.5 ${hasCriticalInvoices ? "border-amber-200" : "border-cf-border"}`}>
              <p className="text-xs font-medium uppercase text-cf-text-secondary">Faturas pendentes</p>
              <p
                className={`text-sm font-semibold ${
                  aggregate.pendingInvoicesCount > 0 ? "text-amber-700" : "text-cf-text-primary"
                }`}
              >
                {money(aggregate.pendingInvoicesTotal)}
              </p>
              <p
                className={`text-xs ${
                  aggregate.pendingInvoicesCount > 0 ? "text-amber-700" : "text-cf-text-secondary"
                }`}
              >
                {aggregate.pendingInvoicesCount}{" "}
                {aggregate.pendingInvoicesCount === 1 ? "fatura" : "faturas"}
              </p>
            </div>

            <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase text-cf-text-secondary">Limite em uso</p>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${usageStatusClassName}`}
                >
                  {usageStatusLabel}
                </span>
              </div>
              <p className="mt-1 text-sm font-semibold text-cf-text-primary">
                {money(aggregate.limitUsed)}
              </p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-cf-border/60">
                <div
                  className={`h-full rounded-full ${usageProgressClassName}`}
                  style={{ width: `${usageProgressWidthPct}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-cf-text-secondary">{aggregate.usagePct.toFixed(2)}% do limite total</p>
            </div>

            <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
              <p className="text-xs font-medium uppercase text-cf-text-secondary">Disponível</p>
              <p className="text-sm font-semibold text-cf-text-primary">
                {money(aggregate.availableTotal)}
              </p>
              <p className="text-xs text-cf-text-secondary">Soma dos limites livres</p>
            </div>

            <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
              <p className="text-xs font-medium uppercase text-cf-text-secondary">Compras abertas</p>
              <p className="text-sm font-semibold text-cf-text-primary">
                {money(aggregate.openPurchasesTotal)}
              </p>
              <p className="text-xs text-cf-text-secondary">Ainda não fechadas em fatura</p>
            </div>
          </div>

          {/* Per-card invoice import — one panel per card, collapsible */}
          <div className="mt-3 space-y-1">
            {cards.map((card) => (
              <div key={card.id}>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedInvoiceCardId(
                      expandedInvoiceCardId === card.id ? null : card.id
                    )
                  }
                  className="flex w-full items-center justify-between rounded px-2 py-1 text-[10px] text-cf-text-secondary hover:bg-cf-bg-subtle hover:text-cf-text-primary"
                >
                  <span>{card.name}</span>
                  <span>{expandedInvoiceCardId === card.id ? "▲" : "▼ Fatura PDF"}</span>
                </button>
                {expandedInvoiceCardId === card.id ? (
                  <InvoicePdfPanel card={card} money={money} />
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default CreditCardsSummaryWidget;
