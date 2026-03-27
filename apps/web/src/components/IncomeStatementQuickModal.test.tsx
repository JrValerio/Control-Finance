import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IncomeStatementQuickModal from "./IncomeStatementQuickModal";
import {
  incomeSourcesService,
  type IncomeSourceWithDeductions,
} from "../services/incomeSources.service";

vi.mock("../services/incomeSources.service", () => ({
  incomeSourcesService: {
    list: vi.fn(),
    listStatements: vi.fn(),
    createStatement: vi.fn(),
    linkTransaction: vi.fn(),
    postStatement: vi.fn(),
  },
}));

const buildSource = (
  overrides: Partial<IncomeSourceWithDeductions> = {},
): IncomeSourceWithDeductions => ({
  id: 1,
  userId: 1,
  name: "INSS Benefício",
  categoryId: null,
  defaultDay: null,
  notes: null,
  deductions: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

const mockStatement = {
  id: 10,
  incomeSourceId: 1,
  referenceMonth: "2026-02",
  netAmount: 1412,
  totalDeductions: 0,
  grossAmount: null,
  details: null,
  paymentDate: null,
  status: "draft" as const,
  postedTransactionId: null,
  sourceImportSessionId: null,
  reconciliation: null,
  createdAt: "2026-02-25T00:00:00Z",
  updatedAt: "2026-02-25T00:00:00Z",
};

const mockPostResult = {
  statement: {
    ...mockStatement,
    status: "posted" as const,
    postedTransactionId: 99,
  },
  transaction: {
    id: 99,
    type: "Entrada",
    value: 1412,
    date: "2026-02-25",
    description: "INSS Beneficio - 2026-02",
    categoryId: null,
  },
};

describe("IncomeStatementQuickModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(incomeSourcesService.list).mockResolvedValue([buildSource()]);
    vi.mocked(incomeSourcesService.listStatements).mockResolvedValue([]);
    vi.mocked(incomeSourcesService.createStatement).mockResolvedValue({
      outcome: "created",
      statement: mockStatement,
      deductions: [],
    });
    vi.mocked(incomeSourcesService.linkTransaction).mockResolvedValue(mockStatement);
    vi.mocked(incomeSourcesService.postStatement).mockResolvedValue(mockPostResult);
  });

  it("does not render when isOpen is false", () => {
    render(<IncomeStatementQuickModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the income statement modal shell scrollable inside the viewport", async () => {
    render(<IncomeStatementQuickModal isOpen onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId("income-quick-modal-shell")).toBeInTheDocument();
    });

    expect(screen.getByTestId("income-quick-modal-shell")).toHaveClass("flex", "flex-col", "overflow-hidden");
    expect(screen.getByTestId("income-quick-modal-body")).toHaveClass("min-h-0", "overflow-y-auto");
  });

  it("shows guidance when no income sources exist", async () => {
    vi.mocked(incomeSourcesService.list).mockResolvedValue([]);
    render(<IncomeStatementQuickModal isOpen onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/Nenhuma fonte de renda cadastrada/i)).toBeInTheDocument();
    });
  });

  it("pre-fills fields from prefill prop", async () => {
    render(
      <IncomeStatementQuickModal
        isOpen
        onClose={vi.fn()}
        prefill={{
          referenceMonth: "2026-02",
          netAmount: 1412.0,
          paymentDate: "2026-02-25",
          grossAmount: 1800,
          deductions: [{ code: "216", label: "EMPRESTIMO CONSIGNADO", amount: 388.0 }],
        }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByLabelText(/Competência/i)).toHaveValue("2026-02");
    });
    expect(screen.getByLabelText(/Valor líquido/i)).toHaveValue(1412);
    expect(screen.getByLabelText(/Data de pagamento/i)).toHaveValue("2026-02-25");
    expect(screen.getByText(/101 Valor total do período/i)).toBeInTheDocument();
    expect(screen.getByText(/216 EMPRESTIMO CONSIGNADO/i)).toBeInTheDocument();
  });

  it("auto-selects single source", async () => {
    render(<IncomeStatementQuickModal isOpen onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /Fonte de renda/i })).toHaveValue("1");
    });
  });

  it("submits and shows success state without linkage", async () => {
    const onCreated = vi.fn();
    render(
      <IncomeStatementQuickModal
        isOpen
        onClose={vi.fn()}
        prefill={{
          referenceMonth: "2026-02",
          netAmount: 1412,
        deductions: [{ code: "268", label: "CONSIGNACAO - CARTAO", amount: 247.93 }],
      }}
      onCreated={onCreated}
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /Fonte de renda/i })).toHaveValue("1");
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Registrar somente no historico" }),
    );
    await waitFor(() => {
      expect(screen.getByText("Lancamento registrado com sucesso.")).toBeInTheDocument();
    });
    expect(onCreated).toHaveBeenCalledWith(mockStatement);
    expect(incomeSourcesService.createStatement).toHaveBeenCalledWith(1, {
      referenceMonth: "2026-02",
      netAmount: 1412,
      paymentDate: null,
      grossAmount: null,
      deductions: [
        { label: "268 CONSIGNACAO - CARTAO", amount: 247.93, isVariable: false },
      ],
      details: null,
      sourceImportSessionId: null,
    });
    expect(incomeSourcesService.linkTransaction).not.toHaveBeenCalled();
    expect(incomeSourcesService.postStatement).not.toHaveBeenCalled();
  });

  it("exige decisão explícita quando a competência já existe", async () => {
    vi.mocked(incomeSourcesService.listStatements).mockResolvedValue([
      { ...mockStatement, referenceMonth: "2026-02", netAmount: 1412, paymentDate: "2026-02-25" },
    ]);

    render(
      <IncomeStatementQuickModal
        isOpen
        onClose={vi.fn()}
        prefill={{ referenceMonth: "2026-02", netAmount: 1412 }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/competência já existente/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Registrar somente no historico" }));

    expect(
      screen.getByText(/Escolha se deseja ignorar ou substituir a competência existente/i),
    ).toBeInTheDocument();
    expect(incomeSourcesService.createStatement).not.toHaveBeenCalled();
  });

  it("permite ignorar competência existente sem alterar dados", async () => {
    const onIgnored = vi.fn();
    vi.mocked(incomeSourcesService.listStatements).mockResolvedValue([
      { ...mockStatement, referenceMonth: "2026-02", netAmount: 1412, paymentDate: "2026-02-25" },
    ]);

    render(
      <IncomeStatementQuickModal
        isOpen
        onClose={vi.fn()}
        prefill={{ referenceMonth: "2026-02", netAmount: 1412 }}
        onIgnored={onIgnored}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/competência já existente/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Ignorar" }));
    await userEvent.click(screen.getByRole("button", { name: "Ignorar competência" }));

    expect(onIgnored).toHaveBeenCalledWith(
      expect.objectContaining({ referenceMonth: "2026-02" }),
    );
    expect(incomeSourcesService.createStatement).not.toHaveBeenCalled();
  });

  it("envia replace explícito ao substituir competência existente", async () => {
    vi.mocked(incomeSourcesService.listStatements).mockResolvedValue([
      { ...mockStatement, referenceMonth: "2026-02", netAmount: 1412, paymentDate: "2026-02-25" },
    ]);
    vi.mocked(incomeSourcesService.createStatement).mockResolvedValue({
      outcome: "replaced",
      statement: mockStatement,
      deductions: [],
    });

    render(
      <IncomeStatementQuickModal
        isOpen
        onClose={vi.fn()}
        prefill={{ referenceMonth: "2026-02", netAmount: 1412 }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/competência já existente/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Substituir" }));
    await userEvent.click(screen.getByRole("button", { name: "Registrar somente no historico" }));

    await waitFor(() => {
      expect(incomeSourcesService.createStatement).toHaveBeenCalledWith(1, expect.objectContaining({
        referenceMonth: "2026-02",
        existingCompetenceAction: "replace",
      }));
    });
  });

  it("shows error message when createStatement rejects", async () => {
    vi.mocked(incomeSourcesService.createStatement).mockRejectedValue(new Error("Falha de rede"));
    render(
      <IncomeStatementQuickModal
        isOpen
        onClose={vi.fn()}
        prefill={{ referenceMonth: "2026-02", netAmount: 1412 }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /Fonte de renda/i })).toHaveValue("1");
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Registrar somente no historico" }),
    );
    await waitFor(() => {
      expect(screen.getByText("Falha de rede")).toBeInTheDocument();
    });
  });

  it("auto-links to transaction when transactionId provided and shows linked status", async () => {
    render(
      <IncomeStatementQuickModal
        isOpen
        onClose={vi.fn()}
        transactionId={99}
        prefill={{ referenceMonth: "2026-02", netAmount: 1412 }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /Fonte de renda/i })).toHaveValue("1");
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Registrar e vincular entrada" }),
    );
    await waitFor(() => {
      expect(screen.getByText(/vinculo com a transacao importada confirmado/i)).toBeInTheDocument();
    });
    expect(incomeSourcesService.linkTransaction).toHaveBeenCalledWith(10, 99);
    expect(incomeSourcesService.postStatement).not.toHaveBeenCalled();
  });

  it("posts the statement when compose income is enabled for imported proof without transaction", async () => {
    const onCreated = vi.fn();
    render(
      <IncomeStatementQuickModal
        isOpen
        onClose={vi.fn()}
        defaultComposeIncome
        prefill={{ referenceMonth: "2026-02", netAmount: 1412, paymentDate: "2026-02-25" }}
        onCreated={onCreated}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /Fonte de renda/i })).toHaveValue("1");
    });

    expect(screen.getByLabelText(/Este documento compoe minha renda/i)).toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "Registrar e lancar entrada" }));

    await waitFor(() => {
      expect(screen.getByText(/entrada gerada/i)).toBeInTheDocument();
    });

    expect(incomeSourcesService.postStatement).toHaveBeenCalledWith(10);
    expect(onCreated).toHaveBeenCalledWith(mockPostResult.statement);
  });

  it("não relança a entrada ao substituir competência já lançada", async () => {
    vi.mocked(incomeSourcesService.listStatements).mockResolvedValue([
      {
        ...mockStatement,
        referenceMonth: "2026-02",
        status: "posted",
        postedTransactionId: 99,
        paymentDate: "2026-02-25",
      },
    ]);
    vi.mocked(incomeSourcesService.createStatement).mockResolvedValue({
      outcome: "replaced",
      statement: {
        ...mockStatement,
        status: "posted",
        postedTransactionId: 99,
        paymentDate: "2026-02-25",
      },
      deductions: [],
    });

    render(
      <IncomeStatementQuickModal
        isOpen
        onClose={vi.fn()}
        defaultComposeIncome
        prefill={{ referenceMonth: "2026-02", netAmount: 1412, paymentDate: "2026-02-25" }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/competência já existente/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Substituir" }));
    await userEvent.click(screen.getByRole("button", { name: "Registrar e lancar entrada" }));

    await waitFor(() => {
      expect(screen.getByText(/competência existente foi substituída/i)).toBeInTheDocument();
    });

    expect(incomeSourcesService.postStatement).not.toHaveBeenCalled();
  });

  it("shows amber warning when linkage fails after successful statement creation", async () => {
    vi.mocked(incomeSourcesService.linkTransaction).mockRejectedValue(
      new Error("Tolerância de valor excedida."),
    );
    render(
      <IncomeStatementQuickModal
        isOpen
        onClose={vi.fn()}
        transactionId={99}
        prefill={{ referenceMonth: "2026-02", netAmount: 1412 }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /Fonte de renda/i })).toHaveValue("1");
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Registrar e vincular entrada" }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(/historico registrado, mas o vinculo com a transacao/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/vincular manualmente/i)).toBeInTheDocument();
    expect(screen.getByText("Lancamento registrado com sucesso.")).toBeInTheDocument();
  });

  it("shows validation error when source not selected", async () => {
    vi.mocked(incomeSourcesService.list).mockResolvedValue([
      buildSource({ id: 1, name: "A" }),
      buildSource({ id: 2, name: "B" }),
    ]);
    render(<IncomeStatementQuickModal isOpen onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "A" })).toBeInTheDocument();
    });
    await userEvent.selectOptions(screen.getByRole("combobox"), "");
    await userEvent.click(
      screen.getByRole("button", { name: "Registrar somente no historico" }),
    );
    expect(screen.getByText(/selecione uma fonte/i)).toBeInTheDocument();
  });
});
