import type { RefObject } from "react";
import type { Transaction } from "../services/transactions.service";
import TransactionList from "./TransactionList";

interface TransactionWithCategoryName extends Transaction {
  categoryName: string;
}

interface TransactionsFeedSectionProps {
  sectionRef: RefObject<HTMLElement>;
  requestError: string;
  onRetryLoadTransactions: () => void | Promise<void>;
  isLoadingTransactions: boolean;
  hasActiveFilters: boolean;
  onOpenCreateModal: () => void;
  transactions: TransactionWithCategoryName[];
  onDeleteTransaction: (id: number) => void;
  onEditTransaction: (transaction: TransactionWithCategoryName) => void;
  onBulkDeleteTransactions: (ids: number[]) => void | Promise<void>;
  rangeStart: number;
  rangeEnd: number;
  totalTransactions: number;
  pageSize: number;
  pageSizeOptions: number[];
  onPageSizeChange: (nextPageSize: string) => void;
  currentPage: number;
  totalPages: number;
  onFirstPage: () => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onLastPage: () => void;
}

const TransactionsFeedSection = ({
  sectionRef,
  requestError,
  onRetryLoadTransactions,
  isLoadingTransactions,
  hasActiveFilters,
  onOpenCreateModal,
  transactions,
  onDeleteTransaction,
  onEditTransaction,
  onBulkDeleteTransactions,
  rangeStart,
  rangeEnd,
  totalTransactions,
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
  currentPage,
  totalPages,
  onFirstPage,
  onPreviousPage,
  onNextPage,
  onLastPage,
}: TransactionsFeedSectionProps): JSX.Element => (
  <section className="space-y-3" aria-labelledby="transactions-overview-title">
    <div>
      <h3 id="transactions-overview-title" className="text-sm font-medium text-cf-text-primary">
        Movimentações
      </h3>
      <p className="mt-1 text-xs text-cf-text-secondary">
        Detalhe completo para revisão depois da triagem operacional e da análise do período.
      </p>
    </div>

    <section ref={sectionRef} className="rounded border border-cf-border bg-cf-surface px-4 py-3.5">
      {requestError ? (
        <div className="p-4 text-center">
          <p className="text-sm font-medium text-red-600">{requestError}</p>
          <button onClick={() => void onRetryLoadTransactions()} className="mt-2 font-medium text-brand-1 hover:text-brand-2">
            Tentar novamente
          </button>
        </div>
      ) : isLoadingTransactions ? (
        <div className="space-y-2 p-2" role="status" aria-live="polite">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`transactions-skeleton-${index + 1}`}
              className="h-20 animate-pulse rounded border border-cf-border bg-cf-bg-subtle"
            />
          ))}
          <span className="sr-only">Carregando transações...</span>
        </div>
      ) : transactions.length === 0 ? (
        hasActiveFilters ? (
          <div className="p-4 text-center text-cf-text-primary">
            Nenhum valor encontrado para os filtros selecionados.
          </div>
        ) : (
          <div className="p-4 text-center">
            <p className="text-cf-text-primary">Nenhum valor cadastrado.</p>
            <button onClick={onOpenCreateModal} className="font-medium text-brand-1 hover:text-brand-2">
              Registrar valor
            </button>
          </div>
        )
      ) : (
        <TransactionList
          transactions={transactions}
          onDelete={onDeleteTransaction}
          onEdit={onEditTransaction}
          onBulkDelete={onBulkDeleteTransactions}
        />
      )}

      {!requestError && !isLoadingTransactions ? (
        <div className="mt-2 border-t border-cf-border px-2 pt-3 text-sm text-cf-text-primary">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span>
              Mostrando {rangeStart}-{rangeEnd} de {totalTransactions}
            </span>
            <label className="flex items-center gap-2 text-xs font-semibold">
              Itens por pagina
              <select
                aria-label="Itens por pagina"
                value={pageSize}
                onChange={(event) => onPageSizeChange(event.target.value)}
                className="rounded border border-cf-border bg-cf-surface px-2 py-1 text-sm text-cf-text-primary"
              >
                {pageSizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {totalPages > 2 ? (
              <button
                type="button"
                onClick={onFirstPage}
                disabled={currentPage <= 1}
                className="rounded border border-cf-border px-3 py-1 font-semibold text-cf-text-primary hover:bg-cf-bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
              >
                Primeira
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onPreviousPage}
                disabled={currentPage <= 1}
                className="rounded border border-cf-border px-3 py-1 font-semibold text-cf-text-primary hover:bg-cf-bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
              >
                Anterior
              </button>
              <span>
                Pagina {currentPage} de {totalPages}
              </span>
              <button
                type="button"
                onClick={onNextPage}
                disabled={currentPage >= totalPages}
                className="rounded border border-cf-border px-3 py-1 font-semibold text-cf-text-primary hover:bg-cf-bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
              >
                Proxima
              </button>
            </div>
            {totalPages > 2 ? (
              <button
                type="button"
                onClick={onLastPage}
                disabled={currentPage >= totalPages}
                className="rounded border border-cf-border px-3 py-1 font-semibold text-cf-text-primary hover:bg-cf-bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
              >
                Ultima
              </button>
            ) : (
              <span />
            )}
          </div>
        </div>
      ) : null}
    </section>
  </section>
);

export default TransactionsFeedSection;
