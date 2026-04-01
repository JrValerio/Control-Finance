import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import BillModal from "../components/BillModal";
import { categoriesService } from "../services/categories.service";
import {
  billsService,
  type Bill,
  type BillsSummary,
  type BillStatusFilter,
} from "../services/bills.service";
import { formatCurrency } from "../utils/formatCurrency";
import { getApiErrorMessage } from "../utils/apiError";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 20;
const STATUS_FILTER_VALUES: Array<Exclude<BillStatusFilter, undefined>> = [
  "pending",
  "paid",
  "overdue",
  "due_soon",
  "future",
];

interface CategoryOption {
  id: number;
  name: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatDueDate = (dateStr: string): string => {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
};

const formatReferenceMonth = (value: string | null): string => {
  if (!value) return "";
  const [year, month] = value.split("-");
  if (!year || !month) return value;
  return `${month}/${year}`;
};

const isCreditCardInvoice = (bill: Bill) => bill.billType === "credit_card_invoice";

const parseStatusFilter = (value: string | null): BillStatusFilter => {
  if (!value) return undefined;
  return STATUS_FILTER_VALUES.includes(value as Exclude<BillStatusFilter, undefined>)
    ? (value as Exclude<BillStatusFilter, undefined>)
    : undefined;
};

// ─── Status badge ─────────────────────────────────────────────────────────────

const BillStatusBadge = ({ bill }: { bill: Bill }): JSX.Element => {
  if (bill.operationalBucket === "paid") {
    return (
      <span className="whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold bg-green-100 text-green-700">
        Paga
      </span>
    );
  }
  if (bill.operationalBucket === "overdue") {
    return (
      <span className="whitespace-nowrap rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
        Vencida
      </span>
    );
  }
  if (bill.operationalBucket === "due_soon") {
    return (
      <span className="whitespace-nowrap rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
        A vencer
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
      Futura
    </span>
  );
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface BillsPageProps {
  onBack?: () => void;
  onLogout?: () => void;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const BillsPage = ({
  onBack = undefined,
}: BillsPageProps): JSX.Element => {
  const location = useLocation();
  const initialStatusFilter = parseStatusFilter(new URLSearchParams(location.search).get("status"));
  const [statusFilter, setStatusFilter] = useState<BillStatusFilter>(() => initialStatusFilter);
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<Bill[]>([]);
  const [paginationTotal, setPaginationTotal] = useState(0);
  const [summary, setSummary] = useState<BillsSummary | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);

  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Data loading ───────────────────────────────────────────────────────────

  const loadSummary = useCallback(async () => {
    setIsLoadingSummary(true);
    try {
      const data = await billsService.getSummary();
      setSummary(data);
    } catch (error) {
      setSummary(null);
      setPageError(getApiErrorMessage(error, "Não foi possível carregar o resumo."));
    } finally {
      setIsLoadingSummary(false);
    }
  }, []);

  const loadList = useCallback(
    async (currentOffset: number, currentFilter: BillStatusFilter) => {
      setIsLoadingList(true);
      try {
        const result = await billsService.list({
          status: currentFilter,
          limit: DEFAULT_LIMIT,
          offset: currentOffset,
        });
        setItems(result.items);
        setPaginationTotal(result.pagination.total);
      } catch (error) {
        setItems([]);
        setPaginationTotal(0);
        setPageError(getApiErrorMessage(error, "Não foi possível carregar as pendências."));
      } finally {
        setIsLoadingList(false);
      }
    },
    [],
  );

  const loadCategories = useCallback(async () => {
    try {
      const data = await categoriesService.listCategories(false);
      setCategories(Array.isArray(data) ? data : []);
    } catch {
      setCategories([]);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
    void loadList(0, initialStatusFilter);
    void loadCategories();
  }, [loadSummary, loadList, loadCategories, initialStatusFilter]);

  // ─── Success message helper ─────────────────────────────────────────────────

  const showSuccess = (message: string) => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    setSuccessMessage(message);
    successTimerRef.current = setTimeout(() => setSuccessMessage(""), 4000);
  };

  // ─── Filters ────────────────────────────────────────────────────────────────

  const handleFilterChange = (filter: BillStatusFilter) => {
    setStatusFilter(filter);
    setOffset(0);
    setPageError("");
    void loadList(0, filter);
  };

  // ─── Pagination ─────────────────────────────────────────────────────────────

  const hasPreviousPage = offset > 0;
  const hasNextPage = offset + DEFAULT_LIMIT < paginationTotal;
  const rangeStart = items.length > 0 ? offset + 1 : 0;
  const rangeEnd = offset + items.length;

  const handlePreviousPage = () => {
    if (!hasPreviousPage || isLoadingList) return;
    const newOffset = Math.max(offset - DEFAULT_LIMIT, 0);
    setOffset(newOffset);
    void loadList(newOffset, statusFilter);
  };

  const handleNextPage = () => {
    if (!hasNextPage || isLoadingList) return;
    const newOffset = offset + DEFAULT_LIMIT;
    setOffset(newOffset);
    void loadList(newOffset, statusFilter);
  };

  // ─── Bill modal ─────────────────────────────────────────────────────────────

  const openCreateModal = () => {
    setEditingBill(null);
    setIsBillModalOpen(true);
  };

  const openEditModal = (bill: Bill) => {
    setEditingBill(bill);
    setIsBillModalOpen(true);
  };

  const closeBillModal = () => {
    setIsBillModalOpen(false);
    setEditingBill(null);
  };

  const handleBillSaved = () => {
    closeBillModal();
    showSuccess(editingBill ? "Pendência atualizada." : "Pendência criada.");
    void loadSummary();
    void loadList(offset, statusFilter);
  };

  // ─── Mark paid ──────────────────────────────────────────────────────────────

  const handleMarkPaid = async (bill: Bill) => {
    setPageError("");
    try {
      const result = await billsService.markPaid(bill.id);
      showSuccess(
        `Marcada como paga. Transação de saída: ${formatCurrency(result.transaction.value)} em ${formatDueDate(result.transaction.date)}.`,
      );
      void loadSummary();
      void loadList(offset, statusFilter);
    } catch (error) {
      setPageError(getApiErrorMessage(error, "Não foi possível marcar como paga."));
    }
  };

  // ─── Delete ─────────────────────────────────────────────────────────────────

  const handleDeleteRequest = (id: number) => {
    setConfirmingDeleteId(id);
  };

  const handleDeleteCancel = () => {
    setConfirmingDeleteId(null);
  };

  const handleDeleteConfirm = async (id: number) => {
    setConfirmingDeleteId(null);
    setPageError("");
    try {
      await billsService.remove(id);
      showSuccess("Pendência excluída.");
      void loadSummary();
      void loadList(offset, statusFilter);
    } catch (error) {
      setPageError(getApiErrorMessage(error, "Não foi possível excluir a pendência."));
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  const filterOptions: Array<{ label: string; value: BillStatusFilter }> = [
    { label: "Todos", value: undefined },
    { label: "Pendentes", value: "pending" },
    { label: "Vencidas", value: "overdue" },
    { label: "A vencer", value: "due_soon" },
    { label: "Futuras", value: "future" },
    { label: "Pagas", value: "paid" },
  ];

  return (
    <div className="min-h-screen bg-cf-bg-page px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
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
              <h1 className="text-xl font-bold text-cf-text-primary">Pendências</h1>
              <p className="text-sm text-cf-text-secondary">
                Acompanhe contas em aberto, vencidas e faturas sem perder prazos.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="rounded bg-brand-1 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-2"
          >
            + Nova pendência
          </button>
        </div>

        {/* Summary Cards */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
            <p className="text-xs font-medium uppercase text-cf-text-secondary">Pendentes</p>
            {isLoadingSummary ? (
              <p className="mt-1 text-sm text-cf-text-secondary">Carregando...</p>
            ) : (
              <>
                <p className="mt-1 text-lg font-bold text-cf-text-primary">
                  {formatCurrency(summary?.pendingTotal ?? 0)}
                </p>
                <p className="mt-0.5 text-xs text-cf-text-secondary">
                  {summary?.pendingCount ?? 0} {(summary?.pendingCount ?? 0) === 1 ? "conta em aberto" : "contas em aberto"}
                </p>
              </>
            )}
          </div>
          <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2.5">
            <p className="text-xs font-medium uppercase text-cf-text-secondary">Vencidas</p>
            {isLoadingSummary ? (
              <p className="mt-1 text-sm text-cf-text-secondary">Carregando...</p>
            ) : (
              <>
                <p
                  className={`mt-1 text-lg font-bold ${
                    (summary?.overdueTotal ?? 0) > 0 ? "text-red-600" : "text-cf-text-primary"
                  }`}
                >
                  {formatCurrency(summary?.overdueTotal ?? 0)}
                </p>
                <p className="mt-0.5 text-xs text-cf-text-secondary">
                  {summary?.overdueCount ?? 0} {(summary?.overdueCount ?? 0) === 1 ? "conta em atraso" : "contas em atraso"}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Feedback messages */}
        {pageError ? (
          <div
            className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            role="alert"
          >
            {pageError}
          </div>
        ) : null}
        {!pageError && successMessage ? (
          <div
            className="mb-4 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
            role="status"
            aria-live="polite"
          >
            {successMessage}
          </div>
        ) : null}

        {/* Status filter */}
        <div className="mb-4 flex flex-wrap gap-2">
          {filterOptions.map((opt) => {
            const isActive = statusFilter === opt.value;
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => handleFilterChange(opt.value)}
                className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${
                  isActive
                    ? "bg-brand-1 text-white"
                    : "border border-cf-border text-cf-text-secondary hover:bg-cf-bg-subtle"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* List */}
        <div className="space-y-2">
          {isLoadingList ? (
            <p className="py-4 text-center text-sm text-cf-text-secondary">
              Carregando pendências...
            </p>
          ) : items.length === 0 ? (
            <p className="py-4 text-center text-sm text-cf-text-secondary">
              Nenhuma conta encontrada para este filtro.
            </p>
          ) : (
            items.map((bill) => (
              <div
                key={bill.id}
                className="flex w-full flex-col gap-2 rounded border border-cf-border bg-cf-surface p-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                {/* Left: info */}
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="break-words text-sm font-medium text-cf-text-primary">
                    {bill.title}
                  </span>
                  {bill.provider ? (
                    <span className="text-xs text-cf-text-secondary">{bill.provider}</span>
                  ) : null}
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-cf-text-primary">
                      {formatCurrency(bill.amount)}
                    </span>
                    <span className="text-xs text-cf-text-secondary">
                      Vence {formatDueDate(bill.dueDate)}
                    </span>
                    {bill.referenceMonth ? (
                      <span className="text-xs text-cf-text-secondary">
                        Referência {formatReferenceMonth(bill.referenceMonth)}
                      </span>
                    ) : null}
                    {isCreditCardInvoice(bill) ? (
                      <span className="rounded border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700">
                        Fatura do cartão
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Right: badge + actions */}
                <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                  <BillStatusBadge bill={bill} />

                  {bill.status === "pending" ? (
                    <button
                      type="button"
                      onClick={() => void handleMarkPaid(bill)}
                      className="whitespace-nowrap rounded border border-green-300 px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-50"
                    >
                      Registrar pagamento
                    </button>
                  ) : null}

                  {bill.status === "pending" && !isCreditCardInvoice(bill) ? (
                    <button
                      type="button"
                      onClick={() => openEditModal(bill)}
                      className="whitespace-nowrap rounded border border-cf-border px-2 py-1 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                    >
                      Editar
                    </button>
                  ) : null}

                  {!isCreditCardInvoice(bill) && confirmingDeleteId === bill.id ? (
                    <span className="flex items-center gap-1">
                      <span className="text-xs text-cf-text-secondary">Confirmar?</span>
                      <button
                        type="button"
                        onClick={() => void handleDeleteConfirm(bill.id)}
                        className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        Sim
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteCancel}
                        className="rounded border border-cf-border px-2 py-1 text-xs font-semibold text-cf-text-secondary hover:bg-cf-bg-subtle"
                      >
                        Cancelar
                      </button>
                    </span>
                  ) : !isCreditCardInvoice(bill) ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteRequest(bill.id)}
                      className="whitespace-nowrap rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      Excluir
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {!isLoadingList && items.length > 0 ? (
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-xs text-cf-text-secondary">
              Mostrando {rangeStart} a {rangeEnd} de {paginationTotal}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handlePreviousPage}
                disabled={!hasPreviousPage || isLoadingList}
                className="rounded border border-cf-border bg-cf-surface px-3 py-1.5 text-sm font-semibold text-cf-text-primary hover:bg-cf-bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={handleNextPage}
                disabled={!hasNextPage || isLoadingList}
                className="rounded border border-cf-border bg-cf-surface px-3 py-1.5 text-sm font-semibold text-cf-text-primary hover:bg-cf-bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
              >
                Próxima
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Bill Modal */}
      <BillModal
        isOpen={isBillModalOpen}
        onClose={closeBillModal}
        onSaved={handleBillSaved}
        initialBill={editingBill}
        categories={categories}
      />
    </div>
  );
};

export default BillsPage;
