import { useEffect, useState } from "react";
import {
  incomeSourcesService,
  type IncomeSourceWithDeductions,
  type IncomeStatement,
  type IncomeStatementWithDeductions,
  type PostStatementResult,
} from "../services/incomeSources.service";
import { getApiErrorMessage } from "../utils/apiError";

interface IncomeStatementPrefillDeduction {
  code?: string | null;
  label: string;
  amount: number;
  isVariable?: boolean;
  consignacaoType?: "loan" | "card" | "other" | null;
}

export interface IncomeStatementPrefill {
  referenceMonth?: string;
  netAmount?: number;
  paymentDate?: string;
  grossAmount?: number | null;
  deductions?: IncomeStatementPrefillDeduction[];
  details?: Record<string, unknown> | null;
  sourceImportSessionId?: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  prefill?: IncomeStatementPrefill | null;
  /** When provided, automatically links the created statement to this transaction. */
  transactionId?: number | null;
  defaultComposeIncome?: boolean;
  onCreated?: (statement: IncomeStatement) => void;
  onIgnored?: (statement: IncomeStatement) => void;
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
  onIgnored,
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
  const [statementOutcome, setStatementOutcome] = useState<IncomeStatementWithDeductions["outcome"]>();
  const [existingStatement, setExistingStatement] = useState<IncomeStatement | null>(null);
  const [isCheckingExistingStatement, setIsCheckingExistingStatement] = useState(false);
  const [existingCompetenceAction, setExistingCompetenceAction] = useState<"" | "ignore" | "replace">("");

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
      setStatementOutcome(undefined);
      setExistingStatement(null);
      setIsCheckingExistingStatement(false);
      setExistingCompetenceAction("");
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
    setStatementOutcome(undefined);
    setExistingStatement(null);
    setIsCheckingExistingStatement(false);
    setExistingCompetenceAction("");

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

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const trimmedReferenceMonth = referenceMonth.trim();
    if (!sourceId || !trimmedReferenceMonth) {
      setExistingStatement(null);
      setIsCheckingExistingStatement(false);
      setExistingCompetenceAction("");
      return undefined;
    }

    let cancelled = false;
    setIsCheckingExistingStatement(true);

    incomeSourcesService
      .listStatements(Number(sourceId))
      .then((statements) => {
        if (cancelled) {
          return;
        }

        const match =
          statements.find((statement) => statement.referenceMonth === trimmedReferenceMonth) ?? null;

        setExistingStatement(match);
        setExistingCompetenceAction("");
      })
      .catch(() => {
        if (!cancelled) {
          setExistingStatement(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsCheckingExistingStatement(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, referenceMonth, sourceId]);

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

    if (existingStatement && !existingCompetenceAction) {
      setErrorMessage("Escolha se deseja ignorar ou substituir a competência existente.");
      return;
    }

    if (existingStatement && existingCompetenceAction === "ignore") {
      setErrorMessage("");
      onIgnored?.(existingStatement);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    try {
      const result = await incomeSourcesService.createStatement(parsedSourceId, {
        referenceMonth: referenceMonth.trim(),
        netAmount: parsedNet,
        paymentDate: paymentDate.trim() || null,
        grossAmount: prefill?.grossAmount ?? null,
        existingCompetenceAction:
          existingStatement && existingCompetenceAction ? existingCompetenceAction : undefined,
        deductions: Array.isArray(prefill?.deductions)
          ? prefill.deductions.map((deduction) => ({
              label: `${deduction.code ? `${deduction.code} ` : ""}${deduction.label}`.trim(),
              amount: deduction.amount,
              isVariable: Boolean(deduction.isVariable),
            }))
          : undefined,
        details: prefill?.details ?? null,
        sourceImportSessionId: prefill?.sourceImportSessionId ?? null,
      });
      const { statement } = result;
      setStatementOutcome(result.outcome);

      let finalStatement = statement;
      let shouldNotifyCreated = true;
      const statementAlreadyPosted = finalStatement.status === "posted";

      if (composeIncome) {
        if (transactionId) {
          if (statementAlreadyPosted && finalStatement.postedTransactionId === transactionId) {
            setFinalizationMode("link");
            setFinalizationStatus("linked");
          } else {
            setFinalizationMode("link");
            setFinalizationStatus("linking");
            try {
              finalStatement = await incomeSourcesService.linkTransaction(statement.id, transactionId);
              setFinalizationStatus("linked");
            } catch (linkErr) {
              setFinalizationStatus("failed");
              setFinalizationError(
                getApiErrorMessage(linkErr, "Não foi possível vincular a transação importada."),
              );
              shouldNotifyCreated = false;
            }
          }
        } else {
          if (statementAlreadyPosted) {
            setFinalizationMode("post");
            setFinalizationStatus("posted");
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
                getApiErrorMessage(postErr, "Não foi possível lançar a entrada automaticamente."),
              );
              shouldNotifyCreated = false;
            }
          }
        }
      }

      setCreatedStatement(finalStatement);
      if (shouldNotifyCreated) {
        onCreated?.(finalStatement);
      }
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, "Não foi possível registrar o lançamento."));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const success = createdStatement !== null;

  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-black/50 p-2 sm:p-6"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex min-h-full items-center justify-center">
        <div
          className="flex max-h-[min(92vh,960px)] w-full max-w-md flex-col overflow-hidden rounded-lg border border-cf-border bg-cf-surface shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="income-quick-modal-title"
          data-testid="income-quick-modal-shell"
        >
          <div className="border-b border-cf-border px-4 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="income-quick-modal-title"
                  className="text-base font-semibold text-cf-text-primary"
                >
                  Registrar no histórico de renda
                </h2>
                <p className="mt-1 text-sm text-cf-text-secondary">
                  Revise a competência, o valor líquido e o destino desta renda antes de salvar.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-cf-text-secondary hover:text-cf-text-primary"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
          </div>
 
          {success ? (
            <>
              <div
                className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
                data-testid="income-quick-modal-body"
              >
                <div className="space-y-2">
                  <div className="rounded border border-green-200 bg-green-50 px-3 py-3 dark:border-green-800 dark:bg-green-950/40">
                    <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                      {finalizationStatus === "posted"
                        ? "Renda registrada e entrada lançada com sucesso."
                        : "Lançamento registrado com sucesso."}
                    </p>

                    {statementOutcome === "replaced" ? (
                      <p className="mt-1 text-xs font-medium text-green-700 dark:text-green-400">
                        A competência existente foi substituída com segurança.
                      </p>
                    ) : null}

                    {finalizationStatus === "linking" && (
                      <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                        Vinculando a transação importada...
                      </p>
                    )}
                    {finalizationStatus === "linked" && (
                      <p className="mt-1 text-xs font-medium text-green-700 dark:text-green-400">
                        Vínculo com a transação importada confirmado.
                      </p>
                    )}
                    {finalizationStatus === "posting" && (
                      <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                        Lançando a entrada do mês...
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
                        Histórico registrado, mas o vínculo com a transação importada não foi concluído.
                      </p>
                      {finalizationError && (
                        <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">{finalizationError}</p>
                      )}
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                        Você pode vincular manualmente pelo histórico de renda.
                      </p>
                    </div>
                  )}

                  {finalizationStatus === "failed" && finalizationMode === "post" && (
                    <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/40">
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                        Histórico registrado, mas a entrada ainda não foi lançada na renda mensal.
                      </p>
                      {finalizationError && (
                        <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">{finalizationError}</p>
                      )}
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                        Você pode revisar o extrato e lançar a entrada depois pela área de fontes de renda.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end border-t border-cf-border px-4 py-4 sm:px-6">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={finalizationStatus === "linking" || finalizationStatus === "posting"}
                  className="rounded border border-green-400 bg-green-100 px-3 py-1.5 text-sm font-semibold text-green-700 hover:bg-green-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-green-700 dark:bg-green-900/40 dark:text-green-300"
                >
                  Fechar
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div
                className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
                data-testid="income-quick-modal-body"
              >
                <div className="space-y-3">
                  {isLoadingSources ? (
                    <p className="text-sm text-cf-text-secondary">Carregando fontes de renda...</p>
                  ) : sources.length === 0 ? (
                    <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                      Nenhuma fonte de renda cadastrada. Cadastre uma fonte antes de registrar um
                      lançamento.
                    </div>
                  ) : null}

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

              {isCheckingExistingStatement ? (
                <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  Verificando se esta competência já existe nesta fonte...
                </div>
              ) : null}

              {existingStatement ? (
                <div className="rounded border border-amber-300 bg-amber-50 px-3 py-3 dark:border-amber-800 dark:bg-amber-950/40">
                  <p className="text-xs font-semibold uppercase text-amber-800 dark:text-amber-300">
                    Competência já existente
                  </p>
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                    Já existe um extrato para {existingStatement.referenceMonth} nesta fonte.
                  </p>
                  <ul className="mt-2 space-y-0.5 text-xs text-amber-700 dark:text-amber-300">
                    <li>Status: {existingStatement.status === "posted" ? "Lançado" : "Rascunho"}</li>
                    <li>Valor líquido: R$ {existingStatement.netAmount.toFixed(2).replace(".", ",")}</li>
                    {existingStatement.paymentDate ? <li>Pagamento: {existingStatement.paymentDate}</li> : null}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setExistingCompetenceAction("ignore")}
                      className={`rounded border px-3 py-1 text-xs font-semibold ${
                        existingCompetenceAction === "ignore"
                          ? "border-amber-600 bg-amber-600 text-white"
                          : "border-amber-300 bg-white text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-transparent dark:text-amber-300 dark:hover:bg-amber-900/30"
                      }`}
                    >
                      Ignorar
                    </button>
                    <button
                      type="button"
                      onClick={() => setExistingCompetenceAction("replace")}
                      className={`rounded border px-3 py-1 text-xs font-semibold ${
                        existingCompetenceAction === "replace"
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-blue-300 bg-white text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-transparent dark:text-blue-300 dark:hover:bg-blue-900/30"
                      }`}
                    >
                      Substituir
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                    Ignorar não altera nada. Substituir reescreve esta competência sem duplicar consignações.
                  </p>
                </div>
              ) : null}

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

              {Array.isArray(prefill?.deductions) && prefill.deductions.length > 0 ? (
                <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2">
                  <p className="text-xs font-semibold uppercase text-cf-text-secondary">
                    Composição do benefício
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {prefill?.grossAmount != null ? (
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-cf-text-primary">101 Valor total do período</span>
                        <span className="font-semibold text-cf-text-primary">
                          R$ {prefill.grossAmount.toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                    ) : null}
                    {prefill.deductions.map((deduction, index) => (
                      <div
                        key={`${deduction.code || deduction.label}-${index}`}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="text-cf-text-secondary">
                          {deduction.code ? `${deduction.code} ` : ""}
                          {deduction.label}
                        </span>
                        <span className="font-medium text-red-500">
                          - R$ {deduction.amount.toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                    ))}
                    {prefill.netAmount != null ? (
                      <>
                        <div className="border-t border-cf-border" />
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-cf-text-primary">Benefício líquido</span>
                          <span className="font-semibold text-cf-text-primary">
                            R$ {prefill.netAmount.toFixed(2).replace(".", ",")}
                          </span>
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}

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
                  <span>Este documento compõe minha renda</span>
                </label>
                <p className="mt-1 text-xs text-cf-text-secondary">
                  {composeIncome
                    ? transactionId
                      ? "Ao registrar, o histórico será vinculado à entrada importada deste extrato."
                      : "Ao registrar, o histórico será lançado como entrada do mês."
                    : "Ao registrar, o documento fica só no histórico e não entra na renda mensal ainda."}
                </p>
              </div>

              {errorMessage ? (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400">
                  {errorMessage}
                </p>
              ) : null}
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-cf-border px-4 py-4 sm:px-6">
                <button
                  type="submit"
                  disabled={isSubmitting || sources.length === 0 || isCheckingExistingStatement}
                  className="rounded border border-brand-1 bg-brand-1 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting
                    ? "Registrando..."
                    : existingStatement && existingCompetenceAction === "ignore"
                      ? "Ignorar competência"
                    : composeIncome
                      ? transactionId
                        ? "Registrar e vincular entrada"
                        : "Registrar e lançar entrada"
                      : "Registrar somente no histórico"}
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
          )}
        </div>
      </div>
    </div>
  );
}
