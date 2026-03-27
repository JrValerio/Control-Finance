import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { transactionsService } from "../services/transactions.service";
import { formatCurrency } from "../utils/formatCurrency";
import { getApiErrorMessage } from "../utils/apiError";
import ConfirmDialog from "./ConfirmDialog";

const DEFAULT_LIMIT = 20;

const formatDateTime = (value) => {
  if (!value) {
    return "-";
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return "-";
  }

  return parsedDate.toLocaleString("pt-BR");
};

const resolveImportStatus = (item) => {
  if (item.committedAt) {
    return {
      label: item.summary.imported > 0 ? "Committed" : "Reverted",
      className:
        item.summary.imported > 0
          ? "bg-green-100 text-green-700"
          : "bg-slate-100 text-slate-700",
    };
  }

  const expiresAtTimestamp = Date.parse(item.expiresAt || "");

  if (Number.isFinite(expiresAtTimestamp) && Date.now() > expiresAtTimestamp) {
    return {
      label: "Expired",
      className: "bg-red-100 text-red-700",
    };
  }

  return {
    label: "Pending",
    className: "bg-yellow-100 text-yellow-700",
  };
};

const formatDocumentType = (value) => {
  switch (String(value || "").trim()) {
    case "bank_statement":
      return "Extrato bancário";
    case "income_statement_inss":
      return "Comprovante INSS";
    case "utility_bill_energy":
      return "Conta de energia";
    case "utility_bill_water":
      return "Conta de água";
    default:
      return "Importação";
  }
};

const ImportHistoryModal = ({ isOpen, onClose, onImportSessionReverted = undefined }) => {
  const closeButtonRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [items, setItems] = useState([]);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [offset, setOffset] = useState(0);
  const [undoingSessionId, setUndoingSessionId] = useState(null);
  const [pendingUndoItem, setPendingUndoItem] = useState(null);

  const loadImportHistory = useCallback(async (nextOffset = 0, nextLimit = DEFAULT_LIMIT) => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const response = await transactionsService.getImportHistory({
        limit: nextLimit,
        offset: nextOffset,
      });
      setItems(Array.isArray(response.items) ? response.items : []);
      setLimit(Number(response.pagination?.limit) || nextLimit);
      setOffset(Number(response.pagination?.offset) || 0);
    } catch (error) {
      setItems([]);
      setErrorMessage(getApiErrorMessage(error, "Não foi possível carregar o histórico de imports."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      return;
    }

    setIsLoading(false);
    setErrorMessage("");
    setSuccessMessage("");
    setItems([]);
    setLimit(DEFAULT_LIMIT);
    setOffset(0);
    setUndoingSessionId(null);
    setPendingUndoItem(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    void loadImportHistory(0, DEFAULT_LIMIT);

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
  }, [isOpen, loadImportHistory, onClose]);

  const hasPreviousPage = offset > 0;
  const hasNextPage = items.length === limit;
  const rangeStart = items.length > 0 ? offset + 1 : 0;
  const rangeEnd = offset + items.length;

  const rowsWithStatus = useMemo(() => {
    return items.map((item) => ({
      ...item,
      status: resolveImportStatus(item),
    }));
  }, [items]);

  const handlePreviousPage = () => {
    if (!hasPreviousPage || isLoading) {
      return;
    }

    const previousOffset = Math.max(offset - limit, 0);
    void loadImportHistory(previousOffset, limit);
  };

  const handleNextPage = () => {
    if (!hasNextPage || isLoading) {
      return;
    }

    void loadImportHistory(offset + limit, limit);
  };

  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleConfirmUndo = useCallback(async () => {
    if (!pendingUndoItem?.id) {
      return;
    }

    setUndoingSessionId(pendingUndoItem.id);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await transactionsService.deleteImportSession(pendingUndoItem.id);

      if (onImportSessionReverted) {
        await onImportSessionReverted(pendingUndoItem.id);
      }

      await loadImportHistory(offset, limit);
      setSuccessMessage("Importação desfeita com sucesso.");
      setPendingUndoItem(null);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Não foi possível desfazer a importação."));
    } finally {
      setUndoingSessionId(null);
    }
  }, [limit, loadImportHistory, offset, onImportSessionReverted, pendingUndoItem]);

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
        className="w-full max-w-5xl rounded-lg bg-cf-surface p-4 sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-history-modal-title"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="import-history-modal-title" className="text-lg font-semibold text-cf-text-primary">
            Histórico de imports
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="text-ui-200 transition-colors hover:text-ui-100"
            aria-label="Fechar modal de histórico de imports"
          >
            X
          </button>
        </div>

        {errorMessage ? (
          <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <p>{errorMessage}</p>
            <button
              type="button"
              onClick={() => void loadImportHistory(offset, limit)}
              className="mt-2 rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              Tentar novamente
            </button>
          </div>
        ) : null}

        {successMessage ? (
          <div className="mb-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            {successMessage}
          </div>
        ) : null}

        {isLoading ? (
          <div className="rounded border border-cf-border bg-cf-surface px-3 py-3 text-sm text-cf-text-secondary">
            Carregando histórico...
          </div>
        ) : null}

        {!isLoading && !errorMessage && rowsWithStatus.length === 0 ? (
          <div className="rounded border border-cf-border bg-cf-surface px-3 py-3 text-sm text-cf-text-secondary">
            Sem imports para exibir.
          </div>
        ) : null}

        {!isLoading && !errorMessage && rowsWithStatus.length > 0 ? (
          <div className="space-y-3">
            <div className="text-xs text-cf-text-secondary">
              Mostrando {rangeStart}-{rangeEnd}
            </div>
            <div className="max-h-96 overflow-auto rounded border border-cf-border">
              <table className="min-w-full border-collapse text-left text-xs">
                <thead className="bg-cf-bg-subtle">
                  <tr>
                    <th className="border-b border-cf-border px-2 py-2 text-cf-text-primary">Data</th>
                    <th className="border-b border-cf-border px-2 py-2 text-cf-text-primary">Arquivo</th>
                    <th className="border-b border-cf-border px-2 py-2 text-cf-text-primary">Status</th>
                    <th className="border-b border-cf-border px-2 py-2 text-cf-text-primary">Resumo</th>
                    <th className="border-b border-cf-border px-2 py-2 text-cf-text-primary">Valores</th>
                    <th className="border-b border-cf-border px-2 py-2 text-cf-text-primary">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsWithStatus.map((item) => (
                    <tr key={item.id} className="align-top">
                      <td className="border-b border-cf-border px-2 py-2 text-cf-text-primary">
                        {formatDateTime(item.createdAt)}
                      </td>
                      <td className="border-b border-cf-border px-2 py-2 text-cf-text-primary">
                        <p className="font-semibold text-cf-text-primary">
                          {item.fileName || "Arquivo não informado"}
                        </p>
                        <p className="text-[11px] text-cf-text-secondary">
                          {formatDocumentType(item.documentType)}
                        </p>
                      </td>
                      <td className="border-b border-cf-border px-2 py-2">
                        <span className={`rounded px-2 py-0.5 font-semibold ${item.status.className}`}>
                          {item.status.label}
                        </span>
                      </td>
                      <td className="border-b border-cf-border px-2 py-2 text-cf-text-primary">
                        <div className="space-y-1 text-[11px]">
                          <p>Válidas: {item.summary.validRows}</p>
                          <p>Duplicadas: {item.summary.duplicateRows}</p>
                          <p>Conflitos: {item.summary.conflictRows}</p>
                          <p>Inválidas: {item.summary.invalidRows}</p>
                          <p>Importadas: {item.summary.imported}</p>
                        </div>
                      </td>
                      <td className="border-b border-cf-border px-2 py-2 text-cf-text-primary">
                        <div className="space-y-1 text-[11px]">
                          <p>Entradas: {formatCurrency(item.summary.income)}</p>
                          <p>Saídas: {formatCurrency(item.summary.expense)}</p>
                        </div>
                      </td>
                      <td className="border-b border-cf-border px-2 py-2">
                        {item.canUndo ? (
                          <button
                            type="button"
                            onClick={() => setPendingUndoItem(item)}
                            disabled={undoingSessionId === item.id}
                            className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {undoingSessionId === item.id ? "Desfazendo..." : "Desfazer"}
                          </button>
                        ) : (
                          <span className="text-[11px] text-cf-text-secondary">Sem ação</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handlePreviousPage}
                disabled={!hasPreviousPage || isLoading}
                className="rounded border border-cf-border bg-cf-surface px-3 py-1.5 text-sm font-semibold text-cf-text-primary hover:bg-cf-bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={handleNextPage}
                disabled={!hasNextPage || isLoading}
                className="rounded border border-cf-border bg-cf-surface px-3 py-1.5 text-sm font-semibold text-cf-text-primary hover:bg-cf-bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
              >
                Proxima
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-1.5 text-sm font-semibold text-cf-text-secondary"
          >
            Fechar
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={Boolean(pendingUndoItem)}
        title="Desfazer importação?"
        description="Os lançamentos ativos desta sessão serão removidos e o histórico ficará marcado como revertido."
        confirmLabel="Desfazer importação"
        onConfirm={() => void handleConfirmUndo()}
        onCancel={() => setPendingUndoItem(null)}
      />
    </div>
  );
};

ImportHistoryModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onImportSessionReverted: PropTypes.func,
};

export default ImportHistoryModal;
