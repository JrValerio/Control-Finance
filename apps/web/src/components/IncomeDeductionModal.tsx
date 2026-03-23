import { useCallback, useEffect, useState } from "react";
import { parseCurrencyInput } from "./DatabaseUtils";
import {
  incomeSourcesService,
  type IncomeDeduction,
  type CreateDeductionPayload,
} from "../services/incomeSources.service";

interface IncomeDeductionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (deduction: IncomeDeduction) => void;
  sourceId: number;
  initialDeduction?: IncomeDeduction | null;
}

const formatAmountForInput = (value: number): string => {
  if (!Number.isFinite(value) || value < 0) return "";
  return value.toFixed(2).replace(".", ",");
};

const IncomeDeductionModal = ({
  isOpen,
  onClose,
  onSaved,
  sourceId,
  initialDeduction = null,
}: IncomeDeductionModalProps): JSX.Element | null => {
  const isEditing = Boolean(initialDeduction);

  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [isVariable, setIsVariable] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    if (initialDeduction) {
      setLabel(initialDeduction.label);
      setAmount(formatAmountForInput(initialDeduction.amount));
      setIsVariable(initialDeduction.isVariable);
    } else {
      setLabel("");
      setAmount("");
      setIsVariable(false);
    }
    setErrorMessage("");
    setIsSaving(false);
  }, [isOpen, initialDeduction]);

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

      const trimmedLabel = label.trim();
      if (!trimmedLabel) {
        setErrorMessage("Rótulo é obrigatório.");
        return;
      }

      const parsedAmount = parseCurrencyInput(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
        setErrorMessage("Valor deve ser maior ou igual a zero.");
        return;
      }

      setIsSaving(true);
      try {
        const payload: CreateDeductionPayload = {
          label: trimmedLabel,
          amount: parsedAmount,
          isVariable,
        };

        const saved = isEditing && initialDeduction
          ? await incomeSourcesService.updateDeduction(initialDeduction.id, payload)
          : await incomeSourcesService.addDeduction(sourceId, payload);

        onSaved(saved);
      } catch (error) {
        const err = error as { response?: { data?: { message?: string } }; message?: string };
        setErrorMessage(
          err?.response?.data?.message || err?.message || "Não foi possível salvar.",
        );
      } finally {
        setIsSaving(false);
      }
    },
    [label, amount, isVariable, isEditing, initialDeduction, sourceId, onSaved],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex min-h-screen items-start justify-center bg-black/50 p-6 sm:items-center"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div className="w-full max-w-sm rounded-lg bg-cf-surface p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-cf-text-primary">
            {isEditing ? "Editar desconto" : "Novo desconto"}
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
          {/* Rotulo */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ded-label" className="text-sm font-medium text-cf-text-primary">
              Rotulo <span className="text-red-500">*</span>
            </label>
            <input
              id="ded-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex: Emprestimo Caixa"
              className="rounded border border-cf-border-input px-3 py-2 text-sm text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-1 bg-cf-surface"
              disabled={isSaving}
              maxLength={200}
            />
          </div>

          {/* Valor */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ded-amount" className="text-sm font-medium text-cf-text-primary">
              Valor <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center rounded border border-cf-border-input px-3 py-2">
              <span className="mr-1 text-sm font-medium text-cf-text-secondary">R$</span>
              <input
                id="ded-amount"
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

          {/* Variavel */}
          <div className="flex items-center gap-2">
            <input
              id="ded-variable"
              type="checkbox"
              checked={isVariable}
              onChange={(e) => setIsVariable(e.target.checked)}
              disabled={isSaving}
              className="rounded"
            />
            <label htmlFor="ded-variable" className="cursor-pointer text-sm text-cf-text-primary">
              Valor variável (muda todo mês)
            </label>
          </div>

          {errorMessage ? (
            <div
              className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              role="alert"
            >
              {errorMessage}
            </div>
          ) : null}

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

export default IncomeDeductionModal;
