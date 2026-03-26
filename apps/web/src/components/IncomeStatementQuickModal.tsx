import { useEffect, useState } from "react";
import {
  incomeSourcesService,
  type IncomeSourceWithDeductions,
  type IncomeStatement,
  type PostStatementResult,
} from "../services/incomeSources.service";
import { getApiErrorMessage } from "../utils/apiError";

export interface IncomeStatementPrefill {
  referenceMonth?: string;
  netAmount?: number;
  paymentDate?: string;
  grossAmount?: number | null;
  details?: Record<string, unknown> | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  prefill?: IncomeStatementPrefill | null;
  /** When provided, automatically links the created statement to this transaction. */
  transactionId?: number | null;
  defaultComposeIncome?: boolean;
  onCreated?: (statement: IncomeStatement) => void;
}

type FinalizationMode = "none" | "link" | "post";
type FinalizationStatus = "idle" | "linking" | "linked" | "posting" | "posted" | "failed";

export default function IncomeStatementQuickModal({
  isOpen,
  onClose,
  prefill,
  transactionId,
  defaultComposeIncome = false,
  onCreated,
}: Props) {
  const [sources, setSources] = useState<IncomeSourceWithDeductions[]>([]);
  const [isLoadingSources, setIsLoadingSources] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [referenceMonth, setReferenceMonth] = useState("");
  const [netAmount, setNetAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [composeIncome, setComposeIncome] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [createdStatement, setCreatedStatement] = useState<IncomeStatement | null>(null);
  const [postedTransaction, setPostedTransaction] = useState<PostStatementResult["transaction"] | null>(null);
  const [finalizationMode, setFinalizationMode] = useState<FinalizationMode>("none");
  const [finalizationStatus, setFinalizationStatus] = useState<FinalizationStatus>("idle");
  const [finalizationError, setFinalizationError] = useState("");

  // Reset + fetch sources on open
  useEffect(() => {
    if (!isOpen) {
      setSourceId("");
      setReferenceMonth("");
      setNetAmount("");
      setPaymentDate("");
      setComposeIncome(Boolean(transactionId) || defaultComposeIncome);
      setErrorMessage("");
      setCreatedStatement(null);
      setPostedTransaction(null);
      setFinalizationMode("none");
      setFinalizationStatus("idle");
      setFinalizationError("");
      setSources([]);
      return;
    }

    setReferenceMonth(prefill?.referenceMonth ?? "");
    setNetAmount(prefill?.netAmount != null ? String(prefill.netAmount) : "");
    setPaymentDate(prefill?.paymentDate ?? "");
    setComposeIncome(Boolean(transactionId) || defaultComposeIncome);
    setPostedTransaction(null);
    setFinalizationMode("none");
    setFinalizationStatus("idle");
    setFinalizationError("");

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
  }, [defaultComposeIncome, isOpen, prefill?.netAmount, prefill?.paymentDate, prefill?.referenceMonth, transactionId]);

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
      const { statement } = await incomeSourcesService.createStatement(parsedSourceId, {
        referenceMonth: referenceMonth.trim(),
        netAmount: parsedNet,
        paymentDate: paymentDate.trim() || null,
        grossAmount: prefill?.grossAmount ?? null,
        details: prefill?.details ?? null,
      });

      let finalStatement = statement;
      let shouldNotifyCreated = true;

      if (composeIncome) {
        if (transactionId) {
          setFinalizationMode("link");
          setFinalizationStatus("linking");
          try {
            finalStatement = await incomeSourcesService.linkTransaction(statement.id, transactionId);
            setFinalizationStatus("linked");
          } catch (linkErr) {
            setFinalizationStatus("failed");
            setFinalizationError(
              getApiErrorMessage(linkErr, "Nao foi possivel vincular a transacao importada."),
            );
            shouldNotifyCreated = false;
          }
        } else {
          setFinalizationMode("post");
          setFinalizationStatus("posting");
          try {
            const postResult = await incomeSourcesService.postStatement(statement.id);
            finalStatement = postResult.statement;
            setPostedTransaction(postResult.transaction);
            setFinalizationStatus("posted");
          } catch (postErr) {
            setFinalizationStatus("failed");
            setFinalizationError(
              getApiErrorMessage(postErr, "Nao foi possivel lancar a entrada automaticamente."),
            );
            shouldNotifyCreated = false;
          }
        }
      }

      setCreatedStatement(finalStatement);
      if (shouldNotifyCreated) {
        onCreated?.(finalStatement);
      }
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, "Nao foi possivel registrar o lancamento."));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const success = createdStatement !== null;

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
          <div className="space-y-2">
            <div className="rounded border border-green-200 bg-green-50 px-3 py-3 dark:border-green-800 dark:bg-green-950/40">
              <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                {finalizationStatus === "posted"
                  ? "Renda registrada e entrada lancada com sucesso."
                  : "Lancamento registrado com sucesso."}
              </p>

              {finalizationStatus === "linking" && (
                <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                  Vinculando a transacao importada...
                </p>
              )}
              {finalizationStatus === "linked" && (
                <p className="mt-1 text-xs font-medium text-green-700 dark:text-green-400">
                  Vinculo com a transacao importada confirmado.
                </p>
              )}
              {finalizationStatus === "posting" && (
                <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                  Lancando a entrada do mes...
                </p>
              )}
              {finalizationStatus === "posted" && postedTransaction && (
                <p className="mt-1 text-xs font-medium text-green-700 dark:text-green-400">
                  Entrada gerada: R$ {postedTransaction.value.toFixed(2).replace(".", ",")}
                </p>
              )}
            </div>

            {finalizationStatus === "failed" && finalizationMode === "link" && (
              <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/40">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  Historico registrado, mas o vinculo com a transacao importada nao foi concluido.
                </p>
                {finalizationError && (
                  <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">{finalizationError}</p>
                )}
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  Voce pode vincular manualmente pelo historico de renda.
                </p>
              </div>
            )}

            {finalizationStatus === "failed" && finalizationMode === "post" && (
              <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/40">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  Historico registrado, mas a entrada ainda nao foi lancada na renda mensal.
                </p>
                {finalizationError && (
                  <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">{finalizationError}</p>
                )}
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  Voce pode revisar o extrato e lancar a entrada depois pela area de fontes de renda.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              disabled={finalizationStatus === "linking" || finalizationStatus === "posting"}
              className="rounded border border-green-400 bg-green-100 px-3 py-1.5 text-sm font-semibold text-green-700 hover:bg-green-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-green-700 dark:bg-green-900/40 dark:text-green-300"
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

              <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2">
                <label
                  htmlFor="income-quick-compose"
                  className="flex items-start gap-2 text-sm font-medium text-cf-text-primary"
                >
                  <input
                    id="income-quick-compose"
                    type="checkbox"
                    checked={composeIncome}
                    onChange={(e) => setComposeIncome(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-cf-border accent-brand-1"
                  />
                  <span>Este documento compoe minha renda</span>
                </label>
                <p className="mt-1 text-xs text-cf-text-secondary">
                  {composeIncome
                    ? transactionId
                      ? "Ao registrar, o historico sera vinculado a entrada importada deste extrato."
                      : "Ao registrar, o historico sera lancado como entrada do mes."
                    : "Ao registrar, o documento fica so no historico e nao entra na renda mensal ainda."}
                </p>
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
                  {isSubmitting
                    ? "Registrando..."
                    : composeIncome
                      ? transactionId
                        ? "Registrar e vincular entrada"
                        : "Registrar e lancar entrada"
                      : "Registrar somente no historico"}
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
