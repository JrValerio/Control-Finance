import { useCallback, useEffect, useState } from "react";
import { parseCurrencyInput, getTodayISODate, isValidISODate } from "./DatabaseUtils";
import { billsService, type Bill, type CreateBillPayload } from "../services/bills.service";

interface CategoryOption {
  id: number;
  name: string;
}

interface BillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (bill: Bill) => void;
  initialBill?: Bill | null;
  categories: CategoryOption[];
}

const formatAmountForInput = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return "";
  return value.toFixed(2).replace(".", ",");
};

const BillModal = ({
  isOpen,
  onClose,
  onSaved,
  initialBill = null,
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
  }, [isOpen, initialBill]);

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
        setErrorMessage("Titulo e obrigatorio.");
        return;
      }

      const parsedAmount = parseCurrencyInput(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        setErrorMessage("Digite um valor valido maior que zero.");
        return;
      }

      if (!isValidISODate(dueDate)) {
        setErrorMessage("Data de vencimento invalida.");
        return;
      }

      const payload: CreateBillPayload = {
        title: trimmedTitle,
        amount: parsedAmount,
        dueDate,
        categoryId: categoryId ? Number(categoryId) : null,
        provider: provider.trim() || null,
        referenceMonth: referenceMonth.trim() || null,
        notes: notes.trim() || null,
      };

      setIsSaving(true);
      try {
        const savedBill = isEditing && initialBill
          ? await billsService.update(initialBill.id, payload)
          : await billsService.create(payload);
        onSaved(savedBill);
      } catch (error) {
        const err = error as { response?: { data?: { message?: string } }; message?: string };
        setErrorMessage(
          err?.response?.data?.message || err?.message || "Nao foi possivel salvar a pendencia.",
        );
      } finally {
        setIsSaving(false);
      }
    },
    [title, amount, dueDate, categoryId, provider, referenceMonth, notes, isEditing, initialBill, onSaved],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex min-h-screen items-start justify-center bg-gray-100 bg-opacity-50 p-6 sm:items-center"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div className="w-full max-w-md rounded-lg bg-cf-surface p-4 sm:p-6">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-cf-text-primary">
            {isEditing ? "Editar pendencia" : "Nova pendencia"}
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
              Mes de referencia <span className="text-xs font-normal text-cf-text-secondary">(opcional, YYYY-MM)</span>
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
              {isSaving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BillModal;
