import { useEffect, useState } from "react";
import { getTodayISODate, isValidISODate, parseCurrencyInput } from "./DatabaseUtils";

interface CreditCardPurchaseModalProps {
  isOpen: boolean;
  cardName: string;
  onClose: () => void;
  onSave: (payload: {
    title: string;
    amount: number;
    purchaseDate: string;
    notes: string | null;
  }) => Promise<void> | void;
}

const CreditCardPurchaseModal = ({
  isOpen,
  cardName,
  onClose,
  onSave,
}: CreditCardPurchaseModalProps): JSX.Element | null => {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(getTodayISODate());
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setTitle("");
    setAmount("");
    setPurchaseDate(getTodayISODate());
    setNotes("");
    setIsSaving(false);
    setErrorMessage("");
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");

    const parsedAmount = parseCurrencyInput(amount);

    if (!title.trim()) {
      setErrorMessage("Descrição da compra é obrigatória.");
      return;
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setErrorMessage("Digite um valor válido maior que zero.");
      return;
    }

    if (!isValidISODate(purchaseDate)) {
      setErrorMessage("Data da compra inválida.");
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        title: title.trim(),
        amount: parsedAmount,
        purchaseDate,
        notes: notes.trim() || null,
      });
    } catch (error) {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      setErrorMessage(
        err?.response?.data?.message || err?.message || "Não foi possível salvar a compra.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex min-h-screen items-start justify-center bg-black/50 p-6 sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div className="w-full max-w-md rounded-lg bg-cf-surface p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-cf-text-primary">Nova compra</h2>
            <p className="text-xs text-cf-text-secondary">{cardName}</p>
          </div>
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
          <div className="flex flex-col gap-1.5">
            <label htmlFor="credit-card-purchase-title" className="text-sm font-medium text-cf-text-primary">
              Descrição
            </label>
            <input
              id="credit-card-purchase-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="rounded border border-cf-border-input bg-cf-surface px-3 py-2 text-sm text-cf-text-primary"
              disabled={isSaving}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="credit-card-purchase-amount" className="text-sm font-medium text-cf-text-primary">
              Valor
            </label>
            <input
              id="credit-card-purchase-amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0,00"
              className="rounded border border-cf-border-input bg-cf-surface px-3 py-2 text-sm text-cf-text-primary"
              disabled={isSaving}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="credit-card-purchase-date" className="text-sm font-medium text-cf-text-primary">
              Data da compra
            </label>
            <input
              id="credit-card-purchase-date"
              type="date"
              value={purchaseDate}
              onChange={(event) => setPurchaseDate(event.target.value)}
              className="rounded border border-cf-border-input bg-cf-surface px-3 py-2 text-sm text-cf-text-primary"
              disabled={isSaving}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="credit-card-purchase-notes" className="text-sm font-medium text-cf-text-primary">
              Notas
            </label>
            <textarea
              id="credit-card-purchase-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className="rounded border border-cf-border-input bg-cf-surface px-3 py-2 text-sm text-cf-text-primary"
              disabled={isSaving}
            />
          </div>

          {errorMessage ? (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {errorMessage}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-cf-border px-3 py-2 text-sm font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
              disabled={isSaving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded bg-brand-1 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-2 disabled:opacity-60"
              disabled={isSaving}
            >
              {isSaving ? "Salvando..." : "Adicionar compra"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreditCardPurchaseModal;
