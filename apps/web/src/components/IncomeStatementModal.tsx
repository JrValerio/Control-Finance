import { useCallback, useEffect, useState } from "react";
import { parseCurrencyInput } from "./DatabaseUtils";
import {
  incomeSourcesService,
  type IncomeDeduction,
  type IncomeStatementWithDeductions,
  type PostStatementResult,
} from "../services/incomeSources.service";
import { formatCurrency } from "../utils/formatCurrency";

const getCurrentMonth = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const formatAmountForInput = (value: number): string => {
  if (!Number.isFinite(value) || value < 0) return "";
  return value.toFixed(2).replace(".", ",");
};

interface IncomeStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceId: number;
  sourceName: string;
  activeDeductions: IncomeDeduction[];
  onDraftSaved: (result: IncomeStatementWithDeductions) => void;
  onPosted: (result: PostStatementResult) => void;
}

const IncomeStatementModal = ({
  isOpen,
  onClose,
  sourceId,
  sourceName,
  activeDeductions,
  onDraftSaved,
  onPosted,
}: IncomeStatementModalProps): JSX.Element | null => {
  const [referenceMonth, setReferenceMonth] = useState(getCurrentMonth());
  const [netAmount, setNetAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  // variable amounts: keyed by source deduction id (as string)
  const [variableAmounts, setVariableAmounts] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setReferenceMonth(getCurrentMonth());
    setNetAmount("");
    setPaymentDate("");
    const initVars: Record<string, string> = {};
    for (const d of activeDeductions) {
      if (d.isVariable) {
        initVars[String(d.id)] = formatAmountForInput(d.amount);
      }
    }
    setVariableAmounts(initVars);
    setErrorMessage("");
    setIsSaving(false);
  }, [isOpen, activeDeductions]);

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

  // Compute preview totals using the in-modal state
  const totalFixedDeductions = activeDeductions
    .filter((d) => !d.isVariable)
    .reduce((sum, d) => sum + d.amount, 0);

  const totalVariableDeductions = activeDeductions
    .filter((d) => d.isVariable)
    .reduce((sum, d) => {
      const raw = variableAmounts[String(d.id)] ?? "";
      const parsed = parseCurrencyInput(raw);
      return sum + (Number.isFinite(parsed) && parsed >= 0 ? parsed : d.amount);
    }, 0);

  const totalDeductions = totalFixedDeductions + totalVariableDeductions;
  const parsedNet = parseCurrencyInput(netAmount);
  const estimatedGross =
    Number.isFinite(parsedNet) && parsedNet > 0 ? parsedNet + totalDeductions : null;

  const handleSave = useCallback(
    async (shouldPost: boolean) => {
      setErrorMessage("");

      if (!referenceMonth) {
        setErrorMessage("Mês de referência é obrigatório.");
        return;
      }

      const net = parseCurrencyInput(netAmount);
      if (!Number.isFinite(net) || net <= 0) {
        setErrorMessage("Valor liquido deve ser maior que zero.");
        return;
      }

      setIsSaving(true);
      try {
        const draft = await incomeSourcesService.createStatement(sourceId, {
          referenceMonth,
          netAmount: net,
          paymentDate: paymentDate || null,
        });

        // Patch variable deduction amounts if any were modified
        const variablePatches = draft.deductions
          .filter((d) => d.isVariable)
          .map((d) => {
            const sourceKey = activeDeductions.findIndex((ad) => ad.label === d.label);
            const sourceDeduction = sourceKey >= 0 ? activeDeductions[sourceKey] : null;
            const sourceId_str = sourceDeduction ? String(sourceDeduction.id) : "";
            const raw = variableAmounts[sourceId_str] ?? "";
            const parsed = parseCurrencyInput(raw);
            const amt = Number.isFinite(parsed) && parsed >= 0 ? parsed : d.amount;
            return { id: d.id, amount: amt };
          })
          .filter((p, i) => p.amount !== draft.deductions.filter((d) => d.isVariable)[i]?.amount);

        let current = draft;
        if (variablePatches.length > 0) {
          current = await incomeSourcesService.updateStatement(draft.statement.id, {
            deductions: variablePatches,
          });
        }

        if (shouldPost) {
          const result = await incomeSourcesService.postStatement(current.statement.id);
          onPosted(result);
        } else {
          onDraftSaved(current);
        }
      } catch (error) {
        const err = error as { response?: { data?: { message?: string } }; message?: string };
        setErrorMessage(
          err?.response?.data?.message || err?.message || "Não foi possível salvar.",
        );
        setIsSaving(false);
      }
    },
    [referenceMonth, netAmount, paymentDate, variableAmounts, sourceId, activeDeductions, onDraftSaved, onPosted],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex min-h-screen items-start justify-center bg-black/50 p-6 sm:items-center"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div className="w-full max-w-lg rounded-lg bg-cf-surface p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-cf-text-primary">
            Gerar extrato — {sourceName}
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

        <div className="space-y-4">
          {/* Mes */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="stmt-month" className="text-sm font-medium text-cf-text-primary">
              Mês de referência <span className="text-red-500">*</span>
            </label>
            <input
              id="stmt-month"
              type="month"
              value={referenceMonth}
              onChange={(e) => setReferenceMonth(e.target.value)}
              className="rounded border border-cf-border-input px-3 py-2 text-sm text-cf-text-primary focus:outline-none focus:ring-1 focus:ring-brand-1 bg-cf-surface"
              disabled={isSaving}
            />
          </div>

          {/* Valor liquido */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="stmt-net" className="text-sm font-medium text-cf-text-primary">
              Valor liquido creditado <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center rounded border border-cf-border-input px-3 py-2">
              <span className="mr-1 text-sm font-medium text-cf-text-secondary">R$</span>
              <input
                id="stmt-net"
                type="text"
                inputMode="decimal"
                value={netAmount}
                onChange={(e) => setNetAmount(e.target.value)}
                placeholder="0,00"
                className="flex-1 bg-transparent text-sm text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none"
                disabled={isSaving}
              />
            </div>
          </div>

          {/* Data de credito */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="stmt-date" className="text-sm font-medium text-cf-text-primary">
              Data de credito{" "}
              <span className="text-xs font-normal text-cf-text-secondary">(opcional)</span>
            </label>
            <input
              id="stmt-date"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="rounded border border-cf-border-input px-3 py-2 text-sm text-cf-text-primary focus:outline-none focus:ring-1 focus:ring-brand-1 bg-cf-surface"
              disabled={isSaving}
            />
          </div>

          {/* Descontos */}
          {activeDeductions.length > 0 ? (
            <div>
              <p className="mb-1.5 text-sm font-medium text-cf-text-primary">Descontos</p>
              <div className="divide-y divide-cf-border rounded border border-cf-border">
                {activeDeductions.map((d) => (
                  <div key={d.id} className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm text-cf-text-primary">{d.label}</span>
                    {d.isVariable ? (
                      <div className="flex items-center rounded border border-cf-border-input px-2 py-1 w-32">
                        <span className="mr-1 text-xs text-cf-text-secondary">R$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label={`Valor de ${d.label}`}
                          value={variableAmounts[String(d.id)] ?? ""}
                          onChange={(e) =>
                            setVariableAmounts((prev) => ({
                              ...prev,
                              [String(d.id)]: e.target.value,
                            }))
                          }
                          placeholder="0,00"
                          disabled={isSaving}
                          className="flex-1 bg-transparent text-sm text-cf-text-primary placeholder:text-cf-text-secondary focus:outline-none"
                        />
                      </div>
                    ) : (
                      <span className="text-sm font-medium text-cf-text-secondary">
                        {formatCurrency(d.amount)}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Footer summary */}
              <div className="mt-2 space-y-1 rounded border border-cf-border bg-cf-bg-subtle px-3 py-2 text-sm">
                <div className="flex justify-between text-cf-text-secondary">
                  <span>Total descontos</span>
                  <span>{formatCurrency(totalDeductions)}</span>
                </div>
                {estimatedGross !== null ? (
                  <div className="flex justify-between font-semibold text-cf-text-primary">
                    <span>Bruto estimado</span>
                    <span>{formatCurrency(estimatedGross)}</span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

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
              type="button"
              onClick={() => void handleSave(false)}
              disabled={isSaving}
              className="rounded border border-cf-border bg-cf-surface px-4 py-2 text-sm font-semibold text-cf-text-primary hover:bg-cf-bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Salvando..." : "Salvar rascunho"}
            </button>
            <button
              type="button"
              onClick={() => void handleSave(true)}
              disabled={isSaving}
              className="rounded bg-brand-1 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Lancando..." : "Lancar entrada"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IncomeStatementModal;
