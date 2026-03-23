import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import {
  CATEGORY_ENTRY,
  CATEGORY_EXIT,
  getTodayISODate,
  isValidISODate,
  parseCurrencyInput,
} from "./DatabaseUtils";

const formatValueForInput = (value) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "";
  }

  return numericValue.toFixed(2).replace(".", ",");
};

const resolveInitialCategoryId = (transaction) => {
  const numericCategoryId = Number(transaction?.categoryId);

  if (Number.isInteger(numericCategoryId) && numericCategoryId > 0) {
    return String(numericCategoryId);
  }

  return "";
};

const hasAvailableCategory = (categories, categoryId) => {
  const numericCategoryId = Number(categoryId);

  if (!Number.isInteger(numericCategoryId) || numericCategoryId <= 0) {
    return false;
  }

  return categories.some((categoryOption) => Number(categoryOption.id) === numericCategoryId);
};

const Modal = ({
  isOpen,
  onClose,
  onSave,
  onClearSubmitError,
  submitErrorMessage = "",
  initialTransaction = null,
  hasLoadedCategories = false,
  categories = [],
}) => {
  const [value, setValue] = useState("");
  const [transactionType, setTransactionType] = useState(CATEGORY_ENTRY);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [transactionDate, setTransactionDate] = useState(getTodayISODate());
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [removedCategoryMessage, setRemovedCategoryMessage] = useState("");
  const isEditing = Boolean(initialTransaction);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setValue(
      initialTransaction ? formatValueForInput(initialTransaction.value) : "",
    );
    setTransactionType(initialTransaction?.type || CATEGORY_ENTRY);
    setSelectedCategoryId(resolveInitialCategoryId(initialTransaction));
    setTransactionDate(initialTransaction?.date || getTodayISODate());
    setDescription(initialTransaction?.description || "");
    setNotes(initialTransaction?.notes || "");
    setErrorMessage("");
    setRemovedCategoryMessage("");
  }, [initialTransaction, isOpen]);

  useEffect(() => {
    if (!isOpen || !isEditing || !hasLoadedCategories || !selectedCategoryId) {
      return;
    }

    if (hasAvailableCategory(categories, selectedCategoryId)) {
      return;
    }

    setSelectedCategoryId("");
    setRemovedCategoryMessage(
      "Categoria removida. Ao salvar, a transação será atualizada para Sem categoria.",
    );
  }, [categories, hasLoadedCategories, isEditing, isOpen, selectedCategoryId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleSubmit = (event) => {
    event.preventDefault();

    const parsedValue = parseCurrencyInput(value);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      setErrorMessage("Digite um valor válido maior que zero.");
      return;
    }

    if (!isValidISODate(transactionDate)) {
      setErrorMessage("Selecione uma data válida.");
      return;
    }

    onSave({
      value: parsedValue,
      type: transactionType,
      categoryId: selectedCategoryId ? Number(selectedCategoryId) : null,
      date: transactionDate,
      description: description.trim(),
      notes: notes.trim(),
    });
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
      <div className="w-full max-w-md rounded-lg bg-cf-surface p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-cf-text-primary">
            {isEditing ? "Editar transação" : "Registro de valor"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-cf-text-secondary transition-colors hover:text-cf-text-primary"
            aria-label="Fechar modal"
          >
            X
          </button>
        </div>

        <p className="mb-4 text-sm text-cf-text-secondary">
          {isEditing
            ? "Atualize os campos da transação."
            : "Digite o valor, selecione o tipo e a data da transação."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="valor" className="text-sm font-medium text-cf-text-primary">
              Valor
            </label>
            <div className="flex items-center rounded border border-cf-border-input px-4 py-2">
              <span className="text-sm font-medium text-cf-text-secondary">R$</span>
              <input
                id="valor"
                className="w-full pl-2 text-sm text-cf-text-secondary outline-none bg-transparent"
                name="valor"
                placeholder="0,00"
                type="text"
                inputMode="decimal"
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  setErrorMessage("");
                  onClearSubmitError?.();
                }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="data" className="text-sm font-medium text-cf-text-primary">
              Data
            </label>
            <input
              id="data"
              type="date"
              className="rounded border border-cf-border-input px-3 py-2 text-sm text-cf-text-secondary bg-cf-surface"
              value={transactionDate}
              onChange={(event) => {
                setTransactionDate(event.target.value);
                setErrorMessage("");
                onClearSubmitError?.();
              }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="descricao" className="text-sm font-medium text-cf-text-primary">
              Descrição
            </label>
            <input
              id="descricao"
              type="text"
              className="rounded border border-cf-border-input px-3 py-2 text-sm text-cf-text-secondary bg-cf-surface"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setErrorMessage("");
                onClearSubmitError?.();
              }}
              placeholder="Ex.: Mercado, Salário, Aluguel"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="observacoes" className="text-sm font-medium text-cf-text-primary">
              Observações
            </label>
            <textarea
              id="observacoes"
              className="min-h-20 rounded border border-cf-border-input px-3 py-2 text-sm text-cf-text-secondary bg-cf-surface"
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
                setErrorMessage("");
                onClearSubmitError?.();
              }}
              placeholder="Detalhes opcionais da transação"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="text-sm font-medium text-cf-text-primary">Tipo de valor</span>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <button
                type="button"
                className={`rounded border px-3.5 py-1 text-sm font-semibold transition-colors ${
                  transactionType === CATEGORY_ENTRY
                    ? "border-green-500 bg-green-50 text-green-700"
                    : "border-cf-border bg-cf-surface text-cf-text-secondary"
                }`}
                onClick={() => {
                  setTransactionType(CATEGORY_ENTRY);
                  onClearSubmitError?.();
                }}
              >
                Entrada
              </button>
              <button
                type="button"
                className={`rounded border px-3.5 py-1 text-sm font-semibold transition-colors ${
                  transactionType === CATEGORY_EXIT
                    ? "border-red-500 bg-red-50 text-red-700"
                    : "border-cf-border bg-cf-surface text-cf-text-secondary"
                }`}
                onClick={() => {
                  setTransactionType(CATEGORY_EXIT);
                  onClearSubmitError?.();
                }}
              >
                Saída
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="categoria" className="text-sm font-medium text-cf-text-primary">
              Categoria
            </label>
            <select
              id="categoria"
              className="rounded border border-cf-border-input px-3 py-2 text-sm text-cf-text-secondary bg-cf-surface"
              value={selectedCategoryId}
              onChange={(event) => {
                setSelectedCategoryId(event.target.value);
                setErrorMessage("");
                setRemovedCategoryMessage("");
                onClearSubmitError?.();
              }}
            >
              <option value="">Sem categoria</option>
              {categories.map((categoryOption) => (
                <option key={categoryOption.id} value={String(categoryOption.id)}>
                  {categoryOption.name}
                </option>
              ))}
            </select>
          </div>

          {removedCategoryMessage ? (
            <p className="text-sm text-amber-700" role="status" aria-live="polite">
              {removedCategoryMessage}
            </p>
          ) : null}

          {errorMessage ? (
            <p className="text-sm text-red-600" role="alert">
              {errorMessage}
            </p>
          ) : null}

          {!errorMessage && submitErrorMessage ? (
            <p className="text-sm text-red-600" role="alert">
              {submitErrorMessage}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              className="rounded border border-cf-border bg-cf-bg-subtle px-3.5 py-1.5 text-sm font-semibold text-cf-text-secondary"
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded border border-brand-1 bg-brand-1 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-brand-2"
            >
              {isEditing ? "Salvar alterações" : "Inserir valor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

Modal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  onClearSubmitError: PropTypes.func,
  submitErrorMessage: PropTypes.string,
  hasLoadedCategories: PropTypes.bool,
  categories: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.number.isRequired,
      name: PropTypes.string.isRequired,
    }),
  ),
  initialTransaction: PropTypes.shape({
    id: PropTypes.number.isRequired,
    value: PropTypes.number.isRequired,
    type: PropTypes.string.isRequired,
    date: PropTypes.string.isRequired,
    categoryId: PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf([null])]),
    description: PropTypes.string,
    notes: PropTypes.string,
  }),
};

export default Modal;
