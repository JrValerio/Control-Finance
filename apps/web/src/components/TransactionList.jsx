import { useState } from "react";
import PropTypes from "prop-types";
import { CATEGORY_ENTRY } from "./DatabaseUtils";
import { useMaskedCurrency } from "../context/DiscreetModeContext";
import ConfirmDialog from "./ConfirmDialog";

const formatDate = (value) => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("pt-BR");
};

const TransactionList = ({ transactions, onDelete, onEdit, onBulkDelete }) => {
  const money = useMaskedCurrency();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === transactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map((t) => t.id)));
    }
  };

  const handleBulkDeleteConfirm = () => {
    if (selectedIds.size === 0 || !onBulkDelete) return;
    const ids = [...selectedIds];
    setSelectedIds(new Set());
    setShowBulkConfirm(false);
    onBulkDelete(ids);
  };

  const allSelected = transactions.length > 0 && selectedIds.size === transactions.length;
  const someSelected = selectedIds.size > 0;

  return (
    <div className="mx-auto max-w-700 px-2 sm:px-0">
      {someSelected && onBulkDelete ? (
        <div className="mb-2 flex items-center justify-between rounded border border-red-200 bg-red-50 px-3 py-2 dark:border-red-800 dark:bg-red-950/40">
          <span className="text-sm font-medium text-red-700 dark:text-red-400">
            {selectedIds.size} {selectedIds.size === 1 ? "selecionada" : "selecionadas"}
          </span>
          <button
            type="button"
            onClick={() => setShowBulkConfirm(true)}
            className="rounded border border-red-300 bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-200 dark:border-red-700 dark:bg-red-900/40 dark:text-red-300"
          >
            Excluir selecionadas ({selectedIds.size})
          </button>
        </div>
      ) : null}

      {onBulkDelete && transactions.length > 0 ? (
        <div className="mb-1 flex items-center gap-2 px-1">
          <input
            type="checkbox"
            id="select-all-transactions"
            checked={allSelected}
            onChange={toggleSelectAll}
            className="h-3.5 w-3.5 cursor-pointer accent-brand-1"
          />
          <label htmlFor="select-all-transactions" className="cursor-pointer text-xs text-cf-text-secondary">
            Selecionar todas
          </label>
        </div>
      ) : null}

      {transactions.map((transaction) => (
        <div
          key={transaction.id}
          className="my-2 flex w-full min-w-0 flex-col items-start gap-2 rounded border border-brand-1 bg-cf-surface p-3.5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 flex-1 flex-col">
            {onBulkDelete ? (
              <div className="mb-1 flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`select-transaction-${transaction.id}`}
                  checked={selectedIds.has(transaction.id)}
                  onChange={() => toggleSelect(transaction.id)}
                  className="h-3.5 w-3.5 cursor-pointer accent-brand-1"
                  aria-label={`Selecionar transação ${transaction.id}`}
                />
              </div>
            ) : null}
            <span className="break-words text-sm font-medium text-cf-text-primary">
              {transaction.description || "Sem descrição"}
            </span>
            <span className="text-base font-medium text-cf-text-primary">
              {money(transaction.value)}
            </span>
            <span className="text-xs text-cf-text-secondary">{formatDate(transaction.date)}</span>
            <span className="break-words text-xs text-cf-text-secondary">
              Categoria: {transaction.categoryName || "Sem categoria"}
            </span>
            {transaction.notes ? (
              <span className="break-words text-xs text-cf-text-secondary">{transaction.notes}</span>
            ) : null}
          </div>

          <div className="mt-1 flex w-full flex-wrap items-center gap-2 sm:mt-0 sm:w-auto sm:flex-nowrap sm:justify-end">
            <span
              className={`whitespace-nowrap rounded px-3 py-1 text-sm font-medium ${
                transaction.type === CATEGORY_ENTRY
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {transaction.type}
            </span>
            <button
              type="button"
              onClick={() => onEdit(transaction)}
              className="whitespace-nowrap rounded border border-cf-border px-2 py-1 text-xs font-semibold text-cf-text-secondary transition-colors hover:border-cf-border-input hover:text-cf-text-primary"
              aria-label={`Editar transação ${transaction.id}`}
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() => onDelete(transaction.id)}
              className="whitespace-nowrap rounded border border-cf-border px-2 py-1 text-xs font-semibold text-cf-text-secondary transition-colors hover:border-cf-border-input hover:text-cf-text-primary"
              aria-label={`Excluir transação ${transaction.id}`}
            >
              Excluir
            </button>
          </div>
        </div>
      ))}

      <ConfirmDialog
        isOpen={showBulkConfirm}
        title={`Excluir ${selectedIds.size} ${selectedIds.size === 1 ? "transação" : "transações"}?`}
        description="Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        onConfirm={handleBulkDeleteConfirm}
        onCancel={() => setShowBulkConfirm(false)}
      />
    </div>
  );
};

TransactionList.propTypes = {
  transactions: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.number.isRequired,
      value: PropTypes.number.isRequired,
      type: PropTypes.string.isRequired,
      date: PropTypes.string.isRequired,
      categoryName: PropTypes.string,
      description: PropTypes.string,
      notes: PropTypes.string,
    }),
  ).isRequired,
  onDelete: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onBulkDelete: PropTypes.func,
};

export default TransactionList;
