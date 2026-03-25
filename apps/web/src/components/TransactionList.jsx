import PropTypes from "prop-types";
import { CATEGORY_ENTRY } from "./DatabaseUtils";
import { formatCurrency } from "../utils/formatCurrency";
import { useMaskedCurrency } from "../context/DiscreetModeContext";

const formatDate = (value) => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("pt-BR");
};

const TransactionList = ({ transactions, onDelete, onEdit }) => {
  const money = useMaskedCurrency();
  return (
    <div className="mx-auto max-w-700 px-2 sm:px-0">
      {transactions.map((transaction) => (
        <div
          key={transaction.id}
          className="my-2 flex w-full min-w-0 flex-col items-start gap-2 rounded border border-brand-1 bg-cf-surface p-3.5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 flex-1 flex-col">
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
};

export default TransactionList;
