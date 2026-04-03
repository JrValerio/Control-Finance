import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { buildDashboardContractView, dashboardService, type DashboardSnapshot } from "./dashboard.service";

vi.mock("./api", () => ({
  api: {
    get: vi.fn(),
  },
  withApiRequestContext: vi.fn((context) => context),
}));

const getMock = vi.mocked(api.get);

const buildSnapshot = (overrides: Partial<DashboardSnapshot> = {}): DashboardSnapshot => ({
  bankBalance: 1200,
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

describe("dashboardService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normaliza snapshot com agregados de proximas contas", async () => {
    getMock.mockResolvedValueOnce({
      data: {
        bankBalance: 1200,
        bills: {
          overdueCount: 1,
          overdueTotal: 150,
          dueSoonCount: 2,
          dueSoonTotal: 220,
          upcomingCount: 3,
          upcomingTotal: 480,
        },
        cards: {
          openPurchasesTotal: 350,
          pendingInvoicesTotal: 700,
        },
        income: {
          receivedThisMonth: 2500,
          pendingThisMonth: 0,
          referenceMonth: "2026-04",
        },
        forecast: {
          projectedBalance: 900,
          month: "2026-04",
        },
        consignado: {
          monthlyTotal: 0,
          contractsCount: 0,
          comprometimentoPct: null,
        },
      },
    });

    const result = await dashboardService.getSnapshot();

    expect(getMock).toHaveBeenCalledWith("/dashboard/snapshot", undefined);
    expect(result.bills).toMatchObject({
      overdueCount: 1,
      overdueTotal: 150,
      dueSoonCount: 2,
      dueSoonTotal: 220,
      upcomingCount: 3,
      upcomingTotal: 480,
    });
  });

  it("buildDashboardContractView separa obrigacoes de cartao por tipo", () => {
    const snapshot = buildSnapshot({
      cards: {
        openPurchasesTotal: 320,
        pendingInvoicesTotal: 780,
      },
    });

    const result = buildDashboardContractView(snapshot, new Date("2026-04-15T00:00:00.000Z"));

    const cycleObligations = result.obligations.filter(
      (obligation) => obligation.obligationType === "credit_card_cycle",
    );
    const invoiceObligations = result.obligations.filter(
      (obligation) => obligation.obligationType === "open_invoice",
    );

    expect(cycleObligations).toHaveLength(1);
    expect(invoiceObligations).toHaveLength(1);
    expect(cycleObligations[0].amount).toBe(320);
    expect(invoiceObligations[0].amount).toBe(780);
  });
});
