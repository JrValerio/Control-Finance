import { useEffect, useState } from "react";

interface CreditCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: {
    name: string;
    limitTotal: number;
    closingDay: number;
    dueDay: number;
  }) => Promise<void> | void;
  initialCard?: {
    name: string;
    limitTotal: number;
    closingDay: number;
    dueDay: number;
  } | null;
}

const CreditCardModal = ({
  isOpen,
  onClose,
  onSave,
  initialCard = null,
}: CreditCardModalProps): JSX.Element | null => {
  const [name, setName] = useState("");
  const [limitTotal, setLimitTotal] = useState("");
  const [closingDay, setClosingDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setName(initialCard?.name || "");
    setLimitTotal(
      initialCard?.limitTotal != null && Number.isFinite(initialCard.limitTotal)
        ? String(initialCard.limitTotal).replace(".", ",")
        : "",
    );
    setClosingDay(initialCard?.closingDay != null ? String(initialCard.closingDay) : "");
    setDueDay(initialCard?.dueDay != null ? String(initialCard.dueDay) : "");
    setErrorMessage("");
    setIsSaving(false);
  }, [initialCard, isOpen]);

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

    const parsedLimit = Number(limitTotal.replace(/\./g, "").replace(",", "."));
    const parsedClosingDay = Number(closingDay);
    const parsedDueDay = Number(dueDay);

    if (!name.trim()) {
      setErrorMessage("Nome do cartão é obrigatório.");
      return;
    }

    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
      setErrorMessage("Informe um limite válido maior que zero.");
      return;
    }

    if (!Number.isInteger(parsedClosingDay) || parsedClosingDay < 1 || parsedClosingDay > 31) {
      setErrorMessage("Fechamento deve ser um dia entre 1 e 31.");
      return;
    }

    if (!Number.isInteger(parsedDueDay) || parsedDueDay < 1 || parsedDueDay > 31) {
      setErrorMessage("Vencimento deve ser um dia entre 1 e 31.");
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        name: name.trim(),
        limitTotal: Number(parsedLimit.toFixed(2)),
        closingDay: parsedClosingDay,
        dueDay: parsedDueDay,
      });
    } catch (error) {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      setErrorMessage(
        err?.response?.data?.message || err?.message || "Não foi possível salvar o cartão.",
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
          <h2 className="text-lg font-semibold text-cf-text-primary">
            {initialCard ? "Editar cartão" : "Novo cartão"}
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
          <div className="flex flex-col gap-1.5">
            <label htmlFor="credit-card-name" className="text-sm font-medium text-cf-text-primary">
              Nome do cartão
            </label>
            <input
              id="credit-card-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="rounded border border-cf-border-input bg-cf-surface px-3 py-2 text-sm text-cf-text-primary"
              disabled={isSaving}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="credit-card-limit" className="text-sm font-medium text-cf-text-primary">
              Limite total
            </label>
            <input
              id="credit-card-limit"
              type="text"
              inputMode="decimal"
              value={limitTotal}
              onChange={(event) => setLimitTotal(event.target.value)}
              placeholder="0,00"
              className="rounded border border-cf-border-input bg-cf-surface px-3 py-2 text-sm text-cf-text-primary"
              disabled={isSaving}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="credit-card-closing-day" className="text-sm font-medium text-cf-text-primary">
                Fechamento
              </label>
              <input
                id="credit-card-closing-day"
                type="number"
                min={1}
                max={31}
                value={closingDay}
                onChange={(event) => setClosingDay(event.target.value)}
                className="rounded border border-cf-border-input bg-cf-surface px-3 py-2 text-sm text-cf-text-primary"
                disabled={isSaving}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="credit-card-due-day" className="text-sm font-medium text-cf-text-primary">
                Vencimento
              </label>
              <input
                id="credit-card-due-day"
                type="number"
                min={1}
                max={31}
                value={dueDay}
                onChange={(event) => setDueDay(event.target.value)}
                className="rounded border border-cf-border-input bg-cf-surface px-3 py-2 text-sm text-cf-text-primary"
                disabled={isSaving}
              />
            </div>
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
              {isSaving ? "Salvando..." : initialCard ? "Salvar cartão" : "Criar cartão"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreditCardModal;
