import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import IncomeSourcesPage from "./IncomeSourcesPage";
import {
  incomeSourcesService,
  type IncomeDeduction,
  type IncomeSourceWithDeductions,
  type IncomeStatementWithDeductions,
  type PostStatementResult,
} from "../services/incomeSources.service";
import { categoriesService } from "../services/categories.service";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../services/incomeSources.service", () => ({
  incomeSourcesService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    addDeduction: vi.fn(),
    updateDeduction: vi.fn(),
    removeDeduction: vi.fn(),
    createStatement: vi.fn(),
    updateStatement: vi.fn(),
    postStatement: vi.fn(),
    listStatements: vi.fn(),
  },
}));

vi.mock("../services/categories.service", () => ({
  categoriesService: {
    listCategories: vi.fn(),
  },
}));

// ─── Builders ─────────────────────────────────────────────────────────────────

const buildDeduction = (overrides: Partial<IncomeDeduction> = {}): IncomeDeduction => ({
  id: 1,
  incomeSourceId: 1,
  label: "Emprestimo Caixa",
  amount: 300,
  isVariable: false,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const buildSource = (overrides: Partial<IncomeSourceWithDeductions> = {}): IncomeSourceWithDeductions => ({
  id: 1,
  userId: 1,
  name: "Pensao INSS",
  categoryId: null,
  defaultDay: 5,
  notes: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deductions: [buildDeduction()],
  ...overrides,
});

const buildStatementResult = (): IncomeStatementWithDeductions => ({
  statement: {
    id: 10,
    incomeSourceId: 1,
    referenceMonth: "2026-02",
    netAmount: 2803.52,
    totalDeductions: 300,
    grossAmount: null,
    details: null,
    paymentDate: null,
    status: "draft",
    postedTransactionId: null,
    createdAt: "2026-02-23T00:00:00.000Z",
    updatedAt: "2026-02-23T00:00:00.000Z",
  },
  deductions: [
    { id: 100, statementId: 10, label: "Emprestimo Caixa", amount: 300, isVariable: false },
  ],
});

const buildPostResult = (): PostStatementResult => ({
  statement: {
    id: 10,
    incomeSourceId: 1,
    referenceMonth: "2026-02",
    netAmount: 2803.52,
    totalDeductions: 300,
    grossAmount: null,
    details: null,
    paymentDate: null,
    status: "posted",
    postedTransactionId: 99,
    createdAt: "2026-02-23T00:00:00.000Z",
    updatedAt: "2026-02-23T00:00:00.000Z",
  },
  transaction: {
    id: 99,
    type: "Entrada",
    value: 2803.52,
    date: "2026-02-23",
    description: "Pensao INSS – 2026-02",
    categoryId: null,
  },
});

// ─── Render helper ────────────────────────────────────────────────────────────

const renderPage = () =>
  render(
    <MemoryRouter>
      <IncomeSourcesPage onBack={vi.fn()} />
    </MemoryRouter>,
  );

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("IncomeSourcesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(incomeSourcesService.list).mockResolvedValue([buildSource()]);
    vi.mocked(categoriesService.listCategories).mockResolvedValue([]);
  });

  it("renderiza lista de fontes com descontos", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Pensao INSS")).toBeInTheDocument();
    });

    expect(screen.getByText("Emprestimo Caixa")).toBeInTheDocument();
    expect(screen.getByText("Dia de credito: 5")).toBeInTheDocument();
  });

  it("lista vazia exibe mensagem de estado vazio", async () => {
    vi.mocked(incomeSourcesService.list).mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Nenhuma fonte de renda cadastrada.")).toBeInTheDocument();
    });
  });

  it("abre modal e cria nova fonte de renda", async () => {
    const user = userEvent.setup();
    const newSource = buildSource({ id: 2, name: "Salario CLT", deductions: [] });
    vi.mocked(incomeSourcesService.create).mockResolvedValue(newSource);
    vi.mocked(incomeSourcesService.list)
      .mockResolvedValueOnce([buildSource()])
      .mockResolvedValue([buildSource(), newSource]);

    renderPage();

    await waitFor(() => expect(screen.getByText("Pensao INSS")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Nova fonte/ }));
    await user.type(screen.getByLabelText(/Nome/), "Salario CLT");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      expect(incomeSourcesService.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Salario CLT" }),
      );
    });
  });

  it("abre IncomeStatementModal ao clicar em Gerar extrato", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText("Pensao INSS")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Gerar extrato" }));

    expect(screen.getByRole("heading", { name: /Gerar extrato/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/Mês de referência/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Valor liquido/)).toBeInTheDocument();
  });

  it("Lancar entrada chama createStatement e postStatement e exibe mensagem de sucesso", async () => {
    const user = userEvent.setup();
    vi.mocked(incomeSourcesService.createStatement).mockResolvedValue(buildStatementResult());
    vi.mocked(incomeSourcesService.postStatement).mockResolvedValue(buildPostResult());

    renderPage();

    await waitFor(() => expect(screen.getByText("Pensao INSS")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Gerar extrato" }));

    await user.type(screen.getByLabelText(/Valor liquido/), "2803,52");

    await user.click(screen.getByRole("button", { name: "Lancar entrada" }));

    await waitFor(() => {
      expect(incomeSourcesService.createStatement).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ netAmount: 2803.52 }),
      );
    });

    await waitFor(() => {
      expect(incomeSourcesService.postStatement).toHaveBeenCalledWith(10);
    });

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });

  it("Salvar rascunho chama createStatement sem postStatement", async () => {
    const user = userEvent.setup();
    vi.mocked(incomeSourcesService.createStatement).mockResolvedValue(buildStatementResult());

    renderPage();

    await waitFor(() => expect(screen.getByText("Pensao INSS")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Gerar extrato" }));

    await user.type(screen.getByLabelText(/Valor liquido/), "2803,52");

    await user.click(screen.getByRole("button", { name: "Salvar rascunho" }));

    await waitFor(() => {
      expect(incomeSourcesService.createStatement).toHaveBeenCalled();
    });

    expect(incomeSourcesService.postStatement).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });

  it("erro em postStatement exibe mensagem de erro", async () => {
    const user = userEvent.setup();
    vi.mocked(incomeSourcesService.createStatement).mockResolvedValue(buildStatementResult());
    vi.mocked(incomeSourcesService.postStatement).mockRejectedValue(
      new Error("Extrato ja foi lancado."),
    );

    renderPage();

    await waitFor(() => expect(screen.getByText("Pensao INSS")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Gerar extrato" }));
    await user.type(screen.getByLabelText(/Valor liquido/), "2803,52");
    await user.click(screen.getByRole("button", { name: "Lancar entrada" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("excluir fonte com confirmacao chama remove e refetch", async () => {
    const user = userEvent.setup();
    vi.mocked(incomeSourcesService.remove).mockResolvedValue(undefined);

    renderPage();

    await waitFor(() => expect(screen.getByText("Pensao INSS")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Excluir" }));
    expect(screen.getByText("Confirmar?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sim" }));

    await waitFor(() => {
      expect(incomeSourcesService.remove).toHaveBeenCalledWith(1);
    });
  });
});
