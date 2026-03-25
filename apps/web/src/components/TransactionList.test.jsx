import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TransactionList from "./TransactionList";
import { DiscreetModeContext } from "../context/DiscreetModeContext";

vi.mock("../context/DiscreetModeContext", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useMaskedCurrency: () => (v) => `R$ ${v}`,
  };
});

const buildTransaction = (overrides = {}) => ({
  id: 1,
  value: 100,
  type: "Saída",
  date: "2026-03-25",
  categoryName: "Moradia",
  description: "Aluguel",
  notes: null,
  ...overrides,
});

const defaultProps = {
  transactions: [buildTransaction(), buildTransaction({ id: 2, description: "Luz" })],
  onDelete: vi.fn(),
  onEdit: vi.fn(),
  onBulkDelete: vi.fn(),
};

describe("TransactionList — bulk delete confirmation", () => {
  it("não chama onBulkDelete ao clicar no botão, abre confirmação", async () => {
    render(<TransactionList {...defaultProps} />);

    await userEvent.click(screen.getByRole("checkbox", { name: /selecionar todas/i }));
    await userEvent.click(screen.getByRole("button", { name: /excluir selecionadas/i }));

    expect(defaultProps.onBulkDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("cancela sem deletar", async () => {
    render(<TransactionList {...defaultProps} />);

    await userEvent.click(screen.getByRole("checkbox", { name: /selecionar todas/i }));
    await userEvent.click(screen.getByRole("button", { name: /excluir selecionadas/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(defaultProps.onBulkDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("confirma e chama onBulkDelete com os ids selecionados", async () => {
    const onBulkDelete = vi.fn();
    render(<TransactionList {...defaultProps} onBulkDelete={onBulkDelete} />);

    await userEvent.click(screen.getByRole("checkbox", { name: /selecionar todas/i }));
    await userEvent.click(screen.getByRole("button", { name: /excluir selecionadas/i }));
    await userEvent.click(screen.getByRole("button", { name: /^excluir$/i }));

    expect(onBulkDelete).toHaveBeenCalledWith(expect.arrayContaining([1, 2]));
    expect(onBulkDelete).toHaveBeenCalledTimes(1);
  });
});
