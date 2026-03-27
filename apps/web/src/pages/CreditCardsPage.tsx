import { useCallback, useEffect, useRef, useState } from "react";
import CreditCardModal from "../components/CreditCardModal";
import CreditCardPurchaseModal from "../components/CreditCardPurchaseModal";
import { billsService } from "../services/bills.service";
import {
  creditCardsService,
  type CreditCardItem,
} from "../services/credit-cards.service";
import { formatCurrency } from "../utils/formatCurrency";
import { getApiErrorMessage } from "../utils/apiError";

interface CreditCardsPageProps {
  onBack?: () => void;
}

const formatDate = (value: string) => {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
};

const formatReferenceMonth = (value: string | null) => {
  if (!value) return "—";
  const [year, month] = value.split("-");
  if (!year || !month) return value;
  return `${month}/${year}`;
};

const USAGE_STATUS_LABELS = {
  unused: "Sem compras no ciclo",
  using: "Com compras no ciclo",
  exceeded: "Acima do limite",
} as const;

const USAGE_STATUS_BADGE_CLASSNAMES = {
  unused: "border-cf-border bg-cf-bg-subtle text-cf-text-secondary",
  using: "border-amber-200 bg-amber-50 text-amber-700",
  exceeded: "border-red-200 bg-red-50 text-red-700",
} as const;

const INVOICE_STATUS_BADGE_CLASSNAMES = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  paid: "border-green-200 bg-green-50 text-green-700",
  overdue: "border-red-200 bg-red-50 text-red-700",
} as const;

const getInvoiceBadge = (invoice: CreditCardItem["invoices"][number]) => {
  if (invoice.status === "paid") {
    return {
      className: INVOICE_STATUS_BADGE_CLASSNAMES.paid,
      label: "Paga",
    };
  }

  if (invoice.isOverdue) {
    return {
      className: INVOICE_STATUS_BADGE_CLASSNAMES.overdue,
      label: "Atrasada",
    };
  }

  return {
    className: INVOICE_STATUS_BADGE_CLASSNAMES.pending,
    label: "Pendente",
  };
};

const CreditCardsPage = ({
  onBack = undefined,
}: CreditCardsPageProps): JSX.Element => {
  const [cards, setCards] = useState<CreditCardItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<CreditCardItem | null>(null);
  const [purchaseCard, setPurchaseCard] = useState<CreditCardItem | null>(null);
  const [pendingDeletePurchaseId, setPendingDeletePurchaseId] = useState<number | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadCards = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await creditCardsService.list();
      setCards(result.items);
      setPageError("");
    } catch (error) {
      setCards([]);
      setPageError(getApiErrorMessage(error, "Não foi possível carregar os cartões."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  const showSuccess = (message: string) => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    setSuccessMessage(message);
    successTimerRef.current = setTimeout(() => setSuccessMessage(""), 4000);
  };

  const handleSaveCard = async (payload: {
    name: string;
    limitTotal: number;
    closingDay: number;
    dueDay: number;
  }) => {
    try {
      if (editingCard) {
        await creditCardsService.update(editingCard.id, payload);
        showSuccess("Cartão atualizado.");
      } else {
        await creditCardsService.create(payload);
        showSuccess("Cartão criado.");
      }
      setIsCardModalOpen(false);
      setEditingCard(null);
      await loadCards();
    } catch (error) {
      setPageError(getApiErrorMessage(error, "Não foi possível salvar o cartão."));
      throw error;
    }
  };

  const handleSavePurchase = async (payload: {
    title: string;
    amount: number;
    purchaseDate: string;
    notes: string | null;
    installmentCount?: number;
  }) => {
    if (!purchaseCard) return;

    try {
      if ((payload.installmentCount ?? 1) > 1) {
        const result = await creditCardsService.createInstallments(purchaseCard.id, {
          ...payload,
          installmentCount: payload.installmentCount ?? 2,
        });
        showSuccess(
          `Compra parcelada adicionada em ${result.installmentCount}x, total de ${formatCurrency(result.totalAmount)}.`,
        );
      } else {
        await creditCardsService.createPurchase(purchaseCard.id, payload);
        showSuccess("Compra adicionada ao cartão.");
      }
      setPurchaseCard(null);
      await loadCards();
    } catch (error) {
      setPageError(getApiErrorMessage(error, "Não foi possível salvar a compra."));
      throw error;
    }
  };

  const handleCloseInvoice = async (card: CreditCardItem) => {
    setPageError("");
    try {
      const result = await creditCardsService.closeInvoice(card.id);
      showSuccess(
        `Fatura fechada em ${formatCurrency(result.total)} com ${result.purchasesCount} compra${result.purchasesCount === 1 ? "" : "s"} lançada${result.purchasesCount === 1 ? "" : "s"}.`,
      );
      await loadCards();
    } catch (error) {
      setPageError(getApiErrorMessage(error, "Não foi possível fechar a fatura."));
    }
  };

  const handlePayInvoice = async (invoiceId: number) => {
    setPageError("");
    try {
      await billsService.markPaid(invoiceId);
      showSuccess("Pagamento da fatura registrado na sua conta.");
      await loadCards();
    } catch (error) {
      setPageError(getApiErrorMessage(error, "Não foi possível pagar a fatura."));
    }
  };

  const handleReopenInvoice = async (invoiceId: number) => {
    setPageError("");
    try {
      const result = await creditCardsService.reopenInvoice(invoiceId);
      showSuccess(
        `Fatura reaberta. ${result.reopenedPurchasesCount} compra${result.reopenedPurchasesCount === 1 ? "" : "s"} voltou${result.reopenedPurchasesCount === 1 ? "" : "aram"} para compras em aberto.`,
      );
      await loadCards();
    } catch (error) {
      setPageError(getApiErrorMessage(error, "Não foi possível reabrir a fatura."));
    }
  };

  const handleDeletePurchase = async (purchaseId: number) => {
    setPendingDeletePurchaseId(null);
    setPageError("");
    try {
      await creditCardsService.removePurchase(purchaseId);
      showSuccess("Compra removida do cartão.");
      await loadCards();
    } catch (error) {
      setPageError(getApiErrorMessage(error, "Não foi possível excluir a compra."));
    }
  };

  return (
    <div className="min-h-screen bg-cf-bg-page px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="text-sm font-semibold text-cf-text-secondary hover:text-cf-text-primary"
              >
                ← Voltar
              </button>
            ) : null}
            <div>
              <h1 className="text-xl font-bold text-cf-text-primary">Cartões</h1>
              <p className="text-sm text-cf-text-secondary">
                Acompanhe limite, compras e faturas sem misturar uso do cartão com saída imediata da conta.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingCard(null);
              setIsCardModalOpen(true);
            }}
            className="rounded bg-brand-1 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-2"
          >
            + Novo cartão
          </button>
        </div>

        {pageError ? (
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {pageError}
          </div>
        ) : null}
        {!pageError && successMessage ? (
          <div className="mb-4 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700" role="status">
            {successMessage}
          </div>
        ) : null}

        {isLoading ? (
          <p className="py-6 text-center text-sm text-cf-text-secondary">Carregando cartões...</p>
        ) : cards.length === 0 ? (
          <div className="rounded border border-dashed border-cf-border bg-cf-surface p-6 text-center">
            <p className="text-sm text-cf-text-secondary">
              Nenhum cartão cadastrado ainda. Crie o primeiro para acompanhar limite, compras do ciclo e faturas para pagar.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {cards.map((card) => {
              const pendingInvoice =
                card.invoices.find((invoice) => invoice.status === "pending") ?? null;
              const usageStatusLabel = USAGE_STATUS_LABELS[card.usage.status];
              const usageStatusClassName = USAGE_STATUS_BADGE_CLASSNAMES[card.usage.status];

              return (
                <section key={card.id} className="rounded border border-cf-border bg-cf-surface p-4">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-cf-text-primary">{card.name}</h2>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${usageStatusClassName}`}
                      >
                        {usageStatusLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-cf-text-secondary">
                      Fecha no dia {card.closingDay} e vence no dia {card.dueDay}
                    </p>
                    <p className="mt-1 text-xs text-cf-text-secondary">
                      {card.openPurchasesCount} compra{card.openPurchasesCount === 1 ? "" : "s"} em aberto
                      {card.openPurchasesCount === 1 ? "" : "s"} · {card.pendingInvoicesCount} fatura
                      {card.pendingInvoicesCount === 1 ? "" : "s"} pendente{card.pendingInvoicesCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setPurchaseCard(card)}
                      className="rounded border border-cf-border px-3 py-1.5 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                    >
                      Nova compra
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCloseInvoice(card)}
                      disabled={card.openPurchasesCount === 0}
                      className="rounded border border-brand-1 px-3 py-1.5 text-xs font-semibold text-brand-1 hover:bg-brand-1/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Fechar fatura
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCard(card);
                        setIsCardModalOpen(true);
                      }}
                      className="rounded border border-cf-border px-3 py-1.5 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                    >
                      Editar cartão
                    </button>
                  </div>
                </div>

                <div className="mb-4 grid gap-3 sm:grid-cols-4">
                  <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
                    <p className="text-xs font-medium uppercase text-cf-text-secondary">Limite total</p>
                    <p className="mt-1 text-lg font-bold text-cf-text-primary">{formatCurrency(card.usage.total)}</p>
                    <p className="text-xs text-cf-text-secondary">Capacidade total do cartão</p>
                  </div>
                  <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium uppercase text-cf-text-secondary">Limite usado</p>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${usageStatusClassName}`}
                      >
                        {usageStatusLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-lg font-bold text-cf-text-primary">{formatCurrency(card.usage.used)}</p>
                    <p className="text-xs text-cf-text-secondary">{card.usage.usagePct.toFixed(2)}% do limite</p>
                  </div>
                  <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
                    <p className="text-xs font-medium uppercase text-cf-text-secondary">Limite disponível</p>
                    <p className="mt-1 text-lg font-bold text-cf-text-primary">{formatCurrency(card.usage.available)}</p>
                    {card.usage.exceededBy > 0 ? (
                      <p className="text-xs text-red-600">Acima do limite em {formatCurrency(card.usage.exceededBy)}</p>
                    ) : (
                      <p className="text-xs text-cf-text-secondary">Valor ainda livre para novas compras</p>
                    )}
                  </div>
                  <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
                    <p className="text-xs font-medium uppercase text-cf-text-secondary">Fatura do ciclo</p>
                    <p className="mt-1 text-lg font-bold text-cf-text-primary">
                      {pendingInvoice
                        ? formatCurrency(pendingInvoice.amount)
                        : card.openPurchasesCount > 0
                          ? formatCurrency(card.openPurchasesTotal)
                          : formatCurrency(0)}
                    </p>
                    {pendingInvoice ? (
                      <p className="text-xs text-cf-text-secondary">
                        {pendingInvoice.isOverdue
                          ? `Atrasada desde ${formatDate(pendingInvoice.dueDate)}`
                          : `Vence em ${formatDate(pendingInvoice.dueDate)}`}
                      </p>
                    ) : card.openPurchasesCount > 0 ? (
                      <p className="text-xs text-cf-text-secondary">Compras deste ciclo aguardando fechamento</p>
                    ) : (
                      <p className="text-xs text-cf-text-secondary">Sem fatura pendente no momento</p>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-cf-text-primary">Faturas</h3>
                      <span className="text-xs text-cf-text-secondary">
                        {card.invoices.length} no histórico
                      </span>
                    </div>
                    {card.invoices.length === 0 ? (
                      <div className="rounded border border-dashed border-cf-border px-3 py-4 text-sm text-cf-text-secondary">
                        Nenhuma fatura fechada por enquanto.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {card.invoices.map((invoice) => {
                          const invoiceBadge = getInvoiceBadge(invoice);

                          return (
                            <div key={invoice.id} className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-3">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-medium text-cf-text-primary">{invoice.title}</p>
                                    <span
                                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${invoiceBadge.className}`}
                                    >
                                      {invoiceBadge.label}
                                    </span>
                                  </div>
                                  <p className="text-xs text-cf-text-secondary">
                                    Referência {formatReferenceMonth(invoice.referenceMonth)} · vence {formatDate(invoice.dueDate)}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-cf-text-primary">
                                    {formatCurrency(invoice.amount)}
                                  </span>
                                  {invoice.status === "pending" ? (
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => void handleReopenInvoice(invoice.id)}
                                        className="rounded border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                                      >
                                        Reabrir
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void handlePayInvoice(invoice.id)}
                                        className="rounded border border-green-300 px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-50"
                                      >
                                        Registrar pagamento
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="rounded border border-green-200 bg-green-50 px-2 py-1 text-xs font-semibold text-green-700">
                                      Paga
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-cf-text-primary">Compras abertas</h3>
                      <span className="text-xs text-cf-text-secondary">
                        {card.openPurchasesCount} compra{card.openPurchasesCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    {card.openPurchases.length === 0 ? (
                      <div className="rounded border border-dashed border-cf-border px-3 py-4 text-sm text-cf-text-secondary">
                        Nenhuma compra em aberto neste cartão.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {card.openPurchases.map((purchase) => (
                          <div key={purchase.id} className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-sm font-medium text-cf-text-primary">{purchase.title}</p>
                                <p className="text-xs text-cf-text-secondary">
                                  {formatDate(purchase.purchaseDate)}
                                  {purchase.installmentCount && purchase.installmentNumber
                                    ? ` · Parcela ${purchase.installmentNumber}/${purchase.installmentCount}`
                                    : ""}
                                  {purchase.notes ? ` · ${purchase.notes}` : ""}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-cf-text-primary">
                                  {formatCurrency(purchase.amount)}
                                </span>
                                {pendingDeletePurchaseId === purchase.id ? (
                                  <span className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => void handleDeletePurchase(purchase.id)}
                                      className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                                    >
                                      Confirmar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setPendingDeletePurchaseId(null)}
                                      className="rounded border border-cf-border px-2 py-1 text-xs font-semibold text-cf-text-secondary hover:bg-cf-bg-subtle"
                                    >
                                      Cancelar
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setPendingDeletePurchaseId(purchase.id)}
                                    className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                                  >
                                    Excluir
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <CreditCardModal
        isOpen={isCardModalOpen}
        onClose={() => {
          setIsCardModalOpen(false);
          setEditingCard(null);
        }}
        onSave={handleSaveCard}
        initialCard={editingCard}
      />

      <CreditCardPurchaseModal
        isOpen={purchaseCard !== null}
        cardName={purchaseCard?.name || ""}
        onClose={() => setPurchaseCard(null)}
        onSave={handleSavePurchase}
      />
    </div>
  );
};

export default CreditCardsPage;
