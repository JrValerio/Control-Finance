import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import OperationalSummaryPanel from "./OperationalSummaryPanel";
import { dashboardService, type DashboardSnapshot } from "../services/dashboard.service";

vi.mock("../services/dashboard.service", () => ({
  dashboardService: {
    getSnapshot: vi.fn(),
  },
}));

const buildSnapshot = (overrides: Partial<DashboardSnapshot> = {}): DashboardSnapshot => ({
  bankBalance: 1000,
  bills: {
    overdueCount: 0,
    overdueTotal: 0,
    dueSoonCount: 0,
    dueSoonTotal: 0,
    upcomingCount: 0,
    upcomingTotal: 0,
    ...(overrides.bills ?? {}),
  },
  cards: {
    openPurchasesTotal: 0,
    pendingInvoicesTotal: 0,
    ...(overrides.cards ?? {}),
  },
  income: {
    receivedThisMonth: 0,
    pendingThisMonth: 0,
    referenceMonth: "2026-04",
    ...(overrides.income ?? {}),
  },
  forecast: overrides.forecast ?? null,
  consignado: {
    monthlyTotal: 0,
    contractsCount: 0,
    comprometimentoPct: null,
    ...(overrides.consignado ?? {}),
  },
  ...overrides,
});

describe("OperationalSummaryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dashboardService.getSnapshot).mockResolvedValue(buildSnapshot());
  });

  it("exibe saldo tecnico quando ha contas vencidas", async () => {
    vi.mocked(dashboardService.getSnapshot).mockResolvedValueOnce(
      buildSnapshot({
        bankBalance: 1000,
        bills: {
          overdueCount: 2,
          overdueTotal: 300,
          dueSoonCount: 0,
          dueSoonTotal: 0,
          upcomingCount: 0,
          upcomingTotal: 0,
        },
      }),
    );

    render(<OperationalSummaryPanel />);

    await waitFor(() => {
      expect(screen.getByText("Saldo técnico: R$ 700,00")).toBeInTheDocument();
    });

    expect(screen.getByText("2 vencidas somam R$ 300,00")).toBeInTheDocument();
  });

  it("mantem saldo disponivel quando nao ha vencidas", async () => {
    vi.mocked(dashboardService.getSnapshot).mockResolvedValueOnce(
      buildSnapshot({
        bankBalance: 1000,
        bills: {
          overdueCount: 0,
          overdueTotal: 0,
          dueSoonCount: 1,
          dueSoonTotal: 80,
          upcomingCount: 0,
          upcomingTotal: 0,
        },
      }),
    );

    render(<OperationalSummaryPanel />);

    await waitFor(() => {
      expect(screen.getByText("Saldo disponível")).toBeInTheDocument();
    });

    expect(screen.queryByText(/Saldo técnico:/)).not.toBeInTheDocument();
  });

  it("mostra proximas contas quando nao ha urgencia imediata", async () => {
    vi.mocked(dashboardService.getSnapshot).mockResolvedValueOnce(
      buildSnapshot({
        bills: {
          overdueCount: 0,
          overdueTotal: 0,
          dueSoonCount: 0,
          dueSoonTotal: 0,
          upcomingCount: 2,
          upcomingTotal: 480,
        },
      }),
    );

    render(<OperationalSummaryPanel />);

    await waitFor(() => {
      expect(screen.getByText("Contas a pagar")).toBeInTheDocument();
    });

    expect(screen.getByText(/480[,.]00/)).toBeInTheDocument();
    expect(screen.getByText("2 próximas")).toBeInTheDocument();
  });

  it("mantem foco em urgencia imediata e sinaliza proximas no contexto", async () => {
    vi.mocked(dashboardService.getSnapshot).mockResolvedValueOnce(
      buildSnapshot({
        bills: {
          overdueCount: 1,
          overdueTotal: 100,
          dueSoonCount: 1,
          dueSoonTotal: 200,
          upcomingCount: 2,
          upcomingTotal: 900,
        },
      }),
    );

    render(<OperationalSummaryPanel />);

    await waitFor(() => {
      expect(screen.getByText("1 vencida")).toBeInTheDocument();
    });

    expect(screen.getByText(/300[,.]00/)).toBeInTheDocument();
    expect(screen.getByText(/2 próximas/)).toBeInTheDocument();
  });
});
