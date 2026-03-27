import { useCallback, useEffect, useState } from "react";
import { parseCurrencyInput, getTodayISODate, isValidISODate } from "./DatabaseUtils";
import { billsService, type Bill, type CreateBillPayload } from "../services/bills.service";

interface CategoryOption {
  id: number;
  name: string;
}

export interface BillPrefill {
  title?: string;
  amount?: number;
  dueDate?: string;
  provider?: string;
  referenceMonth?: string;
  billType?: string;
  sourceImportSessionId?: string;
}

interface BillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (bill: Bill) => void;
  initialBill?: Bill | null;
  prefill?: BillPrefill | null;
  categories: CategoryOption[];
}

const formatAmountForInput = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return "";
  return value.toFixed(2).replace(".", ",");
};

const addMonthsClamped = (isoDate: string, n: number): string => {
  const [y, m, d] = isoDate.split("-").map(Number);
  const targetYear = y + Math.floor((m - 1 + n) / 12);
  const targetMonth = ((m - 1 + n) % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const clampedDay = Math.min(d, lastDay);
  return [
    targetYear,
    String(targetMonth).padStart(2, "0"),
    String(clampedDay).padStart(2, "0"),
  ].join("-");
};

const BillModal = ({
  isOpen,
  onClose,
  onSaved,
  initialBill = null,
  prefill = null,
  categories = [],
}: BillModalProps): JSX.Element | null => {
  const isEditing = Boolean(initialBill);

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(getTodayISODate());
  const [categoryId, setCategoryId] = useState("");
  const [provider, setProvider] = useState("");
  const [referenceMonth, setReferenceMonth] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showInstallments, setShowInstallments] = useState(false);
  const [installmentCount, setInstallmentCount] = useState("2");

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen) return;
    if (initialBill) {
      setTitle(initialBill.title);
      setAmount(formatAmountForInput(initialBill.amount));
      setDueDate(initialBill.dueDate || getTodayISODate());
      setCategoryId(initialBill.categoryId ? String(initialBill.categoryId) : "");
      setProvider(initialBill.provider || "");
      setReferenceMonth(initialBill.referenceMonth || "");
      setNotes(initialBill.notes || "");
    } else if (prefill) {
      setTitle(prefill.title || "");
      setAmount(prefill.amount != null ? formatAmountForInput(prefill.amount) : "");
      setDueDate(prefill.dueDate || getTodayISODate());
      setCategoryId("");
      setProvider(prefill.provider || "");
      setReferenceMonth(prefill.referenceMonth || "");
      setNotes("");
    } else {
      setTitle("");
      setAmount("");
      setDueDate(getTodayISODate());
      setCategoryId("");
      setProvider("");
      setReferenceMonth("");
      setNotes("");
    }
    setErrorMessage("");
    setIsSaving(false);
    setShowInstallments(false);
    setInstallmentCount("2");
  }, [isOpen, initialBill, prefill]);

  // Escape key listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setErrorMessage("");

      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        setErrorMessage("Título é obrigatório.");
        return;
      }

      const parsedAmount = parseCurrencyInput(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        setErrorMessage("Digite um valor válido maior que zero.");
        return;
      }

      if (!isValidISODate(dueDate)) {
        setErrorMessage("Data de vencimento inválida.");
        return;
      }

      setIsSaving(true);
      try {
        if (showInstallments && !isEditing) {
          const n = Math.max(2, Math.min(24, parseInt(installmentCount, 10) || 2));
          const bills: CreateBillPayload[] = Array.from({ length: n }, (_, i) => {
            const installmentDueDate = addMonthsClamped(dueDate, i);
            return {
              title: `${trimmedTitle} (${i + 1}/${n})`,
              amount: parsedAmount,
              dueDate: installmentDueDate,
              categoryId: categoryId ? Number(categoryId) : null,
              provider: provider.trim() || null,
              referenceMonth: installmentDueDate.slice(0, 7),
              notes: notes.trim() || null,
            };
          });
          const createdBills = await billsService.createBatch(bills);
          onSaved(createdBills[0]);
        } else {
          const payload: CreateBillPayload = {
            title: trimmedTitle,
            amount: parsedAmount,
            dueDate,
            categoryId: categoryId ? Number(categoryId) : null,
            provider: provider.trim() || null,
            referenceMonth: referenceMonth.trim() || null,
            notes: notes.trim() || null,
            ...(!isEditing && prefill ? {
              billType: prefill.billType ?? null,
              sourceImportSessionId: prefill.sourceImportSessionId ?? null,
            } : {}),
          };
          const savedBill = isEditing && initialBill
            ? await billsService.update(initialBill.id, payload)
            : await billsService.create(payload);
          onSaved(savedBill);
        }
      } catch (error) {
        const err = error as { response?: { data?: { message?: string } }; message?: string };
        setErrorMessage(
          err?.response?.data?.message || err?.message || "Não foi possível salvar a pendência.",
        );
      } finally {
        setIsSaving(false);
      }
    },
    [title, amount, dueDate, categoryId, provider, referenceMonth, notes, isEditing, initialBill, prefill, onSaved, showInstallments, installmentCount],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex min-h-screen items-start justify-center overflow-y-auto bg-black/50 p-2 sm:p-6 sm:items-center"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-md flex-col overflow-hidden rounded-lg bg-cf-surface shadow-xl sm:max-h-[calc(100dvh-3rem)]">
        {/* Header */}
        <div className="border-b border-cf-border px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-cf-text-primary">
              {isEditing ? "Editar pendência" : "Nova pendência"}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-cf-text-secondary transition-colors hover:text-cf-text-primary"
              aria-label="Fechar modal"
            >
              X
            </button>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bill-title" className="text-sm font-medium text-cf-text-primary">
              Titulo <span className="text-red-500">*</span>
            </label>
            <input
              id="bill-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Conta de Agua"
              className="rounded border border-cf-border-input px-3 py-2 text-sm text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-1 bg-cf-surface"
              disabled={isSaving}
              maxLength={200}
            />
          </div>

          {/* Amount */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bill-amount" className="text-sm font-medium text-cf-text-primary">
              Valor <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center rounded border border-cf-border-input px-3 py-2">
              <span className="mr-1 text-sm font-medium text-cf-text-secondary">R$</span>
              <input
                id="bill-amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="flex-1 bg-transparent text-sm text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none"
                disabled={isSaving}
              />
            </div>
          </div>

          {/* Due Date */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bill-due-date" className="text-sm font-medium text-cf-text-primary">
              Vencimento <span className="text-red-500">*</span>
            </label>
            <input
              id="bill-due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded border border-cf-border-input px-3 py-2 text-sm text-cf-text-primary focus:outline-none focus:ring-1 focus:ring-brand-1 bg-cf-surface"
              disabled={isSaving}
            />
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bill-category" className="text-sm font-medium text-cf-text-primary">
              Categoria <span className="text-xs font-normal text-cf-text-secondary">(opcional)</span>
            </label>
            <select
              id="bill-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="rounded border border-cf-border-input px-3 py-2 text-sm text-cf-text-primary bg-cf-surface focus:outline-none focus:ring-1 focus:ring-brand-1"
              disabled={isSaving}
            >
              <option value="">Sem categoria</option>
              {categories.map((cat) => (
                <option key={cat.id} value={String(cat.id)}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Provider */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bill-provider" className="text-sm font-medium text-cf-text-primary">
              Fornecedor <span className="text-xs font-normal text-cf-text-secondary">(opcional)</span>
            </label>
            <input
              id="bill-provider"
              type="text"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="Ex: SABESP, Nubank"
              className="rounded border border-cf-border-input px-3 py-2 text-sm text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-1 bg-cf-surface"
              disabled={isSaving}
            />
          </div>

          {/* Reference Month */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bill-ref-month" className="text-sm font-medium text-cf-text-primary">
              Mês de referência <span className="text-xs font-normal text-cf-text-secondary">(opcional, YYYY-MM)</span>
            </label>
            <input
              id="bill-ref-month"
              type="month"
              value={referenceMonth}
              onChange={(e) => setReferenceMonth(e.target.value)}
              className="rounded border border-cf-border-input px-3 py-2 text-sm text-cf-text-primary focus:outline-none focus:ring-1 focus:ring-brand-1 bg-cf-surface"
              disabled={isSaving}
            />
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bill-notes" className="text-sm font-medium text-cf-text-primary">
              Notas <span className="text-xs font-normal text-cf-text-secondary">(opcional)</span>
            </label>
            <textarea
              id="bill-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observacoes..."
              rows={2}
              className="rounded border border-cf-border-input px-3 py-2 text-sm text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-1 bg-cf-surface resize-none"
              disabled={isSaving}
            />
          </div>

          {/* Installments */}
          {!isEditing ? (
            <div className="border-t border-cf-border pt-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-cf-text-primary">
                <input
                  type="checkbox"
                  checked={showInstallments}
                  onChange={(e) => setShowInstallments(e.target.checked)}
                  disabled={isSaving}
                  className="rounded"
                />
                Parcelar
              </label>

              {showInstallments ? (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min={2}
                    max={24}
                    value={installmentCount}
                    onChange={(e) => setInstallmentCount(e.target.value)}
                    disabled={isSaving}
                    aria-label="Numero de parcelas"
                    className="w-16 rounded border border-cf-border-input px-2 py-1.5 text-sm text-cf-text-primary focus:outline-none focus:ring-1 focus:ring-brand-1 bg-cf-surface"
                  />
                  <span className="text-sm text-cf-text-secondary">
                    parcelas mensais a partir de {dueDate || "—"}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Error */}
          {errorMessage ? (
            <div
              className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              role="alert"
            >
              {errorMessage}
            </div>
          ) : null}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded border border-cf-border px-4 py-2 text-sm font-semibold text-cf-text-primary hover:bg-cf-bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded bg-brand-1 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving
                ? "Gerando..."
                : showInstallments && !isEditing
                ? `Gerar ${parseInt(installmentCount, 10) || 2} parcelas`
                : "Salvar"}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
};

export default BillModal;
