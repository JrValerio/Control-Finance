import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OperationalSummaryPanel from "./OperationalSummaryPanel";
import { dashboardService, type DashboardSnapshot } from "../services/dashboard.service";

vi.mock("../services/dashboard.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/dashboard.service")>();

  return {
    ...actual,
    dashboardService: {
      getSnapshot: vi.fn(),
    },
  };
});

const buildSnapshot = (overrides: Partial<DashboardSnapshot> = {}): DashboardSnapshot => {
  const bankBalance = overrides.bankBalance ?? 1000;
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
    consignado: {
      monthlyTotal: 0,
      contractsCount: 0,
      comprometimentoPct: null,
      ...(overrides.consignado ?? {}),
    },
  };
};

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
      expect(screen.getByText("Saldo realizado após vencidas: R$ 700,00")).toBeInTheDocument();
    });

    expect(screen.getByText("2 vencidas somam R$ 300,00")).toBeInTheDocument();
  });

  it("exibe saldo em 7 dias quando ha contas a vencer e nenhuma vencida", async () => {
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
      expect(screen.getByText("Saldo projetado em 7 dias: R$ 920,00")).toBeInTheDocument();
    });

    expect(screen.getByText("1 obrigação em 7 dias somam R$ 80,00")).toBeInTheDocument();
    expect(
      screen.getByText(
        (content) => content.includes("Urgência 7d: 1 obrigação") && content.includes("80,00"),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Saldo realizado")).not.toBeInTheDocument();
  });

  it("dispara CTA de contas em 7 dias quando callback é fornecido", async () => {
    const user = userEvent.setup();
    const onOpenDueSoonBills = vi.fn();

    vi.mocked(dashboardService.getSnapshot).mockResolvedValueOnce(
      buildSnapshot({
        bills: {
          overdueCount: 0,
          overdueTotal: 0,
          dueSoonCount: 2,
          dueSoonTotal: 150,
          upcomingCount: 0,
          upcomingTotal: 0,
        },
      }),
    );

    render(<OperationalSummaryPanel onOpenDueSoonBills={onOpenDueSoonBills} />);

    const cta = await screen.findByRole("button", { name: /Ver contas em 7 dias/i });
    await user.click(cta);

    expect(onOpenDueSoonBills).toHaveBeenCalledOnce();
  });

  it("mantem saldo disponivel quando nao ha vencidas nem contas em 7 dias", async () => {
    vi.mocked(dashboardService.getSnapshot).mockResolvedValueOnce(
      buildSnapshot({
        bankBalance: 1000,
        bills: {
          overdueCount: 0,
          overdueTotal: 0,
          dueSoonCount: 0,
          dueSoonTotal: 0,
          upcomingCount: 1,
          upcomingTotal: 120,
        },
      }),
    );

    render(<OperationalSummaryPanel />);

    await waitFor(() => {
      expect(screen.getByText("Saldo realizado")).toBeInTheDocument();
    });

    expect(screen.queryByText(/Saldo projetado em 7 dias:/)).not.toBeInTheDocument();
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
      expect(screen.getByText("Obrigações de contas")).toBeInTheDocument();
    });

    expect(screen.getByText(/480[,.]00/)).toBeInTheDocument();
    expect(screen.getByText("2 obrigações futuras")).toBeInTheDocument();
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
    expect(
      screen.getByText(
        (content) => content.includes("Urgência 7d: 1 obrigação") && content.includes("200,00"),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/2 obrigações futuras/)).toBeInTheDocument();
  });

  it("cartao separa ciclo atual e faturas pendentes quando ambos existem", async () => {
    vi.mocked(dashboardService.getSnapshot).mockResolvedValueOnce(
      buildSnapshot({
        cards: {
          openPurchasesTotal: 420,
          pendingInvoicesTotal: 900,
        },
      }),
    );

    render(<OperationalSummaryPanel />);

    await waitFor(() => {
      expect(screen.getByText("Obrigações de cartão")).toBeInTheDocument();
    });

    expect(screen.getByText("Faturas a pagar: R$ 900,00")).toBeInTheDocument();
    expect(screen.getByText("Gastos no ciclo: R$ 420,00")).toBeInTheDocument();
  });

  it("cartao mostra apenas ciclo atual quando nao ha faturas pendentes", async () => {
    vi.mocked(dashboardService.getSnapshot).mockResolvedValueOnce(
      buildSnapshot({
        cards: {
          openPurchasesTotal: 280,
          pendingInvoicesTotal: 0,
        },
      }),
    );

    render(<OperationalSummaryPanel />);

    await waitFor(() => {
      expect(screen.getByText("Obrigações de cartão")).toBeInTheDocument();
    });

    expect(screen.getByText("Gastos no ciclo: R$ 280,00")).toBeInTheDocument();
    expect(screen.queryByText(/Faturas a pagar:/)).not.toBeInTheDocument();
  });

  it("cartao mostra apenas faturas pendentes quando nao ha ciclo aberto", async () => {
    vi.mocked(dashboardService.getSnapshot).mockResolvedValueOnce(
      buildSnapshot({
        cards: {
          openPurchasesTotal: 0,
          pendingInvoicesTotal: 610,
        },
      }),
    );

    render(<OperationalSummaryPanel />);

    await waitFor(() => {
      expect(screen.getByText("Obrigações de cartão")).toBeInTheDocument();
    });

    expect(screen.getByText("Faturas a pagar: R$ 610,00")).toBeInTheDocument();
    expect(screen.queryByText(/Gastos no ciclo:/)).not.toBeInTheDocument();
  });

  it("cartao mostra estado vazio quando nao ha ciclo nem faturas", async () => {
    vi.mocked(dashboardService.getSnapshot).mockResolvedValueOnce(
      buildSnapshot({
        cards: {
          openPurchasesTotal: 0,
          pendingInvoicesTotal: 0,
        },
      }),
    );

    render(<OperationalSummaryPanel />);

    await waitFor(() => {
      expect(screen.getByText("Obrigações de cartão")).toBeInTheDocument();
    });

    expect(screen.getByText("Sem ciclo e sem fatura")).toBeInTheDocument();
  });

  it("separa renda recebida e prevista sem somar no valor principal", async () => {
    vi.mocked(dashboardService.getSnapshot).mockResolvedValueOnce(
      buildSnapshot({
        income: {
          receivedThisMonth: 1200,
          pendingThisMonth: 350,
          referenceMonth: "2026-04",
        },
      }),
    );

    render(<OperationalSummaryPanel />);

    await waitFor(() => {
      expect(screen.getByText("Renda do mês (realizada e prevista)")).toBeInTheDocument();
    });

    expect(screen.getByText("R$ 1.200,00")).toBeInTheDocument();
    expect(screen.getByText("Realizado no mês")).toBeInTheDocument();
    expect(screen.getByText("Previsto no mês: R$ 350,00")).toBeInTheDocument();
    expect(screen.queryByText("R$ 1.550,00")).not.toBeInTheDocument();
  });

  it("mantem recebido e previsto explícitos mesmo sem credito confirmado", async () => {
    vi.mocked(dashboardService.getSnapshot).mockResolvedValueOnce(
      buildSnapshot({
        income: {
          receivedThisMonth: 0,
          pendingThisMonth: 900,
          referenceMonth: "2026-04",
        },
      }),
    );

    render(<OperationalSummaryPanel />);

    await waitFor(() => {
      expect(screen.getByText("Renda do mês (realizada e prevista)")).toBeInTheDocument();
    });

    expect(screen.getByText("R$ 0,00")).toBeInTheDocument();
    expect(screen.getByText("Realizado no mês")).toBeInTheDocument();
    expect(screen.getByText("Previsto no mês: R$ 900,00")).toBeInTheDocument();
  });

  it("prioriza semanticCore no consumo de saldo e renda", async () => {
    vi.mocked(dashboardService.getSnapshot).mockResolvedValueOnce(
      buildSnapshot({
        bankBalance: 1000,
        income: {
          receivedThisMonth: 50,
          pendingThisMonth: 20,
          referenceMonth: "2026-04",
        },
        forecast: {
          projectedBalance: 400,
          month: "2026-04",
        },
        bills: {
          overdueCount: 1,
          overdueTotal: 120,
          dueSoonCount: 0,
          dueSoonTotal: 0,
          upcomingCount: 0,
          upcomingTotal: 0,
        },
        semanticCore: {
          semanticsVersion: "v1",
          realized: {
            confirmedInflowTotal: 1200,
            settledOutflowTotal: 300,
            netAmount: 900,
            referenceMonth: "2026-04",
          },
          currentPosition: {
            bankBalance: 850,
            technicalBalance: 730,
            asOf: "2026-04-15T00:00:00.000Z",
          },
          projection: {
            referenceMonth: "2026-04",
            projectedBalance: 200,
            adjustedProjectedBalance: 150,
            expectedInflow: 350,
          },
        },
      }),
    );

    render(<OperationalSummaryPanel />);

    await waitFor(() => {
      expect(screen.getByText("Saldo realizado após vencidas: R$ 730,00")).toBeInTheDocument();
    });

    expect(screen.getByText("R$ 850,00")).toBeInTheDocument();
    expect(screen.getByText("R$ 1.200,00")).toBeInTheDocument();
    expect(screen.getByText("Previsto no mês: R$ 350,00")).toBeInTheDocument();
    expect(screen.getByText("R$ 200,00")).toBeInTheDocument();
    expect(screen.queryByText("R$ 50,00")).not.toBeInTheDocument();
    expect(screen.queryByText("R$ 400,00")).not.toBeInTheDocument();
  });
});
