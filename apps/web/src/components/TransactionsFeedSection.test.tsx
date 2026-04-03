import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import TransactionsFeedSection from "./TransactionsFeedSection";

vi.mock("./TransactionList", () => ({
  default: ({
    onDelete,
    onEdit,
    onBulkDelete,
  }: {
    onDelete: (id: number) => void;
    onEdit: (transaction: {
      id: number;
      value: number;
      type: "Entrada" | "Saida";
      categoryId: number | null;
      date: string;
      description: string;
      notes: string;
      categoryName: string;
    }) => void;
    onBulkDelete: (ids: number[]) => void;
  }) => (
    <div>
      <p>Lista de transacoes</p>
      <button type="button" onClick={() => onDelete(1)}>
        Excluir item
      </button>
      <button
        type="button"
        onClick={() =>
          onEdit({
            id: 1,
            value: 10,
            type: "Entrada",
            categoryId: 1,
            date: "2026-04-01",
            description: "Descricao",
            notes: "Notas",
            categoryName: "Categoria",
          })
        }
      >
        Editar item
      </button>
      <button type="button" onClick={() => onBulkDelete([1])}>
        Excluir em massa
      </button>
    </div>
  ),
}));

const buildProps = () => ({
  sectionRef: { current: null },
  requestError: "",
  onRetryLoadTransactions: vi.fn(),
  isLoadingTransactions: false,
  hasActiveFilters: false,
  onOpenCreateModal: vi.fn(),
  transactions: [
    {
      id: 1,
      value: 10,
      type: "Entrada" as const,
      categoryId: 1,
      date: "2026-04-01",
      description: "Descricao",
      notes: "Notas",
      categoryName: "Categoria",
    },
  ],
  onDeleteTransaction: vi.fn(),
  onEditTransaction: vi.fn(),
  onBulkDeleteTransactions: vi.fn(),
  rangeStart: 1,
  rangeEnd: 1,
  totalTransactions: 1,
  pageSize: 20,
  pageSizeOptions: [10, 20, 50],
  onPageSizeChange: vi.fn(),
  currentPage: 1,
  totalPages: 3,
  onFirstPage: vi.fn(),
  onPreviousPage: vi.fn(),
  onNextPage: vi.fn(),
  onLastPage: vi.fn(),
});

describe("TransactionsFeedSection", () => {
  it("renderiza titulo da secao", () => {
    render(<TransactionsFeedSection {...buildProps()} />);

    expect(screen.getByText("Movimentações")).toBeInTheDocument();
    expect(
      screen.getByText("Detalhe completo para revisão depois da triagem operacional e da análise do período."),
    ).toBeInTheDocument();
  });

  it("exibe erro e permite retry", () => {
    const props = buildProps();
    props.requestError = "Falha ao carregar";

    render(<TransactionsFeedSection {...props} />);

    expect(screen.getByText("Falha ao carregar")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(props.onRetryLoadTransactions).toHaveBeenCalledTimes(1);
  });

  it("mostra estado vazio sem filtros e abre modal de cadastro", () => {
    const props = buildProps();
    props.transactions = [];

    render(<TransactionsFeedSection {...props} />);

    expect(screen.getByText("Nenhum valor cadastrado.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Registrar valor" }));
    expect(props.onOpenCreateModal).toHaveBeenCalledTimes(1);
  });

  it("propaga callbacks de lista e paginacao", () => {
    const props = buildProps();
    props.currentPage = 2;

    render(<TransactionsFeedSection {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Excluir item" }));
    fireEvent.click(screen.getByRole("button", { name: "Editar item" }));
    fireEvent.click(screen.getByRole("button", { name: "Excluir em massa" }));
    fireEvent.change(screen.getByLabelText("Itens por pagina"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Primeira" }));
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    fireEvent.click(screen.getByRole("button", { name: "Proxima" }));
    fireEvent.click(screen.getByRole("button", { name: "Ultima" }));

    expect(props.onDeleteTransaction).toHaveBeenCalledWith(1);
    expect(props.onEditTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, categoryName: "Categoria" }),
    );
    expect(props.onBulkDeleteTransactions).toHaveBeenCalledWith([1]);
    expect(props.onPageSizeChange).toHaveBeenCalledWith("50");
    expect(props.onFirstPage).toHaveBeenCalledTimes(1);
    expect(props.onPreviousPage).toHaveBeenCalledTimes(1);
    expect(props.onNextPage).toHaveBeenCalledTimes(1);
    expect(props.onLastPage).toHaveBeenCalledTimes(1);
  });
});
