import { useCallback, useEffect, useRef, useState } from "react";
import ImportCsvModal from "../components/ImportCsvModal";
import IncomeSourceModal from "../components/IncomeSourceModal";
import IncomeDeductionModal from "../components/IncomeDeductionModal";
import IncomeStatementModal from "../components/IncomeStatementModal";
import { categoriesService } from "../services/categories.service";
import {
  incomeSourcesService,
  type IncomeDeduction,
  type IncomeStatementReconciliation,
  type IncomeSourceWithDeductions,
  type IncomeStatement,
  type PostStatementResult,
} from "../services/incomeSources.service";
import { formatCurrency } from "../utils/formatCurrency";
import { getApiErrorMessage } from "../utils/apiError";

interface CategoryOption {
  id: number;
  name: string;
}

interface IncomeSourcesPageProps {
  onBack?: () => void;
}

const getReconciliationBadge = (status: IncomeStatementReconciliation["status"]) => {
  switch (status) {
    case "reconciled":
      return {
        label: "Conciliado",
        className: "border-green-200 bg-green-50 text-green-700",
      };
    case "manual_entry":
      return {
        label: "Lancado no app",
        className: "border-blue-200 bg-blue-50 text-blue-700",
      };
    case "candidate":
      return {
        label: "Conciliar",
        className: "border-amber-200 bg-amber-50 text-amber-700",
      };
    case "conflict":
      return {
        label: "Conflito",
        className: "border-red-200 bg-red-50 text-red-700",
      };
    default:
      return {
        label: "Pendente",
        className: "border-cf-border bg-cf-bg-subtle text-cf-text-secondary",
      };
  }
};

const getStatementStatusBadge = (status: "draft" | "posted") => {
  if (status === "posted") {
    return {
      label: "Confirmada",
      className: "border-green-200 bg-green-50 text-green-700",
    };
  }

  return {
    label: "Rascunho",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  };
};

const IncomeSourcesPage = ({
  onBack = undefined,
}: IncomeSourcesPageProps): JSX.Element => {
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [sources, setSources] = useState<IncomeSourceWithDeductions[]>([]);
  const [statementsBySource, setStatementsBySource] = useState<Record<number, IncomeStatement[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingStatements, setIsLoadingStatements] = useState(false);
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [linkingStatementId, setLinkingStatementId] = useState<number | null>(null);

  // Source modal state
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<IncomeSourceWithDeductions | null>(null);

  // Deduction modal state
  const [isDeductionModalOpen, setIsDeductionModalOpen] = useState(false);
  const [deductionContext, setDeductionContext] = useState<{
    sourceId: number;
    deduction: IncomeDeduction | null;
  } | null>(null);

  // Statement modal state
  const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
  const [statementSource, setStatementSource] = useState<IncomeSourceWithDeductions | null>(null);

  // Confirm delete
  const [confirmingDeleteSourceId, setConfirmingDeleteSourceId] = useState<number | null>(null);
  const [confirmingDeleteDeductionId, setConfirmingDeleteDeductionId] = useState<number | null>(null);

  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Data loading ─────────────────────────────────────────────────────────────

  const loadStatementsForSources = useCallback(async (sourceList: IncomeSourceWithDeductions[]) => {
    if (sourceList.length === 0) {
      setStatementsBySource({});
      return;
    }

    setIsLoadingStatements(true);
    try {
      const statementLists = await Promise.all(
        sourceList.map(async (source) => ({
          sourceId: source.id,
          statements: await incomeSourcesService.listStatements(source.id),
        })),
      );

      setStatementsBySource(
        statementLists.reduce<Record<number, IncomeStatement[]>>((acc, item) => {
          acc[item.sourceId] = item.statements;
          return acc;
        }, {}),
      );
    } catch (error) {
      setStatementsBySource({});
      setPageError((current) =>
        current || getApiErrorMessage(error, "Não foi possível carregar o histórico de renda."),
      );
    } finally {
      setIsLoadingStatements(false);
    }
  }, []);

  const reloadIncomeData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await incomeSourcesService.list();
      setSources(data);
      await loadStatementsForSources(data);
    } catch (error) {
      setSources([]);
      setStatementsBySource({});
      setPageError(getApiErrorMessage(error, "Não foi possível carregar as fontes de renda."));
    } finally {
      setIsLoading(false);
    }
  }, [loadStatementsForSources]);

  const loadCategories = useCallback(async () => {
    try {
      const data = await categoriesService.listCategories(false);
      setCategories(Array.isArray(data) ? data : []);
    } catch {
      setCategories([]);
    }
  }, []);

  useEffect(() => {
    void reloadIncomeData();
    void loadCategories();
  }, [reloadIncomeData, loadCategories]);

  // ─── Success helper ────────────────────────────────────────────────────────────

  const showSuccess = (message: string) => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    setSuccessMessage(message);
    successTimerRef.current = setTimeout(() => setSuccessMessage(""), 4000);
  };

  // ─── Source modal ─────────────────────────────────────────────────────────────

  const openCreateSourceModal = () => {
    setEditingSource(null);
    setIsSourceModalOpen(true);
  };

  const openEditSourceModal = (source: IncomeSourceWithDeductions) => {
    setEditingSource(source);
    setIsSourceModalOpen(true);
  };

  const closeSourceModal = () => {
    setIsSourceModalOpen(false);
    setEditingSource(null);
  };

  const handleSourceSaved = () => {
    closeSourceModal();
    showSuccess(editingSource ? "Fonte atualizada." : "Fonte criada.");
    void reloadIncomeData();
  };

  // ─── Deduction modal ──────────────────────────────────────────────────────────

  const openAddDeductionModal = (sourceId: number) => {
    setDeductionContext({ sourceId, deduction: null });
    setIsDeductionModalOpen(true);
  };

  const openEditDeductionModal = (sourceId: number, deduction: IncomeDeduction) => {
    setDeductionContext({ sourceId, deduction });
    setIsDeductionModalOpen(true);
  };

  const closeDeductionModal = () => {
    setIsDeductionModalOpen(false);
    setDeductionContext(null);
  };

  const handleDeductionSaved = () => {
    closeDeductionModal();
    showSuccess(deductionContext?.deduction ? "Desconto atualizado." : "Desconto adicionado.");
    void reloadIncomeData();
  };

  // ─── Delete deduction ─────────────────────────────────────────────────────────

  const handleDeleteDeductionConfirm = async (deductionId: number) => {
    setConfirmingDeleteDeductionId(null);
    setPageError("");
    try {
      await incomeSourcesService.removeDeduction(deductionId);
      showSuccess("Desconto removido.");
      void reloadIncomeData();
    } catch (error) {
      setPageError(getApiErrorMessage(error, "Não foi possível remover o desconto."));
    }
  };

  // ─── Delete source ────────────────────────────────────────────────────────────

  const handleDeleteSourceConfirm = async (sourceId: number) => {
    setConfirmingDeleteSourceId(null);
    setPageError("");
    try {
      await incomeSourcesService.remove(sourceId);
      showSuccess("Fonte removida.");
      void reloadIncomeData();
    } catch (error) {
      setPageError(getApiErrorMessage(error, "Não foi possível remover a fonte."));
    }
  };

  // ─── Statement modal ──────────────────────────────────────────────────────────

  const openStatementModal = (source: IncomeSourceWithDeductions) => {
    setStatementSource(source);
    setIsStatementModalOpen(true);
  };

  const closeStatementModal = () => {
    setIsStatementModalOpen(false);
    setStatementSource(null);
  };

  const handleDraftSaved = () => {
    closeStatementModal();
    showSuccess("Rascunho salvo.");
    void reloadIncomeData();
  };

  const handlePosted = (result: PostStatementResult) => {
    closeStatementModal();
    showSuccess(
      `Entrada lancada: ${formatCurrency(result.transaction.value)} — ${result.transaction.description ?? ""}`,
    );
    void reloadIncomeData();
  };

  const handleLinkCandidate = async (statementId: number, transactionId: number) => {
    setLinkingStatementId(statementId);
    setPageError("");
    try {
      await incomeSourcesService.linkTransaction(statementId, transactionId);
      showSuccess("Credito bancario conciliado com sucesso.");
      await reloadIncomeData();
    } catch (error) {
      setPageError(getApiErrorMessage(error, "Não foi possível conciliar o crédito bancário."));
    } finally {
      setLinkingStatementId(null);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────────

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
            <h1 className="text-xl font-bold text-cf-text-primary">Fontes de Renda</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsImportOpen(true)}
              className="rounded border border-cf-border px-4 py-2 text-sm font-semibold text-cf-text-secondary hover:bg-cf-bg-subtle hover:text-cf-text-primary"
            >
              Importar extrato
            </button>
            <button
              type="button"
              onClick={openCreateSourceModal}
              className="rounded bg-brand-1 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-2"
            >
              + Nova fonte
            </button>
          </div>
        </div>

        {/* Feedback */}
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

        {/* List */}
        {isLoading ? (
          <p className="py-4 text-center text-sm text-cf-text-secondary">Carregando...</p>
        ) : sources.length === 0 ? (
          <p className="py-4 text-center text-sm text-cf-text-secondary">
            Nenhuma fonte de renda cadastrada.
          </p>
        ) : (
          <div className="space-y-4">
            {sources.map((source) => (
              <div
                key={source.id}
                className="rounded border border-cf-border bg-cf-surface p-4"
              >
                {/* Source header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-cf-text-primary">{source.name}</p>
                    {source.defaultDay ? (
                      <p className="text-xs text-cf-text-secondary">
                        Dia de credito: {source.defaultDay}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => openStatementModal(source)}
                      className="rounded border border-brand-1 px-2 py-1 text-xs font-semibold text-brand-1 hover:bg-brand-1/10"
                    >
                      Gerar extrato
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditSourceModal(source)}
                      className="rounded border border-cf-border px-2 py-1 text-xs font-semibold text-cf-text-primary hover:bg-cf-bg-subtle"
                    >
                      Editar
                    </button>
                    {confirmingDeleteSourceId === source.id ? (
                      <span className="flex items-center gap-1">
                        <span className="text-xs text-cf-text-secondary">Confirmar?</span>
                        <button
                          type="button"
                          onClick={() => void handleDeleteSourceConfirm(source.id)}
                          className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                        >
                          Sim
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingDeleteSourceId(null)}
                          className="rounded border border-cf-border px-2 py-1 text-xs font-semibold text-cf-text-secondary hover:bg-cf-bg-subtle"
                        >
                          Cancelar
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteSourceId(source.id)}
                        className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        Excluir
                      </button>
                    )}
                  </div>
                </div>

                {/* Deductions */}
                <div className="mt-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase text-cf-text-secondary">
                      Descontos ({source.deductions.length})
                    </p>
                    <button
                      type="button"
                      onClick={() => openAddDeductionModal(source.id)}
                      className="text-xs font-semibold text-brand-1 hover:underline"
                    >
                      + Adicionar
                    </button>
                  </div>

                  {source.deductions.length > 0 ? (
                    <div className="mt-1.5 divide-y divide-cf-border rounded border border-cf-border">
                      {source.deductions.map((ded) => (
                        <div key={ded.id} className="flex items-center justify-between px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-cf-text-primary">{ded.label}</span>
                            {ded.isVariable ? (
                              <span className="rounded bg-cf-bg-subtle px-1 py-0.5 text-xs text-cf-text-secondary">
                                variavel
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-red-600">
                              -{formatCurrency(ded.amount)}
                            </span>
                            <button
                              type="button"
                              onClick={() => openEditDeductionModal(source.id, ded)}
                              className="text-xs text-cf-text-secondary hover:text-cf-text-primary"
                            >
                              Editar
                            </button>
                            {confirmingDeleteDeductionId === ded.id ? (
                              <span className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteDeductionConfirm(ded.id)}
                                  className="text-xs font-semibold text-red-700"
                                >
                                  Sim
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmingDeleteDeductionId(null)}
                                  className="text-xs text-cf-text-secondary"
                                >
                                  Não
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmingDeleteDeductionId(ded.id)}
                                className="text-xs text-red-600 hover:text-red-700"
                              >
                                Remover
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-cf-text-secondary">
                      Nenhum desconto cadastrado.
                    </p>
                  )}
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase text-cf-text-secondary">
                      Extratos recentes ({(statementsBySource[source.id] ?? []).length})
                    </p>
                    {isLoadingStatements ? (
                      <span className="text-xs text-cf-text-secondary">Atualizando...</span>
                    ) : null}
                  </div>

                  {(statementsBySource[source.id] ?? []).length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {(statementsBySource[source.id] ?? []).slice(0, 3).map((statement) => {
                        const reconciliation = statement.reconciliation;
                        const badge = getReconciliationBadge(reconciliation?.status ?? "pending");
                        const statementStatusBadge = getStatementStatusBadge(statement.status);

                        return (
                          <div
                            key={statement.id}
                            className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-cf-text-primary">
                                  Competência {statement.referenceMonth}
                                </p>
                                <p className="text-xs text-cf-text-secondary">
                                  Líquido {formatCurrency(statement.netAmount)}
                                  {statement.paymentDate ? ` · Pago em ${statement.paymentDate}` : ""}
                                </p>
                              </div>
                              <div className="flex items-center gap-1">
                                <span
                                  className={`rounded border px-2 py-0.5 text-xs font-semibold ${statementStatusBadge.className}`}
                                >
                                  {statementStatusBadge.label}
                                </span>
                                <span
                                  className={`rounded border px-2 py-0.5 text-xs font-semibold ${badge.className}`}
                                >
                                  {badge.label}
                                </span>
                              </div>
                            </div>

                            {reconciliation ? (
                              <div className="mt-2 space-y-2">
                                <p className="text-xs text-cf-text-secondary">
                                  {reconciliation.summary}
                                </p>

                                {reconciliation.linkedTransaction ? (
                                  <div className="rounded border border-cf-border bg-cf-surface px-2 py-2 text-xs text-cf-text-secondary">
                                    <p className="font-medium text-cf-text-primary">
                                      {reconciliation.linkedTransaction.importSessionId
                                        ? "Crédito conciliado"
                                        : "Entrada vinculada"}
                                    </p>
                                    <p>
                                      {formatCurrency(reconciliation.linkedTransaction.value)} em{" "}
                                      {reconciliation.linkedTransaction.date}
                                      {reconciliation.linkedTransaction.description
                                        ? ` · ${reconciliation.linkedTransaction.description}`
                                        : ""}
                                    </p>
                                  </div>
                                ) : null}

                                {(reconciliation.status === "candidate" ||
                                  reconciliation.status === "conflict") &&
                                reconciliation.candidates.length > 0 ? (
                                  <div className="space-y-1">
                                    {reconciliation.candidates.slice(0, 3).map((candidate) => (
                                      <button
                                        key={candidate.id}
                                        type="button"
                                        onClick={() => void handleLinkCandidate(statement.id, candidate.id)}
                                        disabled={linkingStatementId === statement.id}
                                        className="w-full rounded border border-brand-1 px-2 py-1.5 text-left text-xs font-semibold text-brand-1 hover:bg-brand-1/10 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        Vincular crédito de {candidate.date} · {formatCurrency(candidate.value)}
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-cf-text-secondary">
                      Nenhum extrato registrado para esta fonte ainda.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <IncomeSourceModal
        isOpen={isSourceModalOpen}
        onClose={closeSourceModal}
        onSaved={handleSourceSaved}
        initialSource={editingSource}
        categories={categories}
      />

      {deductionContext ? (
        <IncomeDeductionModal
          isOpen={isDeductionModalOpen}
          onClose={closeDeductionModal}
          onSaved={handleDeductionSaved}
          sourceId={deductionContext.sourceId}
          initialDeduction={deductionContext.deduction}
        />
      ) : null}

      {statementSource ? (
        <IncomeStatementModal
          isOpen={isStatementModalOpen}
          onClose={closeStatementModal}
          sourceId={statementSource.id}
          sourceName={statementSource.name}
          activeDeductions={statementSource.deductions}
          onDraftSaved={handleDraftSaved}
          onPosted={handlePosted}
        />
      ) : null}
      <ImportCsvModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
      />
    </div>
  );
};

export default IncomeSourcesPage;
