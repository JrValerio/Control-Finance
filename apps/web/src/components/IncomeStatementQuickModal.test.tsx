import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IncomeStatementQuickModal from "./IncomeStatementQuickModal";
import { incomeSourcesService, type IncomeSourceWithDeductions } from "../services/incomeSources.service";

vi.mock("../services/incomeSources.service", () => ({
  incomeSourcesService: {
    list: vi.fn(),
    createStatement: vi.fn(),
    linkTransaction: vi.fn(),
  },
}));

const buildSource = (overrides: Partial<IncomeSourceWithDeductions> = {}): IncomeSourceWithDeductions => ({
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
  createdAt: "2026-02-25T00:00:00Z",
  updatedAt: "2026-02-25T00:00:00Z",
};

describe("IncomeStatementQuickModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(incomeSourcesService.list).mockResolvedValue([buildSource()]);
    vi.mocked(incomeSourcesService.createStatement).mockResolvedValue({
      statement: mockStatement,
      deductions: [],
    });
    vi.mocked(incomeSourcesService.linkTransaction).mockResolvedValue(mockStatement);
  });

  it("does not render when isOpen is false", () => {
    render(<IncomeStatementQuickModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
        prefill={{ referenceMonth: "2026-02", netAmount: 1412.0, paymentDate: "2026-02-25" }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByLabelText(/Competência/i)).toHaveValue("2026-02");
    });
    expect(screen.getByLabelText(/Valor líquido/i)).toHaveValue(1412);
    expect(screen.getByLabelText(/Data de pagamento/i)).toHaveValue("2026-02-25");
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
        prefill={{ referenceMonth: "2026-02", netAmount: 1412 }}
        onCreated={onCreated}
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /Fonte de renda/i })).toHaveValue("1");
    });
    await userEvent.click(screen.getByRole("button", { name: "Registrar" }));
    await waitFor(() => {
      expect(screen.getByText("Lançamento registrado com sucesso.")).toBeInTheDocument();
    });
    expect(onCreated).toHaveBeenCalledWith(mockStatement);
    expect(incomeSourcesService.linkTransaction).not.toHaveBeenCalled();
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
    await userEvent.click(screen.getByRole("button", { name: "Registrar" }));
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
    await userEvent.click(screen.getByRole("button", { name: "Registrar" }));
    await waitFor(() => {
      expect(screen.getByText(/vínculo com a transação importada confirmado/i)).toBeInTheDocument();
    });
    expect(incomeSourcesService.linkTransaction).toHaveBeenCalledWith(10, 99);
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
    await userEvent.click(screen.getByRole("button", { name: "Registrar" }));
    await waitFor(() => {
      expect(
        screen.getByText(/histórico registrado, mas o vínculo com a transação/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/vincular manualmente/i)).toBeInTheDocument();
    expect(screen.getByText("Lançamento registrado com sucesso.")).toBeInTheDocument();
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
    // Don't select anything — submit with empty source
    await userEvent.selectOptions(screen.getByRole("combobox"), "");
    await userEvent.click(screen.getByRole("button", { name: "Registrar" }));
    expect(screen.getByText(/selecione uma fonte/i)).toBeInTheDocument();
  });
});
