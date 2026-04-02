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
          className="my-2 w-full min-w-0 rounded-lg border border-cf-border bg-cf-surface px-3 py-2.5"
        >
          <div className="flex items-start gap-2.5">
            {onBulkDelete ? (
              <div className="pt-0.5">
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

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-cf-text-primary">
                    {transaction.description || "Sem descrição"}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-cf-text-secondary">
                    <span>{formatDate(transaction.date)}</span>
                    <span className="hidden sm:inline">•</span>
                    <span className="break-words">Categoria: {transaction.categoryName || "Sem categoria"}</span>
                  </div>
                  {transaction.notes ? (
                    <p className="mt-0.5 break-words text-[11px] text-cf-text-secondary">{transaction.notes}</p>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p className="text-lg font-semibold leading-none text-cf-text-primary">
                    {money(transaction.value)}
                  </p>
                  <span
                    className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      transaction.type === CATEGORY_ENTRY
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-700"
                    }`}
                  >
                    {transaction.type}
                  </span>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => onEdit(transaction)}
                  className="rounded border border-cf-border px-2 py-0.5 text-xs font-medium text-cf-text-secondary transition-colors hover:bg-cf-bg-subtle hover:text-cf-text-primary"
                  aria-label={`Editar transação ${transaction.id}`}
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(transaction.id)}
                  className="rounded border border-red-200 px-2 py-0.5 text-xs font-medium text-red-500 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
                  aria-label={`Excluir transação ${transaction.id}`}
                >
                  Excluir
                </button>
              </div>
            </div>
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
