import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { transactionsService } from "../services/transactions.service";
import { profileService } from "../services/profile.service";
import { categoriesService } from "../services/categories.service";
import { formatCurrency } from "../utils/formatCurrency";
import { getApiErrorMessage } from "../utils/apiError";
import BillModal from "./BillModal";

const ImportCsvModal = ({ isOpen, onClose, onImported = undefined }) => {
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [dryRunResult, setDryRunResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showProfileConfirm, setShowProfileConfirm] = useState(false);
  const [isApplyingProfile, setIsApplyingProfile] = useState(false);
  const [profileApplied, setProfileApplied] = useState(false);
  const [categories, setCategories] = useState([]);
  // categoryOverrides: Record<line, categoryId | null>
  const [categoryOverrides, setCategoryOverrides] = useState({});
  // inlineCreate: { line, type } | null — which row's inline form is open
  const [inlineCreate, setInlineCreate] = useState(null);
  const [inlineCreateName, setInlineCreateName] = useState("");
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  // post-commit state
  const [lastCommitResult, setLastCommitResult] = useState(null);
  const [isUndoing, setIsUndoing] = useState(false);
  // bill bridge
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [billCreated, setBillCreated] = useState(false);
  // batch category
  const [selectedPreviewLines, setSelectedPreviewLines] = useState(new Set());
  const [batchCategoryId, setBatchCategoryId] = useState("");

  useEffect(() => {
    if (isOpen) {
      return;
    }

    setSelectedFile(null);
    setIsDryRunning(false);
    setIsCommitting(false);
    setDryRunResult(null);
    setErrorMessage("");
    setSuccessMessage("");
    setShowProfileConfirm(false);
    setIsApplyingProfile(false);
    setProfileApplied(false);
    setCategoryOverrides({});
    setInlineCreate(null);
    setInlineCreateName("");
    setLastCommitResult(null);
    setIsUndoing(false);
    setIsBillModalOpen(false);
    setBillCreated(false);
    setSelectedPreviewLines(new Set());
    setBatchCategoryId("");
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    fileInputRef.current?.focus();

    const handleEscapeKey = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscapeKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscapeKey);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    categoriesService.listCategories().then(setCategories).catch(() => {});
  }, [isOpen]);

  const hasValidRows = useMemo(() => {
    return (dryRunResult?.summary?.validRows || 0) > 0;
  }, [dryRunResult]);

  const hasDuplicates = useMemo(() => {
    return (dryRunResult?.summary?.duplicateRows || 0) > 0;
  }, [dryRunResult]);

  const documentTypeBadge = useMemo(() => {
    switch (dryRunResult?.documentType) {
      case "bank_statement":
        return { label: "Extrato bancário", className: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-400" };
      case "income_statement_inss":
        return { label: "Comprovante INSS", className: "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-950/40 dark:text-purple-400" };
      case "utility_bill_energy":
        return { label: "Conta de energia", className: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400" };
      case "utility_bill_water":
        return { label: "Conta de água", className: "border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400" };
      default:
        return null;
    }
  }, [dryRunResult]);

  const isUtilityBill = useMemo(() => {
    return (
      dryRunResult?.documentType === "utility_bill_energy" ||
      dryRunResult?.documentType === "utility_bill_water"
    );
  }, [dryRunResult]);

  const suggestionCard = useMemo(() => {
    const suggestion = dryRunResult?.suggestion;
    if (!suggestion) return null;

    if (suggestion.type === "profile") {
      const lines = [];
      if (suggestion.referenceMonth) lines.push(`Competência: ${suggestion.referenceMonth}`);
      if (suggestion.paymentDate) lines.push(`Pagamento: ${suggestion.paymentDate}`);
      if (suggestion.netAmount != null) lines.push(`Líquido: R$ ${suggestion.netAmount.toFixed(2).replace(".", ",")}`);
      if (suggestion.grossAmount != null) lines.push(`Bruto (MR): R$ ${suggestion.grossAmount.toFixed(2).replace(".", ",")}`);
      if (suggestion.benefitKind) lines.push(`Espécie: ${suggestion.benefitKind}`);
      return { kind: "profile", lines };
    }

    if (suggestion.type === "bill") {
      const lines = [];
      if (suggestion.issuer) lines.push(`Emissor: ${suggestion.issuer}`);
      if (suggestion.referenceMonth) lines.push(`Referência: ${suggestion.referenceMonth}`);
      if (suggestion.dueDate) lines.push(`Vencimento: ${suggestion.dueDate}`);
      if (suggestion.amountDue != null) lines.push(`Total a pagar: R$ ${suggestion.amountDue.toFixed(2).replace(".", ",")}`);
      if (suggestion.customerCode) lines.push(`Código: ${suggestion.customerCode}`);
      return { kind: "bill", lines };
    }

    return null;
  }, [dryRunResult]);

  const profilePatch = useMemo(() => {
    const suggestion = dryRunResult?.suggestion;
    if (suggestion?.type !== "profile") return null;
    const patch = {};
    if (suggestion.netAmount != null) patch.salary_monthly = suggestion.netAmount;
    if (suggestion.paymentDate) {
      const day = new Date(`${suggestion.paymentDate}T12:00:00Z`).getUTCDate();
      if (day >= 1 && day <= 31) patch.payday = day;
    }
    return Object.keys(patch).length > 0 ? patch : null;
  }, [dryRunResult]);

  const billPrefill = useMemo(() => {
    const suggestion = dryRunResult?.suggestion;
    if (suggestion?.type !== "bill") return null;
    const typeLabel = suggestion.billType === "energy" ? "Conta de energia" : "Conta de água";
    const title = suggestion.issuer ? `${typeLabel} — ${suggestion.issuer}` : typeLabel;
    return {
      title,
      amount: suggestion.amountDue ?? undefined,
      dueDate: suggestion.dueDate ?? undefined,
      referenceMonth: suggestion.referenceMonth ?? undefined,
      billType: suggestion.billType ?? undefined,
      sourceImportSessionId: dryRunResult?.importId ?? undefined,
    };
  }, [dryRunResult]);

  const handleApplyProfile = async () => {
    if (!profilePatch) return;
    setIsApplyingProfile(true);
    setErrorMessage("");
    try {
      await profileService.updateProfile(profilePatch);
      setProfileApplied(true);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Não foi possível atualizar o perfil."));
    } finally {
      setIsApplyingProfile(false);
      setShowProfileConfirm(false);
    }
  };

  const validPreviewLines = useMemo(
    () => (dryRunResult?.rows ?? []).filter((r) => r.status === "valid").map((r) => r.line),
    [dryRunResult],
  );

  const togglePreviewLine = (line) => {
    setSelectedPreviewLines((prev) => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line); else next.add(line);
      return next;
    });
  };

  const toggleSelectAllPreview = () => {
    if (selectedPreviewLines.size === validPreviewLines.length) {
      setSelectedPreviewLines(new Set());
    } else {
      setSelectedPreviewLines(new Set(validPreviewLines));
    }
  };

  const handleApplyBatchCategory = () => {
    if (selectedPreviewLines.size === 0) return;
    const val = batchCategoryId === "" ? null : Number(batchCategoryId);
    setCategoryOverrides((prev) => {
      const next = { ...prev };
      selectedPreviewLines.forEach((line) => { next[line] = val; });
      return next;
    });
    setSelectedPreviewLines(new Set());
    setBatchCategoryId("");
  };

  const handleInlineCreateCategory = useCallback(
    async (line, rowType) => {
      const trimmedName = inlineCreateName.trim();
      if (!trimmedName) return;
      setIsCreatingCategory(true);
      try {
        const inferredType = rowType === "Entrada" ? "income" : rowType === "Saida" ? "expense" : undefined;
        const created = await categoriesService.createCategory(trimmedName, inferredType);
        setCategories((prev) => [...prev, created]);
        setCategoryOverrides((prev) => ({ ...prev, [line]: created.id }));
        setInlineCreate(null);
        setInlineCreateName("");
      } catch {
        // silently fail — user can try again
      } finally {
        setIsCreatingCategory(false);
      }
    },
    [inlineCreateName],
  );

  const handleDryRun = async () => {
    if (!selectedFile) {
      setErrorMessage("Selecione um arquivo CSV, OFX ou PDF.");
      setSuccessMessage("");
      return;
    }

    setIsDryRunning(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const result = await transactionsService.dryRunImportCsv(selectedFile);
      setDryRunResult(result);
    } catch (error) {
      setDryRunResult(null);
      setErrorMessage(getApiErrorMessage(error, "Não foi possível processar o arquivo do extrato."));
    } finally {
      setIsDryRunning(false);
    }
  };

  const handleCommit = async () => {
    if (!dryRunResult?.importId) {
      setErrorMessage("Rode a pré-visualização antes de importar.");
      return;
    }

    if (!hasValidRows) {
      setErrorMessage("Não há linhas válidas para importar.");
      return;
    }

    setIsCommitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const overridesArray = Object.entries(categoryOverrides).map(([line, categoryId]) => ({
        line: Number(line),
        categoryId: categoryId ?? null,
      }));
      const commitResult = await transactionsService.commitImportCsv(dryRunResult.importId, overridesArray);
      setLastCommitResult(commitResult);
    } catch (error) {
      const apiMessage = getApiErrorMessage(error, "Não foi possível confirmar a importação.");
      setErrorMessage(
        apiMessage === "Sessão de importação expirada."
          ? "Sessão de importação expirada. Rode a pré-visualização novamente."
          : apiMessage,
      );
    } finally {
      setIsCommitting(false);
    }
  };

  const handleCloseAfterCommit = async () => {
    if (onImported) await onImported(lastCommitResult);
    else onClose();
  };

  const handleUndo = async () => {
    if (!lastCommitResult?.importSessionId) return;
    setIsUndoing(true);
    setErrorMessage("");
    try {
      await transactionsService.deleteImportSession(lastCommitResult.importSessionId);
      if (onImported) await onImported(null);
      else onClose();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Não foi possível desfazer a importação."));
      setIsUndoing(false);
    }
  };

  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex min-h-screen items-start justify-center bg-black/50 p-6 sm:items-center"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        className="w-full max-w-4xl rounded-lg bg-cf-surface p-4 sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-csv-modal-title"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="import-csv-modal-title" className="text-lg font-semibold text-cf-text-primary">
            Importar extrato
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-ui-200 transition-colors hover:text-ui-100"
            aria-label="Fechar modal de importação de extrato"
          >
            X
          </button>
        </div>

        <p className="mb-4 text-sm text-cf-text-secondary">
          Envie um CSV, OFX ou PDF de extrato para pré-visualizar as transações válidas antes de importar.
        </p>

        <div className="rounded border border-cf-border bg-cf-surface p-3">
          <label
            htmlFor="csv-file-input"
            className="mb-1 block text-sm font-medium text-cf-text-primary"
          >
            Arquivo do extrato
          </label>
          <input
            ref={fileInputRef}
            id="csv-file-input"
            type="file"
            accept=".csv,.ofx,.pdf,text/csv,application/ofx,application/pdf"
            onChange={(event) => {
              const nextFile = event.target.files?.[0] || null;
              setSelectedFile(nextFile);
              setDryRunResult(null);
              setErrorMessage("");
              setSuccessMessage("");
              setProfileApplied(false);
              setShowProfileConfirm(false);
              setCategoryOverrides({});
              setInlineCreate(null);
              setInlineCreateName("");
            }}
            className="block w-full text-sm text-cf-text-primary file:mr-3 file:rounded file:border file:border-cf-border file:bg-cf-bg-subtle file:px-3 file:py-1 file:text-sm file:font-semibold file:text-cf-text-primary hover:file:bg-cf-border"
          />
          <p className="mt-2 text-xs text-cf-text-secondary">
            OFX é o formato preferencial quando o banco oferecer. CSV manual, CSV exportado por banco e PDF com OCR assistido entram como alternativas.
          </p>
          <p className="mt-1 text-xs text-cf-text-secondary">
            Quando possível, a plataforma sugere automaticamente categorias com base nas descrições e nas categorias já cadastradas.
          </p>
        </div>

        {lastCommitResult ? (
          <div className="mt-3 rounded border border-green-200 bg-green-50 px-3 py-3 dark:border-green-800 dark:bg-green-950/40">
            <p className="mb-2 text-sm font-semibold text-green-700 dark:text-green-400">
              {lastCommitResult.imported === 1
                ? "1 lançamento importado."
                : `${lastCommitResult.imported} lançamentos importados.`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCloseAfterCommit}
                disabled={isUndoing}
                className="rounded border border-green-400 bg-green-100 px-3 py-1.5 text-sm font-semibold text-green-700 hover:bg-green-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-green-700 dark:bg-green-900/40 dark:text-green-300"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={handleUndo}
                disabled={isUndoing}
                className="rounded border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-700 dark:bg-red-950/40 dark:text-red-400"
              >
                {isUndoing ? "Desfazendo..." : "Desfazer importação"}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDryRun}
              disabled={isDryRunning || isCommitting}
              className="rounded border border-brand-1 bg-brand-1 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDryRunning ? "Processando..." : "Pré-visualizar"}
            </button>
            <button
              type="button"
              onClick={handleCommit}
              disabled={!hasValidRows || isDryRunning || isCommitting}
              className="rounded border border-cf-border bg-cf-surface px-3 py-1.5 text-sm font-semibold text-cf-text-primary hover:bg-cf-bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCommitting ? "Importando..." : "Importar"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-1.5 text-sm font-semibold text-cf-text-secondary"
            >
              Fechar
            </button>
          </div>
        )}

        {errorMessage ? (
          <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {successMessage ? (
          <div className="mt-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            {successMessage}
          </div>
        ) : null}

        {dryRunResult ? (
          <div className="mt-4 space-y-3">
            {documentTypeBadge ? (
              <div className="flex items-center gap-2">
                <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${documentTypeBadge.className}`}>
                  {documentTypeBadge.label}
                </span>
              </div>
            ) : null}

            {isUtilityBill ? (
              <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                Boleto detectado. O suporte completo à importação de contas de energia e água chegará em breve. Por enquanto, nenhuma transação é extraída.
              </div>
            ) : null}

            {suggestionCard ? (
              <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-800 dark:bg-blue-950/40">
                <p className="mb-1 text-xs font-semibold uppercase text-blue-700 dark:text-blue-400">
                  {suggestionCard.kind === "profile" ? "Dados extraídos do comprovante" : "Dados do boleto"}
                </p>
                <ul className="mb-2 space-y-0.5">
                  {suggestionCard.lines.map((line) => (
                    <li key={line} className="text-xs text-blue-700 dark:text-blue-300">{line}</li>
                  ))}
                </ul>
                {suggestionCard.kind === "profile" && profilePatch && !profileApplied ? (
                  showProfileConfirm ? (
                    <div className="mt-2 rounded border border-blue-300 bg-blue-100 px-3 py-2 dark:border-blue-700 dark:bg-blue-900/40">
                      <p className="mb-2 text-xs font-semibold text-blue-800 dark:text-blue-200">
                        Confirmar atualização do perfil?
                      </p>
                      <ul className="mb-3 space-y-0.5">
                        {profilePatch.salary_monthly != null && (
                          <li className="text-xs text-blue-700 dark:text-blue-300">
                            Renda líquida mensal → R$ {profilePatch.salary_monthly.toFixed(2).replace(".", ",")}
                          </li>
                        )}
                        {profilePatch.payday != null && (
                          <li className="text-xs text-blue-700 dark:text-blue-300">
                            Dia de pagamento → dia {profilePatch.payday}
                          </li>
                        )}
                      </ul>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleApplyProfile}
                          disabled={isApplyingProfile}
                          className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          {isApplyingProfile ? "Salvando..." : "Confirmar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowProfileConfirm(false)}
                          disabled={isApplyingProfile}
                          className="rounded border border-blue-300 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300 disabled:opacity-60"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowProfileConfirm(true)}
                      className="mt-1 rounded border border-blue-400 bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-200 dark:border-blue-600 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-800/40"
                    >
                      Atualizar perfil com esses dados
                    </button>
                  )
                ) : null}
                {suggestionCard.kind === "profile" && profileApplied ? (
                  <p className="mt-1 text-xs font-semibold text-green-600 dark:text-green-400">
                    Perfil atualizado com sucesso.
                  </p>
                ) : null}
                {suggestionCard.kind === "bill" && !billCreated ? (
                  <button
                    type="button"
                    onClick={() => setIsBillModalOpen(true)}
                    className="mt-1 rounded border border-blue-400 bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-200 dark:border-blue-600 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-800/40"
                  >
                    Criar pendência
                  </button>
                ) : null}
                {suggestionCard.kind === "bill" && billCreated ? (
                  <p className="mt-1 text-xs font-semibold text-green-600 dark:text-green-400">
                    Pendência criada com sucesso.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2">
                <p className="text-xs font-medium uppercase text-cf-text-secondary">Total</p>
                <p className="text-sm font-semibold text-cf-text-primary">{dryRunResult.summary.totalRows}</p>
              </div>
              <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2">
                <p className="text-xs font-medium uppercase text-cf-text-secondary">Válidas</p>
                <p className="text-sm font-semibold text-cf-text-primary">{dryRunResult.summary.validRows}</p>
              </div>
              <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2">
                <p className="text-xs font-medium uppercase text-cf-text-secondary">Inválidas</p>
                <p className="text-sm font-semibold text-cf-text-primary">{dryRunResult.summary.invalidRows}</p>
              </div>
              <div className={`rounded border px-3 py-2 ${hasDuplicates ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40" : "border-cf-border bg-cf-bg-subtle"}`}>
                <p className="text-xs font-medium uppercase text-cf-text-secondary">Duplicadas</p>
                <p className={`text-sm font-semibold ${hasDuplicates ? "text-red-600 dark:text-red-400" : "text-cf-text-primary"}`}>{dryRunResult.summary.duplicateRows ?? 0}</p>
              </div>
              <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2">
                <p className="text-xs font-medium uppercase text-cf-text-secondary">Entradas</p>
                <p className="text-sm font-semibold text-cf-text-primary">
                  {formatCurrency(dryRunResult.summary.income)}
                </p>
              </div>
              <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-2">
                <p className="text-xs font-medium uppercase text-cf-text-secondary">Saídas</p>
                <p className="text-sm font-semibold text-cf-text-primary">
                  {formatCurrency(dryRunResult.summary.expense)}
                </p>
              </div>
            </div>

            <p className="text-xs text-cf-text-secondary">
              Sessão expira em: {dryRunResult.expiresAt || "não informado"}
            </p>

            {dryRunResult.rows.length === 0 ? (
              <div className="rounded border border-cf-border bg-cf-surface px-3 py-2 text-sm text-cf-text-secondary">
                Sem linhas para pré-visualizar.
              </div>
            ) : (
              <>
                {selectedPreviewLines.size > 0 && (
                  <div className="mb-1 flex flex-wrap items-center gap-2 rounded border border-brand-1/40 bg-brand-1/5 px-3 py-2">
                    <span className="text-xs font-medium text-cf-text-primary">
                      {selectedPreviewLines.size} {selectedPreviewLines.size === 1 ? "linha selecionada" : "linhas selecionadas"}
                    </span>
                    <select
                      aria-label="Categoria para aplicar em lote"
                      value={batchCategoryId}
                      onChange={(e) => setBatchCategoryId(e.target.value)}
                      className="rounded border border-cf-border bg-cf-surface px-1 py-0.5 text-xs text-cf-text-primary"
                    >
                      <option value="">— Sem categoria —</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleApplyBatchCategory}
                      className="rounded border border-brand-1 bg-brand-1 px-2 py-0.5 text-xs font-semibold text-white hover:opacity-90"
                    >
                      Aplicar categoria
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedPreviewLines(new Set())}
                      className="rounded border border-cf-border px-2 py-0.5 text-xs text-cf-text-secondary hover:bg-cf-bg-subtle"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              <div className="max-h-80 overflow-auto rounded border border-cf-border">
                <table className="min-w-full border-collapse text-left text-xs">
                  <thead className="bg-cf-bg-subtle">
                    <tr>
                      <th className="border-b border-cf-border px-2 py-2">
                        <input
                          type="checkbox"
                          aria-label="Selecionar todas as linhas válidas"
                          checked={validPreviewLines.length > 0 && selectedPreviewLines.size === validPreviewLines.length}
                          onChange={toggleSelectAllPreview}
                          className="h-3.5 w-3.5 cursor-pointer accent-brand-1"
                        />
                      </th>
                      <th className="border-b border-cf-border px-2 py-2 text-cf-text-primary">Linha</th>
                      <th className="border-b border-cf-border px-2 py-2 text-cf-text-primary">Status</th>
                      <th className="border-b border-cf-border px-2 py-2 text-cf-text-primary">Descricao</th>
                      <th className="border-b border-cf-border px-2 py-2 text-cf-text-primary">Valor</th>
                      <th className="border-b border-cf-border px-2 py-2 text-cf-text-primary">Data</th>
                      <th className="border-b border-cf-border px-2 py-2 text-cf-text-primary">Categoria</th>
                      <th className="border-b border-cf-border px-2 py-2 text-cf-text-primary">Erros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dryRunResult.rows.map((row) => (
                      <tr key={`import-row-${row.line}`} className="align-top">
                        <td className="border-b border-cf-border px-2 py-2">
                          {row.status === "valid" ? (
                            <input
                              type="checkbox"
                              aria-label={`Selecionar linha ${row.line}`}
                              checked={selectedPreviewLines.has(row.line)}
                              onChange={() => togglePreviewLine(row.line)}
                              className="h-3.5 w-3.5 cursor-pointer accent-brand-1"
                            />
                          ) : null}
                        </td>
                        <td className="border-b border-cf-border px-2 py-2 text-cf-text-primary">{row.line}</td>
                        <td className="border-b border-cf-border px-2 py-2">
                          <span
                            className={`rounded px-2 py-0.5 font-semibold ${
                              row.status === "valid"
                                ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                                : row.status === "duplicate"
                                  ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                                  : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                            }`}
                          >
                            {row.status === "valid"
                              ? "Valida"
                              : row.status === "duplicate"
                                ? "Duplicada"
                                : "Invalida"}
                          </span>
                          {row.status === "duplicate" && (
                            <span className="ml-1.5 text-xs text-cf-text-secondary">já existe</span>
                          )}
                        </td>
                        <td className="border-b border-cf-border px-2 py-2 text-cf-text-primary">
                          {row.raw.description || "-"}
                        </td>
                        <td className="border-b border-cf-border px-2 py-2 text-cf-text-primary">
                          {row.raw.value || "-"}
                        </td>
                        <td className="border-b border-cf-border px-2 py-2 text-cf-text-primary">{row.raw.date || "-"}</td>
                        <td className="border-b border-cf-border px-2 py-2">
                          {row.status === "valid" ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1">
                                <select
                                  aria-label={`Categoria da linha ${row.line}`}
                                  value={
                                    categoryOverrides[row.line] !== undefined
                                      ? categoryOverrides[row.line] ?? ""
                                      : row.normalized?.categoryId ?? ""
                                  }
                                  onChange={(e) => {
                                    const val = e.target.value === "" ? null : Number(e.target.value);
                                    setCategoryOverrides((prev) => ({ ...prev, [row.line]: val }));
                                  }}
                                  className="rounded border border-cf-border bg-cf-surface px-1 py-0.5 text-xs text-cf-text-primary"
                                >
                                  <option value="">— Sem categoria —</option>
                                  {categories.map((cat) => (
                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                  ))}
                                </select>
                                {inlineCreate?.line !== row.line && (
                                  <button
                                    type="button"
                                    title="Nova categoria"
                                    onClick={() => { setInlineCreate({ line: row.line, type: row.raw.type }); setInlineCreateName(""); }}
                                    className="rounded border border-cf-border px-1 py-0.5 text-xs text-cf-text-secondary hover:bg-cf-bg-subtle"
                                  >
                                    +
                                  </button>
                                )}
                              </div>
                              {inlineCreate?.line === row.line && (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={inlineCreateName}
                                    onChange={(e) => setInlineCreateName(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") handleInlineCreateCategory(row.line, row.raw.type); if (e.key === "Escape") setInlineCreate(null); }}
                                    placeholder="Nova categoria"
                                    className="rounded border border-cf-border bg-cf-surface px-1 py-0.5 text-xs text-cf-text-primary"
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    disabled={isCreatingCategory}
                                    onClick={() => handleInlineCreateCategory(row.line, row.raw.type)}
                                    className="rounded border border-brand-1 bg-brand-1 px-1.5 py-0.5 text-xs text-white disabled:opacity-60"
                                  >
                                    OK
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setInlineCreate(null)}
                                    className="rounded border border-cf-border px-1.5 py-0.5 text-xs text-cf-text-secondary"
                                  >
                                    ✕
                                  </button>
                                </div>
                              )}
                              {!categoryOverrides[row.line] && !row.normalized?.categoryId && inlineCreate?.line !== row.line && (
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                                    Revisar
                                  </span>
                                </span>
                              )}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="border-b border-cf-border px-2 py-2 text-cf-text-primary">
                          {row.errors.length > 0
                            ? row.errors.map((error) => error.message).join(" | ")
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        ) : null}
      </div>

      <BillModal
        isOpen={isBillModalOpen}
        onClose={() => setIsBillModalOpen(false)}
        onSaved={() => {
          setIsBillModalOpen(false);
          setBillCreated(true);
        }}
        prefill={billPrefill}
        categories={categories}
      />
    </div>
  );
};

ImportCsvModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onImported: PropTypes.func,
};

export default ImportCsvModal;
