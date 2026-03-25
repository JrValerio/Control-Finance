import { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { transactionsService } from "../services/transactions.service";
import { formatCurrency } from "../utils/formatCurrency";
import { getApiErrorMessage } from "../utils/apiError";

const ImportCsvModal = ({ isOpen, onClose, onImported = undefined }) => {
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [dryRunResult, setDryRunResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

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
      const commitResult = await transactionsService.commitImportCsv(dryRunResult.importId);

      if (onImported) {
        await onImported(commitResult);
        return;
      }

      setSuccessMessage(`Importação concluída com sucesso (${commitResult.imported} linhas).`);
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
                <ul className="space-y-0.5">
                  {suggestionCard.lines.map((line) => (
                    <li key={line} className="text-xs text-blue-700 dark:text-blue-300">{line}</li>
                  ))}
                </ul>
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
              <div className="max-h-80 overflow-auto rounded border border-cf-border">
                <table className="min-w-full border-collapse text-left text-xs">
                  <thead className="bg-cf-bg-subtle">
                    <tr>
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
                        <td className="border-b border-cf-border px-2 py-2 text-cf-text-primary">
                          {row.raw.category ? (
                            row.raw.category
                          ) : row.status === "valid" ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                                Revisar
                              </span>
                              <span className="text-cf-text-secondary">Sem categoria</span>
                            </span>
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
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

ImportCsvModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onImported: PropTypes.func,
};

export default ImportCsvModal;
