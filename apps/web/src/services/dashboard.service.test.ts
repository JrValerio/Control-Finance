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

const buildSnapshot = (overrides: Partial<DashboardSnapshot> = {}): DashboardSnapshot => {
  const bankBalance = overrides.bankBalance ?? 1200;
  const bills = {
    overdueCount: 0,
    overdueTotal: 0,
    dueSoonCount: 0,
    dueSoonTotal: 0,
    upcomingCount: 0,
    upcomingTotal: 0,
    ...(overrides.bills ?? {}),
  };
  const income = {
    receivedThisMonth: 0,
    pendingThisMonth: 0,
    referenceMonth: "2026-04",
    ...(overrides.income ?? {}),
  };
  const forecast = overrides.forecast ?? null;

  return {
    bankBalance,
    bills,
    cards: {
      openPurchasesTotal: 0,
      pendingInvoicesTotal: 0,
      ...(overrides.cards ?? {}),
    },
    income,
    forecast,
    semanticCore: overrides.semanticCore ?? {
      semanticsVersion: "v1",
      realized: {
        confirmedInflowTotal: income.receivedThisMonth,
        settledOutflowTotal: 0,
        netAmount: income.receivedThisMonth,
        referenceMonth: income.referenceMonth,
      },
      currentPosition: {
        bankBalance,
        technicalBalance: bankBalance - bills.overdueTotal,
        asOf: "2026-04-15T00:00:00.000Z",
      },
      projection: {
        referenceMonth: forecast?.month ?? income.referenceMonth,
        projectedBalance: forecast?.projectedBalance ?? bankBalance,
        adjustedProjectedBalance: forecast?.projectedBalance ?? bankBalance,
        expectedInflow:
          income.pendingThisMonth > 0 ? income.pendingThisMonth : null,
      },
    },
    semanticSourceMap: overrides.semanticSourceMap ?? {
      realized: ["dashboard.income.receivedThisMonth"],
      currentPosition: ["dashboard.bankBalance"],
      projection: ["dashboard.income.pendingThisMonth", "dashboard.forecast.projectedBalance"],
    },
    consignado: {
      monthlyTotal: 0,
      contractsCount: 0,
      comprometimentoPct: null,
      ...(overrides.consignado ?? {}),
    },
  };
};

describe("dashboardService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normaliza snapshot com agregados de proximas contas", async () => {
    getMock.mockResolvedValueOnce({
      data: buildSnapshot({
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
      }),
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

  it("buildDashboardContractView consome contrato semantico canonico alinhado", () => {
    const snapshot = buildSnapshot({
      bankBalance: 850,
      income: {
        receivedThisMonth: 2300,
        pendingThisMonth: 300,
        referenceMonth: "2026-04",
      },
      forecast: {
        projectedBalance: 900,
        month: "2026-04",
      },
      semanticCore: {
        semanticsVersion: "v1",
        realized: {
          confirmedInflowTotal: 2300,
          settledOutflowTotal: 700,
          netAmount: 1600,
          referenceMonth: "2026-04",
        },
        currentPosition: {
          bankBalance: 850,
          technicalBalance: 640,
          asOf: "2026-04-20T00:00:00.000Z",
        },
        projection: {
          referenceMonth: "2026-04",
          projectedBalance: 900,
          adjustedProjectedBalance: 500,
          expectedInflow: 300,
        },
      },
    });

    const result = buildDashboardContractView(snapshot, new Date("2026-04-15T00:00:00.000Z"));

    expect(result.balanceSnapshot.bankBalance).toBe(850);
    expect(result.balanceSnapshot.technicalBalance).toBe(640);
    expect(result.balanceSnapshot.asOf).toBe("2026-04-20T00:00:00.000Z");
    expect(result.incomes).toEqual([
      expect.objectContaining({
        netAmount: 2300,
        status: "confirmed",
        sourceId: "2026-04",
      }),
      expect.objectContaining({
        netAmount: 300,
        status: "pending",
        sourceId: "2026-04",
      }),
    ]);
  });

  it("falha quando detecta drift entre payload legado e contrato semantico canonico", () => {
    const snapshot = buildSnapshot();
    snapshot.semanticCore.currentPosition.bankBalance = snapshot.bankBalance + 1;

    expect(() => buildDashboardContractView(snapshot)).toThrow(/DASHBOARD_SEMANTIC_DRIFT/);
  });
});
