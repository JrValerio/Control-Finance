import { useEffect, useState } from "react";
import {
  incomeSourcesService,
  type IncomeSourceWithDeductions,
} from "../services/incomeSources.service";
import { getApiErrorMessage } from "../utils/apiError";

export interface IncomeStatementPrefill {
  referenceMonth?: string;
  netAmount?: number;
  paymentDate?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  prefill?: IncomeStatementPrefill | null;
  onCreated?: () => void;
}

export default function IncomeStatementQuickModal({
  isOpen,
  onClose,
  prefill,
  onCreated,
}: Props) {
  const [sources, setSources] = useState<IncomeSourceWithDeductions[]>([]);
  const [isLoadingSources, setIsLoadingSources] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [referenceMonth, setReferenceMonth] = useState("");
  const [netAmount, setNetAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [success, setSuccess] = useState(false);

  // Reset + fetch sources on open
  useEffect(() => {
    if (!isOpen) {
      setSourceId("");
      setReferenceMonth("");
      setNetAmount("");
      setPaymentDate("");
      setErrorMessage("");
      setSuccess(false);
      setSources([]);
      return;
    }

    // Apply prefill
    setReferenceMonth(prefill?.referenceMonth ?? "");
    setNetAmount(prefill?.netAmount != null ? String(prefill.netAmount) : "");
    setPaymentDate(prefill?.paymentDate ?? "");

    setIsLoadingSources(true);
    incomeSourcesService
      .list()
      .then((list) => {
        setSources(list);
        if (list.length === 1) {
          setSourceId(String(list[0].id));
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingSources(false));
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsedSourceId = Number(sourceId);
    if (!parsedSourceId) {
      setErrorMessage("Selecione uma fonte de renda.");
      return;
    }

    if (!referenceMonth.trim()) {
      setErrorMessage("Informe a competência.");
      return;
    }

    const parsedNet = Number(netAmount);
    if (!Number.isFinite(parsedNet) || parsedNet <= 0) {
      setErrorMessage("Informe um valor líquido válido.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    try {
      await incomeSourcesService.createStatement(parsedSourceId, {
        referenceMonth: referenceMonth.trim(),
        netAmount: parsedNet,
        paymentDate: paymentDate.trim() || null,
      });
      setSuccess(true);
      onCreated?.();
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, "Não foi possível registrar o lançamento."));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex min-h-screen items-start justify-center bg-black/50 p-6 sm:items-center"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-lg bg-cf-surface p-4 sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="income-quick-modal-title"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2
            id="income-quick-modal-title"
            className="text-base font-semibold text-cf-text-primary"
          >
            Registrar no histórico de renda
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-cf-text-secondary hover:text-cf-text-primary"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {success ? (
          <div className="rounded border border-green-200 bg-green-50 px-3 py-3 dark:border-green-800 dark:bg-green-950/40">
            <p className="mb-3 text-sm font-semibold text-green-700 dark:text-green-400">
              Lançamento registrado com sucesso.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-green-400 bg-green-100 px-3 py-1.5 text-sm font-semibold text-green-700 hover:bg-green-200 dark:border-green-700 dark:bg-green-900/40 dark:text-green-300"
            >
              Fechar
            </button>
          </div>
        ) : (
          <>
            {isLoadingSources ? (
              <p className="mb-3 text-sm text-cf-text-secondary">Carregando fontes de renda...</p>
            ) : sources.length === 0 ? (
              <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                Nenhuma fonte de renda cadastrada. Cadastre uma fonte antes de registrar um
                lançamento.
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label
                  htmlFor="income-quick-source"
                  className="mb-1 block text-sm font-medium text-cf-text-primary"
                >
                  Fonte de renda
                </label>
                <select
                  id="income-quick-source"
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  disabled={isLoadingSources || sources.length === 0}
                  className="w-full rounded border border-cf-border bg-cf-surface px-2 py-1.5 text-sm text-cf-text-primary disabled:opacity-60"
                >
                  <option value="">— Selecione —</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="income-quick-month"
                  className="mb-1 block text-sm font-medium text-cf-text-primary"
                >
                  Competência
                </label>
                <input
                  id="income-quick-month"
                  type="text"
                  placeholder="AAAA-MM"
                  value={referenceMonth}
                  onChange={(e) => setReferenceMonth(e.target.value)}
                  className="w-full rounded border border-cf-border bg-cf-surface px-2 py-1.5 text-sm text-cf-text-primary"
                />
              </div>

              <div>
                <label
                  htmlFor="income-quick-net"
                  className="mb-1 block text-sm font-medium text-cf-text-primary"
                >
                  Valor líquido (R$)
                </label>
                <input
                  id="income-quick-net"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={netAmount}
                  onChange={(e) => setNetAmount(e.target.value)}
                  className="w-full rounded border border-cf-border bg-cf-surface px-2 py-1.5 text-sm text-cf-text-primary"
                />
              </div>

              <div>
                <label
                  htmlFor="income-quick-date"
                  className="mb-1 block text-sm font-medium text-cf-text-primary"
                >
                  Data de pagamento{" "}
                  <span className="font-normal text-cf-text-secondary">(opcional)</span>
                </label>
                <input
                  id="income-quick-date"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full rounded border border-cf-border bg-cf-surface px-2 py-1.5 text-sm text-cf-text-primary"
                />
              </div>

              {errorMessage ? (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400">
                  {errorMessage}
                </p>
              ) : null}

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={isSubmitting || sources.length === 0}
                  className="rounded border border-brand-1 bg-brand-1 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? "Registrando..." : "Registrar"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-1.5 text-sm font-semibold text-cf-text-secondary"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
