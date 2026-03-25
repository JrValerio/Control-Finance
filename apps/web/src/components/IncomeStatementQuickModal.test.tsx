import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IncomeStatementQuickModal from "./IncomeStatementQuickModal";
import { incomeSourcesService } from "../services/incomeSources.service";

vi.mock("../services/incomeSources.service", () => ({
  incomeSourcesService: {
    list: vi.fn(),
    createStatement: vi.fn(),
  },
}));

const buildSource = (overrides = {}) => ({
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

describe("IncomeStatementQuickModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when isOpen is false", () => {
    render(
      <IncomeStatementQuickModal isOpen={false} onClose={vi.fn()} />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows guidance when no income sources exist", async () => {
    vi.mocked(incomeSourcesService.list).mockResolvedValue([]);

    render(<IncomeStatementQuickModal isOpen onClose={vi.fn()} />);

    await waitFor(() => {
      expect(
        screen.getByText(/Nenhuma fonte de renda cadastrada/i),
      ).toBeInTheDocument();
    });
  });

  it("pre-fills fields from prefill prop", async () => {
    vi.mocked(incomeSourcesService.list).mockResolvedValue([buildSource()]);

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
    vi.mocked(incomeSourcesService.list).mockResolvedValue([buildSource()]);

    render(<IncomeStatementQuickModal isOpen onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /Fonte de renda/i })).toHaveValue("1");
    });
  });

  it("submits and shows success state", async () => {
    vi.mocked(incomeSourcesService.list).mockResolvedValue([buildSource()]);
    vi.mocked(incomeSourcesService.createStatement).mockResolvedValue({
      statement: {
        id: 10,
        incomeSourceId: 1,
        referenceMonth: "2026-02",
        netAmount: 1412,
        totalDeductions: 0,
        paymentDate: null,
        status: "draft",
        postedTransactionId: null,
        createdAt: "2026-02-25T00:00:00Z",
        updatedAt: "2026-02-25T00:00:00Z",
      },
      deductions: [],
    });

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
      expect(incomeSourcesService.createStatement).toHaveBeenCalledWith(1, {
        referenceMonth: "2026-02",
        netAmount: 1412,
        paymentDate: null,
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Lançamento registrado com sucesso.")).toBeInTheDocument();
    });

    expect(onCreated).toHaveBeenCalled();
  });

  it("shows error message when createStatement rejects", async () => {
    vi.mocked(incomeSourcesService.list).mockResolvedValue([buildSource()]);
    vi.mocked(incomeSourcesService.createStatement).mockRejectedValue(
      new Error("Falha de rede"),
    );

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
});
