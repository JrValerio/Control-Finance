import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BillsSummaryWidget from "./BillsSummaryWidget";
import { billsService, type BillsSummary } from "../services/bills.service";

vi.mock("../services/bills.service", () => ({
  billsService: {
    getSummary: vi.fn(),
  },
}));

const buildSummary = (overrides: Partial<BillsSummary> = {}): BillsSummary => ({
  pendingCount: 3,
  pendingTotal: 450.0,
  overdueCount: 1,
  overdueTotal: 150.0,
  ...overrides,
});

const renderWidget = (onOpenBills?: () => void) =>
  render(<BillsSummaryWidget onOpenBills={onOpenBills} />);

describe("BillsSummaryWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(billsService.getSummary).mockResolvedValue(buildSummary());
  });

  it("renderiza loading enquanto busca dados", () => {
    vi.mocked(billsService.getSummary).mockReturnValue(new Promise(() => {}));
    renderWidget();
    expect(screen.getByText("Carregando pendências...")).toBeInTheDocument();
  });

  it("renderiza totais e contagens apos load", async () => {
    renderWidget();

    await waitFor(() => {
      expect(screen.getByText(/450[,.]00/)).toBeInTheDocument();
    });

    expect(screen.getByText(/150[,.]00/)).toBeInTheDocument();
    expect(screen.getByText("3 contas")).toBeInTheDocument();
    expect(screen.getByText("1 conta")).toBeInTheDocument();
  });

  it("exibe vencidas em vermelho quando overdueCount > 0", async () => {
    renderWidget();

    await waitFor(() => {
      expect(screen.getByText(/150[,.]00/)).toBeInTheDocument();
    });

    const overdueAmount = screen.getByText(/150[,.]00/);
    expect(overdueAmount).toHaveClass("text-red-600");

    const overdueCount = screen.getByText("1 conta");
    expect(overdueCount).toHaveClass("text-red-500");
  });

  it("nao exibe vencidas em vermelho quando overdueCount e 0", async () => {
    vi.mocked(billsService.getSummary).mockResolvedValue(
      buildSummary({ overdueCount: 0, overdueTotal: 0 }),
    );

    renderWidget();

    await waitFor(() => {
      expect(screen.getByText(/450[,.]00/)).toBeInTheDocument();
    });

    const vencidasCard = screen.getByText("Vencidas").closest("div");
    const overdueAmount = within(vencidasCard!).getByText(/0[,.]00/);
    expect(overdueAmount).not.toHaveClass("text-red-600");
  });

  it("exibe botao Ver pendencias quando onOpenBills passado", async () => {
    const onOpenBills = vi.fn();
    const user = userEvent.setup();
    renderWidget(onOpenBills);

    await waitFor(() => {
      expect(screen.getByText("Regularizar pendências →")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Regularizar pendências →"));
    expect(onOpenBills).toHaveBeenCalledOnce();
  });

  it("nao exibe botao Ver pendencias quando onOpenBills ausente", async () => {
    renderWidget();

    await waitFor(() => {
      expect(screen.getByText(/450[,.]00/)).toBeInTheDocument();
    });

    expect(screen.queryByText("Regularizar pendências →")).not.toBeInTheDocument();
  });

  it("exibe estado de risco orientativo em caso de erro do getSummary", async () => {
    vi.mocked(billsService.getSummary).mockRejectedValue(new Error("Falha de rede"));
    renderWidget();

    await waitFor(() => {
      expect(screen.queryByText("Carregando pendências...")).not.toBeInTheDocument();
    });

    expect(screen.getByText("Resumo de pendências indisponível")).toBeInTheDocument();
    expect(screen.getByText(/A consulta de contas pendentes e vencidas falhou/i)).toBeInTheDocument();
  });
});
