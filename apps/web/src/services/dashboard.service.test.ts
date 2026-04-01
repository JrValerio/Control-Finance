import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { dashboardService } from "./dashboard.service";

vi.mock("./api", () => ({
  api: {
    get: vi.fn(),
  },
  withApiRequestContext: vi.fn((context) => context),
}));

const getMock = vi.mocked(api.get);

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
});
