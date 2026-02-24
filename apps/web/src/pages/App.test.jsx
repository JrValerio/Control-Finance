import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { CATEGORY_ENTRY, CATEGORY_EXIT } from "../components/DatabaseUtils";
import { transactionsService } from "../services/transactions.service";
import { analyticsService } from "../services/analytics.service";
import { forecastService } from "../services/forecast.service";
import { profileService } from "../services/profile.service";
import { billsService } from "../services/bills.service";
import { salaryService } from "../services/salary.service";

vi.mock("../hooks/useTheme", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

vi.mock("../components/UpgradeModal", () => ({
  default: () => null,
}));

vi.mock("../components/TransactionChart", () => ({
  default: () => <div data-testid="transaction-chart" />,
}));

vi.mock("../components/TrendChart", () => ({
  default: ({ data, onMonthClick, selectedMonth }) =>
    Array.isArray(data) && data.length > 0 ? (
      <div data-testid="trend-chart">
        {selectedMonth && (
          <span data-testid="trend-selected-month">{selectedMonth}</span>
        )}
        {data.map((point) => (
          <button
            key={point.month}
            data-testid={`trend-month-${point.month}`}
            onClick={() => onMonthClick?.(point.month)}
          >
            {point.month}
          </button>
        ))}
      </div>
    ) : (
      <div>Sem dados suficientes para exibir a evolucao historica.</div>
    ),
}));

vi.mock("../services/analytics.service", () => ({
  analyticsService: {
    getMonthlyTrend: vi.fn(),
  },
}));

vi.mock("../services/forecast.service", () => ({
  forecastService: {
    getCurrent: vi.fn(),
    recompute: vi.fn(),
  },
}));

vi.mock("../services/profile.service", () => ({
  profileService: {
    getMe: vi.fn(),
    updateProfile: vi.fn(),
  },
}));

vi.mock("../services/bills.service", () => ({
  billsService: {
    getSummary: vi.fn(),
  },
}));

vi.mock("../services/salary.service", () => ({
  salaryService: {
    getProfile:    vi.fn(),
    upsertProfile: vi.fn(),
  },
}));

vi.mock("../services/transactions.service", () => ({
  transactionsService: {
    listPage: vi.fn(),
    listCategories: vi.fn(),
    getMonthlySummary: vi.fn(),
    getMonthlySummaryCompare: vi.fn(),
    getMonthlyBudgets: vi.fn(),
    createOrUpdateMonthlyBudget: vi.fn(),
    deleteMonthlyBudget: vi.fn(),
    getImportHistory: vi.fn(),
    dryRunImportCsv: vi.fn(),
    commitImportCsv: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    restore: vi.fn(),
    exportCsv: vi.fn(),
  },
}));

const buildPageResponse = (transactions = [], meta = {}) => ({
  data: transactions,
  meta: (() => {
    const hasExplicitOffset = Object.prototype.hasOwnProperty.call(meta, "offset");
    const normalizedMeta = {
      page: 1,
      limit: 20,
      total: transactions.length,
      totalPages: 1,
      ...meta,
    };

    if (!hasExplicitOffset || typeof normalizedMeta.offset !== "number") {
      normalizedMeta.offset = (normalizedMeta.page - 1) * normalizedMeta.limit;
    }

    return normalizedMeta;
  })(),
});

const buildSummaryResponse = (summary = {}) => ({
  month: "2026-02",
  income: 1000,
  expense: 350,
  balance: 650,
  byCategory: [],
  ...summary,
});

const buildSummaryCompareResponse = (summary = {}) => ({
  current: {
    income: 1000,
    expense: 350,
    balance: 650,
  },
  previous: {
    income: 900,
    expense: 300,
    balance: 600,
  },
  delta: {
    income: 100,
    expense: 50,
    balance: 50,
    incomePct: 11.11,
    expensePct: 16.67,
    balancePct: 8.33,
  },
  byCategoryDelta: [],
  ...summary,
});

const buildMonthlyBudgetsResponse = (items = []) => items;

const buildTrendResponse = (overrides = []) =>
  overrides.length > 0
    ? overrides
    : [
        { month: "2025-09", income: 1800, expense: 600, balance: 1200 },
        { month: "2025-10", income: 2000, expense: 700, balance: 1300 },
        { month: "2025-11", income: 2200, expense: 750, balance: 1450 },
        { month: "2025-12", income: 2400, expense: 800, balance: 1600 },
        { month: "2026-01", income: 2100, expense: 650, balance: 1450 },
        { month: "2026-02", income: 2500, expense: 730, balance: 1770 },
      ];

const buildImportDryRunResponse = (payload = {}) => ({
  importId: "11111111-1111-4111-8111-111111111111",
  expiresAt: "2026-03-01T10:00:00.000Z",
  summary: {
    totalRows: 2,
    validRows: 1,
    invalidRows: 1,
    income: 100,
    expense: 0,
  },
  rows: [
    {
      line: 2,
      status: "valid",
      raw: {
        date: "2026-03-01",
        type: "Entrada",
        value: "100",
        description: "Salario",
        notes: "",
        category: "",
      },
      normalized: {
        date: "2026-03-01",
        type: "Entrada",
        value: 100,
        description: "Salario",
        notes: "",
        categoryId: null,
      },
      errors: [],
    },
    {
      line: 3,
      status: "invalid",
      raw: {
        date: "2026-03-05",
        type: "Saida",
        value: "0",
        description: "Cafe",
        notes: "",
        category: "Lazer",
      },
      normalized: null,
      errors: [{ field: "value", message: "Valor invalido." }],
    },
  ],
  ...payload,
});

const buildImportHistoryResponse = (payload = {}) => ({
  items: [],
  pagination: {
    limit: 20,
    offset: 0,
  },
  ...payload,
});

const getCurrentMonthRangeForTest = (referenceDate = new Date()) => {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const formatPart = (value) => String(value).padStart(2, "0");
  const toISO = (date) =>
    `${date.getFullYear()}-${formatPart(date.getMonth() + 1)}-${formatPart(date.getDate())}`;

  return {
    startDate: toISO(new Date(year, month, 1)),
    endDate: toISO(new Date(year, month + 1, 0)),
  };
};

const createDeferred = () => {
  let resolve = () => {};
  let reject = () => {};
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    resolve,
    reject,
  };
};

describe("App", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/app");
    transactionsService.listPage.mockResolvedValue(buildPageResponse());
    transactionsService.listCategories.mockResolvedValue([]);
    transactionsService.getMonthlySummary.mockResolvedValue(buildSummaryResponse());
    transactionsService.getMonthlySummaryCompare.mockResolvedValue(
      buildSummaryCompareResponse(),
    );
    transactionsService.getMonthlyBudgets.mockResolvedValue(buildMonthlyBudgetsResponse());
    transactionsService.createOrUpdateMonthlyBudget.mockResolvedValue({});
    transactionsService.deleteMonthlyBudget.mockResolvedValue(undefined);
    transactionsService.getImportHistory.mockResolvedValue(buildImportHistoryResponse());
    transactionsService.dryRunImportCsv.mockResolvedValue(buildImportDryRunResponse());
    transactionsService.commitImportCsv.mockResolvedValue({
      imported: 1,
      summary: {
        income: 100,
        expense: 0,
        balance: 100,
      },
    });
    transactionsService.update.mockResolvedValue({});
    transactionsService.restore.mockResolvedValue({});
    analyticsService.getMonthlyTrend.mockResolvedValue(buildTrendResponse());
    forecastService.getCurrent.mockResolvedValue(null);
    forecastService.recompute.mockResolvedValue({
      month: "2026-02",
      projectedBalance: 1200,
      spendingToDate: 300,
      dailyAvgSpending: 10,
      daysRemaining: 6,
      flipDetected: false,
      flipDirection: null,
      engineVersion: "v1",
      incomeExpected: null,
      billsPendingTotal: 0,
      billsPendingCount: 0,
      adjustedProjectedBalance: 1200,
    });
    profileService.getMe.mockResolvedValue({
      id: 1,
      name: "Test User",
      email: "test@test.dev",
      profile: null,
    });
    profileService.updateProfile.mockResolvedValue({});
    billsService.getSummary.mockResolvedValue({
      pendingCount: 0,
      pendingTotal: 0,
      overdueCount: 0,
      overdueTotal: 0,
    });
    salaryService.getProfile.mockResolvedValue(null);
    transactionsService.exportCsv.mockResolvedValue({
      blob: new Blob(["id,type\n1,Entrada"], { type: "text/csv;charset=utf-8" }),
      fileName: "transacoes.csv",
    });
  });

  it("carrega transacoes paginadas da API ao iniciar", async () => {
    transactionsService.listPage.mockResolvedValueOnce(
      buildPageResponse(
        [{ id: 1, value: 45, type: CATEGORY_ENTRY, date: "2026-02-13", description: "Freela" }],
        { page: 1, total: 45, totalPages: 3 },
      ),
    );

    render(<App />);

    expect(await screen.findByText("Freela")).toBeInTheDocument();
    expect(screen.getByText("Pagina 1 de 3")).toBeInTheDocument();
    expect(screen.getByText("Mostrando 1-1 de 45")).toBeInTheDocument();
    expect(transactionsService.listPage).toHaveBeenCalledWith({
      limit: 20,
      offset: 0,
      sort: "date:asc",
      from: undefined,
      to: undefined,
      type: undefined,
      categoryId: undefined,
    });
  });

  it("carrega resumo mensal e exibe cards com valores da API", async () => {
    transactionsService.getMonthlySummary.mockResolvedValueOnce(
      buildSummaryResponse({
        month: "2026-02",
        income: 1500,
        expense: 420.5,
        balance: 1079.5,
      }),
    );

    render(<App />);

    expect(await screen.findByText("R$ 1.079,50")).toBeInTheDocument();
    expect(screen.getByText("R$ 1.500,00")).toBeInTheDocument();
    expect(screen.getByText("R$ 420,50")).toBeInTheDocument();
    expect(transactionsService.getMonthlySummary).toHaveBeenCalledWith(expect.any(String));
  });

  it("exibe comparativo mensal (MoM) com direcao, percentual e delta absoluto", async () => {
    transactionsService.getMonthlySummary.mockResolvedValueOnce(
      buildSummaryResponse({
        month: "2026-02",
        income: 1300,
        expense: 280,
        balance: 1020,
      }),
    );
    transactionsService.getMonthlySummaryCompare.mockResolvedValueOnce(
      buildSummaryCompareResponse({
        current: {
          income: 1300,
          expense: 280,
          balance: 1020,
        },
        previous: {
          income: 1200,
          expense: 300,
          balance: 900,
        },
        delta: {
          income: 100,
          expense: -20,
          balance: 120,
          incomePct: 8.33,
          expensePct: -6.67,
          balancePct: 13.33,
        },
      }),
    );

    render(<App />);

    expect(await screen.findByText("R$ 1.020,00")).toBeInTheDocument();
    expect(screen.getByTestId("mom-income")).toHaveTextContent("MoM: ↑ +8.3% (+R$ 100,00)");
    expect(screen.getByTestId("mom-balance")).toHaveTextContent("MoM: ↑ +13.3% (+R$ 120,00)");
    expect(screen.getByTestId("mom-expense")).toHaveTextContent("MoM: ↓ -6.7% (-R$ 20,00)");
    expect(screen.getByTestId("mom-expense")).toHaveClass("text-green-200");
  });

  it("mostra percentual MoM como indisponivel quando mes anterior e zero", async () => {
    transactionsService.getMonthlySummary.mockResolvedValueOnce(
      buildSummaryResponse({
        month: "2026-02",
        income: 100,
        expense: 0,
        balance: 100,
      }),
    );
    transactionsService.getMonthlySummaryCompare.mockResolvedValueOnce(
      buildSummaryCompareResponse({
        current: {
          income: 100,
          expense: 0,
          balance: 100,
        },
        previous: {
          income: 0,
          expense: 0,
          balance: 0,
        },
        delta: {
          income: 100,
          expense: 0,
          balance: 100,
          incomePct: null,
          expensePct: 0,
          balancePct: null,
        },
      }),
    );

    render(<App />);

    expect(await screen.findByTestId("mom-income")).toBeInTheDocument();
    expect(screen.getByTestId("mom-income")).toHaveTextContent("MoM: ↑ — (+R$ 100,00)");
  });

  it("exibe loading de comparacao mensal enquanto os resumos sao carregados", async () => {
    const currentMonthDeferred = createDeferred();
    const compareDeferred = createDeferred();

    transactionsService.getMonthlySummary.mockReturnValueOnce(currentMonthDeferred.promise);
    transactionsService.getMonthlySummaryCompare.mockReturnValueOnce(compareDeferred.promise);

    render(<App />);

    expect(await screen.findByTestId("mom-balance")).toHaveTextContent("MoM: Calculando...");
    expect(screen.getByTestId("mom-income")).toHaveTextContent("MoM: Calculando...");
    expect(screen.getByTestId("mom-expense")).toHaveTextContent("MoM: Calculando...");

    await act(async () => {
      currentMonthDeferred.resolve(
        buildSummaryResponse({
          month: "2026-02",
          income: 200,
          expense: 50,
          balance: 150,
        }),
      );
      compareDeferred.resolve(
        buildSummaryCompareResponse({
          current: {
            income: 200,
            expense: 50,
            balance: 150,
          },
          previous: {
            income: 100,
            expense: 70,
            balance: 30,
          },
          delta: {
            income: 100,
            expense: -20,
            balance: 120,
            incomePct: 100,
            expensePct: -28.57,
            balancePct: 400,
          },
        }),
      );
    });

    expect(screen.getByTestId("mom-balance")).not.toHaveTextContent("MoM: Calculando...");
  });

  it("mostra fallback de MoM quando comparacao mensal falha", async () => {
    transactionsService.getMonthlySummary.mockResolvedValueOnce(
      buildSummaryResponse({
        month: "2026-02",
        income: 1100,
        expense: 400,
        balance: 700,
      }),
    );
    transactionsService.getMonthlySummaryCompare.mockRejectedValueOnce({
      response: { data: { message: "Comparacao mensal indisponivel." } },
    });

    render(<App />);

    expect(await screen.findByText("R$ 700,00")).toBeInTheDocument();
    expect(await screen.findByText("Comparacao mensal indisponivel.")).toBeInTheDocument();
    expect(screen.getByTestId("mom-income")).toHaveTextContent("MoM: —");
    expect(screen.getByTestId("mom-balance")).toHaveTextContent("MoM: —");
    expect(screen.getByTestId("mom-expense")).toHaveTextContent("MoM: —");
  });

  it("exibe top 3 variacoes por categoria ordenadas por maior delta absoluto", async () => {
    transactionsService.getMonthlySummaryCompare.mockResolvedValueOnce(
      buildSummaryCompareResponse({
        byCategoryDelta: [
          {
            categoryId: 1,
            categoryName: "Alimentacao",
            current: 900,
            previous: 700,
            delta: 200,
            deltaPct: 28.57,
          },
          {
            categoryId: 2,
            categoryName: "Transporte",
            current: 280,
            previous: 400,
            delta: -120,
            deltaPct: -30,
          },
          {
            categoryId: 3,
            categoryName: "Lazer",
            current: 340,
            previous: 250,
            delta: 90,
            deltaPct: 36,
          },
          {
            categoryId: 4,
            categoryName: "Saude",
            current: 240,
            previous: 260,
            delta: -20,
            deltaPct: -7.69,
          },
        ],
      }),
    );

    render(<App />);

    const moversRegion = await screen.findByRole("region", {
      name: "Top variacoes por categoria",
    });
    const moverItems = within(moversRegion).getAllByTestId("category-mover-item");

    expect(moverItems).toHaveLength(3);
    expect(within(moverItems[0]).getByText("Alimentacao")).toBeInTheDocument();
    expect(within(moverItems[1]).getByText("Transporte")).toBeInTheDocument();
    expect(within(moverItems[2]).getByText("Lazer")).toBeInTheDocument();
  });

  it("exibe fallback de top variacoes quando byCategoryDelta esta vazio", async () => {
    transactionsService.getMonthlySummaryCompare.mockResolvedValueOnce(
      buildSummaryCompareResponse({
        byCategoryDelta: [],
      }),
    );

    render(<App />);

    expect(
      await screen.findByText("Sem variacoes por categoria para o comparativo do mes."),
    ).toBeInTheDocument();
  });

  it("aplica filtro por categoria ao clicar em ver transacoes no top mover", async () => {
    const user = userEvent.setup();
    transactionsService.listCategories.mockResolvedValueOnce([{ id: 5, name: "Mercado" }]);
    transactionsService.getMonthlySummaryCompare.mockResolvedValueOnce(
      buildSummaryCompareResponse({
        byCategoryDelta: [
          {
            categoryId: 5,
            categoryName: "Mercado",
            current: 820,
            previous: 640,
            delta: 180,
            deltaPct: 28.13,
          },
        ],
      }),
    );

    render(<App />);

    await screen.findByRole("region", { name: "Top variacoes por categoria" });
    await user.click(screen.getByRole("button", { name: "Ver transacoes categoria: Mercado" }));

    await waitFor(() => {
      const calls = transactionsService.listPage.mock.calls;
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall.categoryId).toBe(5);
      expect(lastCall.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(lastCall.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    expect(screen.getByLabelText("Categoria")).toHaveValue("5");
  });

  it("carrega metas mensais e exibe progresso por categoria", async () => {
    transactionsService.getMonthlyBudgets.mockResolvedValueOnce(
      buildMonthlyBudgetsResponse([
        {
          id: 1,
          categoryId: 3,
          categoryName: "Alimentacao",
          month: "2026-02",
          budget: 1000,
          actual: 855.5,
          remaining: 144.5,
          percentage: 85.55,
          status: "near_limit",
        },
      ]),
    );

    render(<App />);

    expect((await screen.findAllByText("Alimentacao")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Proximo do limite").length).toBeGreaterThan(0);
    expect(screen.getByText("Orcado: R$ 1.000,00")).toBeInTheDocument();
    expect(screen.getByText("Realizado: R$ 855,50")).toBeInTheDocument();
    expect(screen.getByText("Restante: R$ 144,50")).toBeInTheDocument();
    expect(screen.getByText("Uso: 85.55%")).toBeInTheDocument();
    expect(transactionsService.getMonthlyBudgets).toHaveBeenCalledWith(expect.any(String));
  });

  it("exibe alertas de orcamento e prioriza status exceeded", async () => {
    transactionsService.getMonthlyBudgets.mockResolvedValueOnce(
      buildMonthlyBudgetsResponse([
        {
          id: 1,
          categoryId: 3,
          categoryName: "Alimentacao",
          month: "2026-02",
          budget: 1000,
          actual: 820,
          remaining: 180,
          percentage: 82,
          status: "near_limit",
        },
        {
          id: 2,
          categoryId: 7,
          categoryName: "Moradia",
          month: "2026-02",
          budget: 1500,
          actual: 1700,
          remaining: -200,
          percentage: 113.33,
          status: "exceeded",
        },
        {
          id: 3,
          categoryId: 8,
          categoryName: "Saude",
          month: "2026-02",
          budget: 400,
          actual: 120,
          remaining: 280,
          percentage: 30,
          status: "ok",
        },
      ]),
    );

    render(<App />);

    const alertRegion = await screen.findByRole("region", { name: "Alertas de orcamento" });
    const alertItems = within(alertRegion).getAllByTestId("budget-alert-item");

    expect(alertItems).toHaveLength(2);
    expect(within(alertItems[0]).getByText("Moradia")).toBeInTheDocument();
    expect(within(alertItems[1]).getByText("Alimentacao")).toBeInTheDocument();
  });

  it("exibe banner proativo quando existe meta em near_limit", async () => {
    transactionsService.getMonthlyBudgets.mockResolvedValueOnce(
      buildMonthlyBudgetsResponse([
        {
          id: 21,
          categoryId: 4,
          categoryName: "Alimentacao",
          month: "2026-02",
          budget: 1200,
          actual: 984,
          remaining: 216,
          percentage: 82,
          status: "near_limit",
        },
      ]),
    );

    render(<App />);

    const proactiveBanner = await screen.findByTestId("budget-near-limit-banner");
    expect(proactiveBanner).toHaveTextContent(
      "Alerta: voce ja utilizou 82.00% da meta de Alimentacao neste mes.",
    );
  });

  it("nao exibe banner proativo quando existem apenas metas exceeded", async () => {
    transactionsService.getMonthlyBudgets.mockResolvedValueOnce(
      buildMonthlyBudgetsResponse([
        {
          id: 22,
          categoryId: 10,
          categoryName: "Moradia",
          month: "2026-02",
          budget: 1800,
          actual: 2000,
          remaining: -200,
          percentage: 111.11,
          status: "exceeded",
        },
      ]),
    );

    render(<App />);

    expect((await screen.findAllByText("Moradia")).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("budget-near-limit-banner")).not.toBeInTheDocument();
  });

  it("aplica filtro de categoria e periodo ao clicar em ver transacoes no alerta", async () => {
    const user = userEvent.setup();
    transactionsService.listCategories.mockResolvedValueOnce([{ id: 9, name: "Lazer" }]);
    transactionsService.getMonthlyBudgets.mockResolvedValueOnce(
      buildMonthlyBudgetsResponse([
        {
          id: 4,
          categoryId: 9,
          categoryName: "Lazer",
          month: "2026-02",
          budget: 300,
          actual: 320,
          remaining: -20,
          percentage: 106.67,
          status: "exceeded",
        },
      ]),
    );

    render(<App />);

    await screen.findByRole("region", { name: "Alertas de orcamento" });
    await user.click(screen.getByRole("button", { name: "Ver transacoes: Lazer" }));

    await waitFor(() => {
      const calls = transactionsService.listPage.mock.calls;
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall.categoryId).toBe(9);
      expect(lastCall.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(lastCall.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    expect(screen.getByLabelText("Categoria")).toHaveValue("9");
  });

  it("abre modal de edicao ao clicar em ajustar meta no alerta", async () => {
    const user = userEvent.setup();
    transactionsService.getMonthlyBudgets.mockResolvedValueOnce(
      buildMonthlyBudgetsResponse([
        {
          id: 5,
          categoryId: 11,
          categoryName: "Educacao",
          month: "2026-02",
          budget: 700,
          actual: 620,
          remaining: 80,
          percentage: 88.57,
          status: "near_limit",
        },
      ]),
    );

    render(<App />);

    await screen.findByRole("region", { name: "Alertas de orcamento" });
    await user.click(screen.getByRole("button", { name: "Ajustar meta: Educacao" }));

    const budgetDialog = screen.getByRole("dialog", { name: "Meta do mes" });
    expect(within(budgetDialog).getByText("Editando:")).toBeInTheDocument();
    expect(within(budgetDialog).getByText("Educacao")).toBeInTheDocument();
  });

  it("nao exibe centro de alertas quando todas as metas estao dentro do limite", async () => {
    transactionsService.getMonthlyBudgets.mockResolvedValueOnce(
      buildMonthlyBudgetsResponse([
        {
          id: 6,
          categoryId: 12,
          categoryName: "Transporte",
          month: "2026-02",
          budget: 500,
          actual: 200,
          remaining: 300,
          percentage: 40,
          status: "ok",
        },
      ]),
    );

    render(<App />);

    expect(await screen.findByText("Transporte")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Alertas de orcamento" })).not.toBeInTheDocument();
  });

  it("exibe erro nas metas mensais e permite tentar novamente", async () => {
    const user = userEvent.setup();
    transactionsService.getMonthlyBudgets
      .mockRejectedValueOnce({})
      .mockResolvedValueOnce(
        buildMonthlyBudgetsResponse([
          {
            id: 2,
            categoryId: 7,
            categoryName: "Transporte",
            month: "2026-02",
            budget: 600,
            actual: 250,
            remaining: 350,
            percentage: 41.67,
            status: "ok",
          },
        ]),
      );

    render(<App />);

    expect(await screen.findByText("Nao foi possivel carregar as metas mensais.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Transporte")).toBeInTheDocument();
    expect(screen.queryByText("Nao foi possivel carregar as metas mensais.")).not.toBeInTheDocument();
  });

  it("exibe CTA de empty state e abre modal de meta", async () => {
    const user = userEvent.setup();
    transactionsService.listCategories.mockResolvedValueOnce([{ id: 9, name: "Lazer" }]);
    transactionsService.getMonthlyBudgets.mockResolvedValueOnce(buildMonthlyBudgetsResponse([]));

    render(<App />);

    expect(await screen.findByText("Nenhuma meta cadastrada para o mes selecionado.")).toBeInTheDocument();
    const emptyStateCta = screen.getByRole("button", { name: "Criar meta" });
    expect(emptyStateCta).toBeEnabled();

    await user.click(emptyStateCta);

    expect(screen.getByRole("dialog", { name: "Meta do mes" })).toBeInTheDocument();
  });

  it("exibe categoria bloqueada no modo edicao de meta", async () => {
    const user = userEvent.setup();
    transactionsService.getMonthlyBudgets.mockResolvedValueOnce(
      buildMonthlyBudgetsResponse([
        {
          id: 12,
          categoryId: 7,
          categoryName: "Transporte",
          month: "2026-02",
          budget: 600,
          actual: 240,
          remaining: 360,
          percentage: 40,
          status: "ok",
        },
      ]),
    );

    render(<App />);

    expect(await screen.findByText("Transporte")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Editar meta: Transporte" }));

    const budgetDialog = screen.getByRole("dialog", { name: "Meta do mes" });
    expect(within(budgetDialog).getByText("Editando:")).toBeInTheDocument();
    expect(within(budgetDialog).getByText("Transporte")).toBeInTheDocument();
    expect(within(budgetDialog).getByText("Categoria bloqueada no modo edicao")).toBeInTheDocument();
    expect(within(budgetDialog).getByLabelText("Categoria da meta")).toBeDisabled();
  });

  it("cria meta mensal e recarrega cards de metas", async () => {
    const user = userEvent.setup();
    transactionsService.listCategories.mockResolvedValueOnce([{ id: 3, name: "Alimentacao" }]);
    transactionsService.getMonthlyBudgets
      .mockResolvedValueOnce(buildMonthlyBudgetsResponse([]))
      .mockResolvedValueOnce(
        buildMonthlyBudgetsResponse([
          {
            id: 10,
            categoryId: 3,
            categoryName: "Alimentacao",
            month: "2026-02",
            budget: 900,
            actual: 150,
            remaining: 750,
            percentage: 16.67,
            status: "ok",
          },
        ]),
      );

    render(<App />);

    const newBudgetButton = screen.getByRole("button", { name: "+ Nova meta" });
    await waitFor(() => expect(newBudgetButton).toBeEnabled());
    await user.click(newBudgetButton);

    const budgetDialog = screen.getByRole("dialog", { name: "Meta do mes" });
    await user.selectOptions(within(budgetDialog).getByLabelText("Categoria da meta"), "3");
    await user.type(within(budgetDialog).getByLabelText("Valor da meta"), "900");
    await user.click(within(budgetDialog).getByRole("button", { name: "Salvar meta" }));

    expect(transactionsService.createOrUpdateMonthlyBudget).toHaveBeenCalledWith({
      categoryId: 3,
      month: expect.any(String),
      amount: 900,
    });
    expect(await screen.findByText("Orcado: R$ 900,00")).toBeInTheDocument();
  });

  it("exclui meta mensal e recarrega estado vazio", async () => {
    const user = userEvent.setup();
    const confirmMock = vi.spyOn(window, "confirm").mockReturnValue(true);
    transactionsService.getMonthlyBudgets
      .mockResolvedValueOnce(
        buildMonthlyBudgetsResponse([
          {
            id: 11,
            categoryId: 7,
            categoryName: "Transporte",
            month: "2026-02",
            budget: 600,
            actual: 240,
            remaining: 360,
            percentage: 40,
            status: "ok",
          },
        ]),
      )
      .mockResolvedValueOnce(buildMonthlyBudgetsResponse([]));

    try {
      render(<App />);

      expect(await screen.findByText("Transporte")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Excluir meta: Transporte" }));

      expect(transactionsService.deleteMonthlyBudget).toHaveBeenCalledWith(11);
      expect(await screen.findByText("Nenhuma meta cadastrada para o mes selecionado.")).toBeInTheDocument();
    } finally {
      confirmMock.mockRestore();
    }
  });

  it("aplica filtro por categoria e envia categoryId para listagem", async () => {
    const user = userEvent.setup();
    transactionsService.listCategories.mockResolvedValueOnce([
      { id: 1, name: "Alimentacao" },
      { id: 2, name: "Transporte" },
    ]);
    transactionsService.listPage
      .mockResolvedValueOnce(
        buildPageResponse([
          {
            id: 1,
            value: 100,
            type: CATEGORY_EXIT,
            date: "2026-02-13",
            description: "Inicial",
            categoryId: null,
          },
        ]),
      )
      .mockResolvedValueOnce(
        buildPageResponse([
          {
            id: 2,
            value: 90,
            type: CATEGORY_EXIT,
            date: "2026-02-14",
            description: "Filtrada",
            categoryId: 1,
          },
        ]),
      );

    render(<App />);

    expect(await screen.findByText("Inicial")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await user.selectOptions(screen.getByLabelText("Categoria"), "1");
    expect(await screen.findByText("Filtrada")).toBeInTheDocument();
    expect(screen.getAllByText("Categoria: Alimentacao").length).toBeGreaterThan(0);
    expect(transactionsService.listPage).toHaveBeenLastCalledWith({
      limit: 20,
      offset: 0,
      sort: "date:asc",
      from: undefined,
      to: undefined,
      type: undefined,
      categoryId: 1,
    });
  });

  it("aplica sort da querystring ao carregar transacoes", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/app?sort=amount:desc&limit=20&offset=0");
    transactionsService.listPage.mockResolvedValueOnce(
      buildPageResponse([
        {
          id: 1,
          value: 120,
          type: CATEGORY_ENTRY,
          date: "2026-02-15",
          description: "Ordenada por valor",
        },
      ]),
    );

    render(<App />);

    expect(await screen.findByText("Ordenada por valor")).toBeInTheDocument();
    expect(transactionsService.listPage).toHaveBeenCalledWith({
      limit: 20,
      offset: 0,
      sort: "amount:desc",
      from: undefined,
      to: undefined,
      type: undefined,
      categoryId: undefined,
    });
    await user.click(screen.getByRole("button", { name: "Filtros" }));
    expect(screen.getByLabelText("Ordenar por")).toHaveValue("amount:desc");
  });

  it("altera sort, reseta offset e atualiza querystring", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/app?limit=20&offset=0&sort=date:asc");
    transactionsService.listPage
      .mockResolvedValueOnce(
        buildPageResponse(
          [
            {
              id: 3,
              value: 10,
              type: CATEGORY_ENTRY,
              date: "2026-02-13",
              description: "Pagina inicial",
            },
          ],
          { page: 1, limit: 20, offset: 0, total: 45, totalPages: 3 },
        ),
      )
      .mockResolvedValueOnce(
        buildPageResponse(
          [
            {
              id: 2,
              value: 50,
              type: CATEGORY_ENTRY,
              date: "2026-02-15",
              description: "Antes do sort",
            },
          ],
          { page: 2, limit: 20, offset: 20, total: 45, totalPages: 3 },
        ),
      )
      .mockResolvedValueOnce(
        buildPageResponse(
          [
            {
              id: 1,
              value: 120,
              type: CATEGORY_ENTRY,
              date: "2026-02-14",
              description: "Apos sort",
            },
          ],
          { page: 1, limit: 20, offset: 0, total: 45, totalPages: 3 },
        ),
      );

    render(<App />);

    expect(await screen.findByText("Pagina inicial")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Proxima" }));
    expect(await screen.findByText("Antes do sort")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await user.selectOptions(screen.getByLabelText("Ordenar por"), "amount:desc");

    expect(await screen.findByText("Apos sort")).toBeInTheDocument();
    expect(transactionsService.listPage).toHaveBeenLastCalledWith({
      limit: 20,
      offset: 0,
      sort: "amount:desc",
      from: undefined,
      to: undefined,
      type: undefined,
      categoryId: undefined,
    });
    expect(window.location.search).toContain("sort=amount%3Adesc");
    expect(window.location.search).toContain("offset=0");
  });

  it("aplica q da querystring ao carregar transacoes", async () => {
    window.history.replaceState(null, "", "/app?q=mercado&limit=20&offset=0");
    transactionsService.listPage.mockResolvedValueOnce(
      buildPageResponse([
        {
          id: 1,
          value: 95,
          type: CATEGORY_EXIT,
          date: "2026-02-16",
          description: "Mercado do mes",
        },
      ]),
    );

    render(<App />);

    expect(await screen.findByText("Mercado do mes")).toBeInTheDocument();
    expect(transactionsService.listPage).toHaveBeenCalledWith({
      limit: 20,
      offset: 0,
      sort: "date:asc",
      q: "mercado",
      from: undefined,
      to: undefined,
      type: undefined,
      categoryId: undefined,
    });
    expect(screen.getByLabelText("Buscar")).toHaveValue("mercado");
  });

  it("aplica busca via submit, reseta offset e atualiza querystring", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/app?limit=20&offset=40&sort=date:asc");
    const beforeSearchResponse = buildPageResponse(
      [
        {
          id: 3,
          value: 80,
          type: CATEGORY_EXIT,
          date: "2026-02-12",
          description: "Antes da busca",
        },
      ],
      { page: 3, limit: 20, offset: 40, total: 95, totalPages: 5 },
    );
    const afterSearchResponse = buildPageResponse(
      [
        {
          id: 4,
          value: 40,
          type: CATEGORY_EXIT,
          date: "2026-02-13",
          description: "Depois da busca",
        },
      ],
      { page: 1, limit: 20, offset: 0, total: 1, totalPages: 1 },
    );

    transactionsService.listPage.mockImplementation(({ q, offset }) => {
      if (q === "padaria" && offset === 0) {
        return Promise.resolve(afterSearchResponse);
      }

      return Promise.resolve(beforeSearchResponse);
    });

    render(<App />);

    expect(await screen.findByText("Antes da busca")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await user.type(screen.getByLabelText("Buscar"), "padaria");
    await user.click(screen.getByRole("button", { name: "Aplicar" }));

    expect(await screen.findByText("Depois da busca")).toBeInTheDocument();
    expect(transactionsService.listPage).toHaveBeenLastCalledWith({
      limit: 20,
      offset: 0,
      sort: "date:asc",
      q: "padaria",
      from: undefined,
      to: undefined,
      type: undefined,
      categoryId: undefined,
    });
    expect(window.location.search).toContain("q=padaria");
    expect(window.location.search).toContain("offset=0");
  });

  it("pressiona Escape para limpar busca digitada sem reaplicar filtros", async () => {
    const user = userEvent.setup();
    transactionsService.listPage.mockResolvedValueOnce(
      buildPageResponse([
        {
          id: 31,
          value: 120,
          type: CATEGORY_ENTRY,
          date: "2026-02-16",
          description: "Lista inicial",
        },
      ]),
    );

    render(<App />);

    expect(await screen.findByText("Lista inicial")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Filtros" }));
    const searchInput = screen.getByLabelText("Buscar");
    const initialCallCount = transactionsService.listPage.mock.calls.length;

    await user.type(searchInput, "mercado");
    expect(searchInput).toHaveValue("mercado");

    await user.keyboard("{Escape}");

    expect(searchInput).toHaveValue("");
    expect(transactionsService.listPage).toHaveBeenCalledTimes(initialCallCount);
    expect(new URLSearchParams(window.location.search).get("q")).toBeNull();
  });

  it("pressiona Escape para remover busca aplicada e resetar offset", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/app?limit=20&offset=20&sort=date:asc&q=mercado");
    const withQueryResponse = buildPageResponse(
      [
        {
          id: 32,
          value: 95,
          type: CATEGORY_EXIT,
          date: "2026-02-14",
          description: "Com busca aplicada",
        },
      ],
      { page: 2, limit: 20, offset: 20, total: 45, totalPages: 3 },
    );
    const withoutQueryResponse = buildPageResponse(
      [
        {
          id: 33,
          value: 70,
          type: CATEGORY_EXIT,
          date: "2026-02-15",
          description: "Sem busca aplicada",
        },
      ],
      { page: 1, limit: 20, offset: 0, total: 1, totalPages: 1 },
    );

    transactionsService.listPage.mockImplementation((params) => {
      if (!Object.prototype.hasOwnProperty.call(params, "q") && params.offset === 0) {
        return Promise.resolve(withoutQueryResponse);
      }

      return Promise.resolve(withQueryResponse);
    });

    render(<App />);

    expect(await screen.findByText("Com busca aplicada")).toBeInTheDocument();

    const searchInput = screen.getByLabelText("Buscar");
    searchInput.focus();
    await user.keyboard("{Escape}");

    expect(await screen.findByText("Sem busca aplicada")).toBeInTheDocument();
    const lastCallParams =
      transactionsService.listPage.mock.calls[transactionsService.listPage.mock.calls.length - 1][0];
    expect(lastCallParams).not.toHaveProperty("q");
    expect(lastCallParams.offset).toBe(0);
    expect(searchInput).toHaveFocus();

    const params = new URLSearchParams(window.location.search);
    expect(params.get("q")).toBeNull();
    expect(params.get("offset")).toBe("0");
  });

  it("aplica preset Este mes com periodo personalizado e offset 0", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/app?limit=20&offset=40&sort=date:asc");
    const { startDate, endDate } = getCurrentMonthRangeForTest();
    const beforePresetResponse = buildPageResponse(
      [
        {
          id: 9,
          value: 85,
          type: CATEGORY_EXIT,
          date: "2026-02-10",
          description: "Antes do preset",
        },
      ],
      { page: 3, limit: 20, offset: 40, total: 95, totalPages: 5 },
    );
    const afterPresetResponse = buildPageResponse(
      [
        {
          id: 10,
          value: 60,
          type: CATEGORY_EXIT,
          date: "2026-02-11",
          description: "Depois do preset",
        },
      ],
      { page: 1, limit: 20, offset: 0, total: 2, totalPages: 1 },
    );

    transactionsService.listPage.mockImplementation(({ from, to, offset }) => {
      if (from === startDate && to === endDate && offset === 0) {
        return Promise.resolve(afterPresetResponse);
      }

      return Promise.resolve(beforePresetResponse);
    });

    render(<App />);

    expect(await screen.findByText("Antes do preset")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Filtros" }));
    expect(screen.getByRole("button", { name: "Este mes" })).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "Este mes" }));

    expect(await screen.findByText("Depois do preset")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Este mes" })).not.toBeInTheDocument();
    expect(screen.getByText("Filtros ativos (1)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar filtros" })).toBeInTheDocument();
    expect(screen.getByText(`Periodo: ${startDate} -> ${endDate}`)).toBeInTheDocument();
    expect(transactionsService.listPage).toHaveBeenLastCalledWith({
      limit: 20,
      offset: 0,
      sort: "date:asc",
      from: startDate,
      to: endDate,
      type: undefined,
      categoryId: undefined,
    });

    const params = new URLSearchParams(window.location.search);
    expect(params.get("period")).toBe("Personalizado");
    expect(params.get("from")).toBe(startDate);
    expect(params.get("to")).toBe(endDate);
    expect(params.get("offset")).toBe("0");
  });

  it("limpa filtros ativos e remove q da URL com offset 0", async () => {
    const user = userEvent.setup();
    window.history.replaceState(
      null,
      "",
      "/app?limit=20&offset=20&sort=date:asc&q=padaria&type=Entrada&period=Personalizado&from=2026-02-01&to=2026-02-29&categoryId=3",
    );
    const filteredResponse = buildPageResponse(
      [
        {
          id: 11,
          value: 90,
          type: CATEGORY_ENTRY,
          date: "2026-02-12",
          description: "Com filtros",
        },
      ],
      { page: 2, limit: 20, offset: 20, total: 45, totalPages: 3 },
    );
    const clearedResponse = buildPageResponse(
      [
        {
          id: 12,
          value: 70,
          type: CATEGORY_ENTRY,
          date: "2026-02-13",
          description: "Sem filtros",
        },
      ],
      { page: 1, limit: 20, offset: 0, total: 1, totalPages: 1 },
    );

    transactionsService.listPage.mockImplementation((params) => {
      if (
        !Object.prototype.hasOwnProperty.call(params, "q") &&
        params.type === undefined &&
        params.from === undefined &&
        params.to === undefined &&
        params.categoryId === undefined &&
        params.offset === 0
      ) {
        return Promise.resolve(clearedResponse);
      }

      return Promise.resolve(filteredResponse);
    });

    render(<App />);

    expect(await screen.findByText("Com filtros")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Limpar tudo" }));

    expect(await screen.findByText("Sem filtros")).toBeInTheDocument();
    expect(transactionsService.listPage).toHaveBeenLastCalledWith({
      limit: 20,
      offset: 0,
      sort: "date:asc",
      from: undefined,
      to: undefined,
      type: undefined,
      categoryId: undefined,
    });
    const lastCallParams =
      transactionsService.listPage.mock.calls[transactionsService.listPage.mock.calls.length - 1][0];
    expect(lastCallParams).not.toHaveProperty("q");

    const params = new URLSearchParams(window.location.search);
    expect(params.get("q")).toBeNull();
    expect(params.get("type")).toBeNull();
    expect(params.get("from")).toBeNull();
    expect(params.get("to")).toBeNull();
    expect(params.get("categoryId")).toBeNull();
    expect(params.get("offset")).toBe("0");
  });

  it("mostra indicador de filtros ativos e exibe limpar filtros quando necessario", async () => {
    const user = userEvent.setup();
    const withoutFiltersResponse = buildPageResponse(
      [
        {
          id: 21,
          value: 30,
          type: CATEGORY_ENTRY,
          date: "2026-02-18",
          description: "Sem filtros ativos",
        },
      ],
      { page: 1, limit: 20, offset: 0, total: 1, totalPages: 1 },
    );
    const withFiltersResponse = buildPageResponse(
      [
        {
          id: 22,
          value: 40,
          type: CATEGORY_ENTRY,
          date: "2026-02-19",
          description: "Com filtros ativos",
        },
      ],
      { page: 1, limit: 20, offset: 0, total: 1, totalPages: 1 },
    );
    const withTwoFiltersResponse = buildPageResponse(
      [
        {
          id: 23,
          value: 50,
          type: CATEGORY_ENTRY,
          date: "2026-02-20",
          description: "Com dois filtros ativos",
        },
      ],
      { page: 1, limit: 20, offset: 0, total: 1, totalPages: 1 },
    );

    transactionsService.listPage.mockImplementation(({ q, type }) => {
      if (q === "mercado" && type === CATEGORY_ENTRY) {
        return Promise.resolve(withTwoFiltersResponse);
      }

      if (q === "mercado") {
        return Promise.resolve(withFiltersResponse);
      }

      return Promise.resolve(withoutFiltersResponse);
    });

    render(<App />);

    expect(await screen.findByText("Sem filtros ativos")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Filtros" }));
    expect(screen.getByRole("button", { name: "Este mes" })).toBeInTheDocument();
    expect(screen.queryByText(/Filtros ativos \(\d+\)/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Limpar tudo" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Buscar"), "mercado");
    await user.click(screen.getByRole("button", { name: "Aplicar" }));

    expect(await screen.findByText("Com filtros ativos")).toBeInTheDocument();
    expect(screen.getByText("Filtros ativos (1)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Limpar tudo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Este mes" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar filtros" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Filtrar entradas" }));
    expect(await screen.findByText("Com dois filtros ativos")).toBeInTheDocument();
    expect(screen.getByText("Filtros ativos (2)")).toBeInTheDocument();
  });

  it("exibe resumo aplicado com busca, tipo, periodo, categoria e ordenacao", async () => {
    window.history.replaceState(
      null,
      "",
      "/app?limit=20&offset=0&sort=amount:desc&q=aluguel&type=Entrada&period=Personalizado&from=2026-02-01&to=2026-02-28&categoryId=3",
    );
    transactionsService.listPage.mockResolvedValueOnce(
      buildPageResponse([
        {
          id: 24,
          value: 1200,
          type: CATEGORY_ENTRY,
          date: "2026-02-10",
          description: "Aluguel recebido",
          categoryId: 3,
        },
      ]),
    );

    render(<App />);

    expect(await screen.findByText("Aluguel recebido")).toBeInTheDocument();
    expect(screen.getByText("Filtros ativos (4)")).toBeInTheDocument();
    expect(screen.getByText('Busca: "aluguel"')).toBeInTheDocument();
    expect(screen.getByText("Tipo: Entradas")).toBeInTheDocument();
    expect(screen.getByText("Periodo: 2026-02-01 -> 2026-02-28")).toBeInTheDocument();
    expect(screen.getByText("Categoria: #3")).toBeInTheDocument();
    expect(screen.getByText("Ordenacao: Valor (maior)")).toBeInTheDocument();
  });

  it("remove chip de busca, reseta offset e atualiza URL", async () => {
    const user = userEvent.setup();
    window.history.replaceState(
      null,
      "",
      "/app?limit=20&offset=40&sort=amount:desc&q=aluguel",
    );
    const withQueryResponse = buildPageResponse(
      [
        {
          id: 25,
          value: 1200,
          type: CATEGORY_ENTRY,
          date: "2026-02-10",
          description: "Com busca aplicada",
        },
      ],
      { page: 3, limit: 20, offset: 40, total: 95, totalPages: 5 },
    );
    const withoutQueryResponse = buildPageResponse(
      [
        {
          id: 26,
          value: 200,
          type: CATEGORY_ENTRY,
          date: "2026-02-11",
          description: "Sem busca aplicada",
        },
      ],
      { page: 1, limit: 20, offset: 0, total: 1, totalPages: 1 },
    );

    transactionsService.listPage.mockImplementation((params) => {
      if (!Object.prototype.hasOwnProperty.call(params, "q") && params.offset === 0) {
        return Promise.resolve(withoutQueryResponse);
      }

      return Promise.resolve(withQueryResponse);
    });

    render(<App />);

    expect(await screen.findByText("Com busca aplicada")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remover filtro: Busca" }));

    expect(await screen.findByText("Sem busca aplicada")).toBeInTheDocument();
    const lastCallParams =
      transactionsService.listPage.mock.calls[transactionsService.listPage.mock.calls.length - 1][0];
    expect(lastCallParams).not.toHaveProperty("q");
    expect(lastCallParams.offset).toBe(0);

    const params = new URLSearchParams(window.location.search);
    expect(params.get("q")).toBeNull();
    expect(params.get("offset")).toBe("0");
    expect(screen.getByLabelText("Buscar")).toHaveValue("");
  });

  it("remove chip de periodo custom, limpa from/to e reseta offset", async () => {
    const user = userEvent.setup();
    window.history.replaceState(
      null,
      "",
      "/app?limit=20&offset=20&sort=date:asc&period=Personalizado&from=2026-02-01&to=2026-02-28",
    );
    const withPeriodResponse = buildPageResponse(
      [
        {
          id: 27,
          value: 100,
          type: CATEGORY_EXIT,
          date: "2026-02-14",
          description: "Com periodo aplicado",
        },
      ],
      { page: 2, limit: 20, offset: 20, total: 45, totalPages: 3 },
    );
    const withoutPeriodResponse = buildPageResponse(
      [
        {
          id: 28,
          value: 80,
          type: CATEGORY_EXIT,
          date: "2026-02-15",
          description: "Sem periodo aplicado",
        },
      ],
      { page: 1, limit: 20, offset: 0, total: 1, totalPages: 1 },
    );

    transactionsService.listPage.mockImplementation((params) => {
      if (params.from === undefined && params.to === undefined && params.offset === 0) {
        return Promise.resolve(withoutPeriodResponse);
      }

      return Promise.resolve(withPeriodResponse);
    });

    render(<App />);

    expect(await screen.findByText("Com periodo aplicado")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remover filtro: Periodo" }));

    expect(await screen.findByText("Sem periodo aplicado")).toBeInTheDocument();
    expect(transactionsService.listPage).toHaveBeenLastCalledWith({
      limit: 20,
      offset: 0,
      sort: "date:asc",
      from: undefined,
      to: undefined,
      type: undefined,
      categoryId: undefined,
    });

    const params = new URLSearchParams(window.location.search);
    expect(params.get("period")).toBeNull();
    expect(params.get("from")).toBeNull();
    expect(params.get("to")).toBeNull();
    expect(params.get("offset")).toBe("0");
  });

  it("exibe estado vazio no resumo mensal quando nao ha dados", async () => {
    transactionsService.getMonthlySummary.mockResolvedValueOnce(
      buildSummaryResponse({
        income: 0,
        expense: 0,
        balance: 0,
        byCategory: [],
      }),
    );

    render(<App />);

    expect(await screen.findByText("Sem dados para o mes selecionado.")).toBeInTheDocument();
  });

  it("exibe erro no resumo mensal e permite tentar novamente", async () => {
    const user = userEvent.setup();
    transactionsService.getMonthlySummary
      .mockRejectedValueOnce({})
      .mockResolvedValueOnce(
        buildSummaryResponse({
          income: 900,
          expense: 200,
          balance: 700,
        }),
      );
    transactionsService.getMonthlySummaryCompare
      .mockResolvedValueOnce(buildSummaryCompareResponse())
      .mockResolvedValueOnce(
        buildSummaryCompareResponse({
          current: {
            income: 900,
            expense: 200,
            balance: 700,
          },
          previous: {
            income: 880,
            expense: 220,
            balance: 660,
          },
          delta: {
            income: 20,
            expense: -20,
            balance: 40,
            incomePct: 2.27,
            expensePct: -9.09,
            balancePct: 6.06,
          },
        }),
      );

    render(<App />);

    expect(
      await screen.findByText("Nao foi possivel carregar o resumo mensal."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(await screen.findByTestId("mom-balance")).toBeInTheDocument();
    expect(screen.getByText("R$ 700,00")).toBeInTheDocument();
    expect(screen.queryByText("Nao foi possivel carregar o resumo mensal.")).not.toBeInTheDocument();
  });

  it("abre historico de imports com loading e renderiza itens", async () => {
    const user = userEvent.setup();
    let resolveHistoryRequest;
    const pendingHistoryRequest = new Promise((resolve) => {
      resolveHistoryRequest = resolve;
    });

    transactionsService.getImportHistory.mockReturnValueOnce(pendingHistoryRequest);

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Historico de imports" }));

    expect(await screen.findByText("Carregando historico...")).toBeInTheDocument();

    resolveHistoryRequest(
      buildImportHistoryResponse({
        items: [
          {
            id: "import-1",
            createdAt: "2026-04-01T10:00:00.000Z",
            expiresAt: "2026-04-01T10:30:00.000Z",
            committedAt: "2026-04-01T10:10:00.000Z",
            summary: {
              totalRows: 2,
              validRows: 2,
              invalidRows: 0,
              income: 200,
              expense: 0,
              imported: 2,
            },
          },
        ],
      }),
    );

    expect(await screen.findByText("Committed")).toBeInTheDocument();
    expect(transactionsService.getImportHistory).toHaveBeenCalledWith({
      limit: 20,
      offset: 0,
    });
  });

  it("exibe estado vazio no historico de imports", async () => {
    const user = userEvent.setup();
    transactionsService.getImportHistory.mockResolvedValueOnce(
      buildImportHistoryResponse({
        items: [],
      }),
    );

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Historico de imports" }));

    expect(await screen.findByText("Sem imports para exibir.")).toBeInTheDocument();
  });

  it("exibe erro ao carregar historico de imports", async () => {
    const user = userEvent.setup();
    transactionsService.getImportHistory.mockRejectedValueOnce({
      response: {
        data: {
          message: "Falha ao carregar historico.",
        },
      },
    });

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Historico de imports" }));

    expect(await screen.findByText("Falha ao carregar historico.")).toBeInTheDocument();
  });

  it("pagina historico de imports ao clicar em Proxima", async () => {
    const user = userEvent.setup();
    const firstPageItems = Array.from({ length: 20 }, (_unused, index) => ({
      id: `import-${index + 1}`,
      createdAt: "2026-04-01T10:00:00.000Z",
      expiresAt: "2026-04-01T10:30:00.000Z",
      committedAt: null,
      summary: {
        totalRows: 1,
        validRows: 1,
        invalidRows: 0,
        income: 10,
        expense: 0,
        imported: 0,
      },
    }));

    transactionsService.getImportHistory
      .mockResolvedValueOnce(
        buildImportHistoryResponse({
          items: firstPageItems,
          pagination: {
            limit: 20,
            offset: 0,
          },
        }),
      )
      .mockResolvedValueOnce(
        buildImportHistoryResponse({
          items: [
            {
              id: "import-21",
              createdAt: "2026-04-01T11:00:00.000Z",
              expiresAt: "2026-04-01T11:30:00.000Z",
              committedAt: null,
              summary: {
                totalRows: 1,
                validRows: 1,
                invalidRows: 0,
                income: 20,
                expense: 0,
                imported: 0,
              },
            },
          ],
          pagination: {
            limit: 20,
            offset: 20,
          },
        }),
      );

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Historico de imports" }));
    expect(await screen.findByText("Mostrando 1-20")).toBeInTheDocument();
    const historyDialog = screen.getByRole("dialog", { name: "Historico de imports" });

    await user.click(within(historyDialog).getByRole("button", { name: "Proxima" }));

    await waitFor(() => {
      expect(transactionsService.getImportHistory).toHaveBeenLastCalledWith({
        limit: 20,
        offset: 20,
      });
    });
    expect(await screen.findByText("Mostrando 21-21")).toBeInTheDocument();
  });

  it("abre menu de acoes no mobile e fecha ao clicar fora sem disparar logout", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    const originalInnerWidth = window.innerWidth;

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 360,
    });
    act(() => {
      fireEvent(window, new Event("resize"));
    });

    try {
      render(<App onLogout={onLogout} />);

      expect(screen.queryByRole("button", { name: "Sair" })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Acoes" }));
      expect(await screen.findByRole("menu", { name: "Acoes rapidas" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Sair" })).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByRole("menuitem", { name: "Exportar CSV" })).toHaveFocus();
      });

      expect(onLogout).not.toHaveBeenCalled();

      fireEvent.mouseDown(document.body);

      await waitFor(() => {
        expect(screen.queryByRole("menu", { name: "Acoes rapidas" })).not.toBeInTheDocument();
      });
    } finally {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: originalInnerWidth,
      });
      act(() => {
        fireEvent(window, new Event("resize"));
      });
    }
  });

  it("mantem filtros colapsados por padrao no mobile sem filtros ativos", async () => {
    const user = userEvent.setup();
    const originalInnerWidth = window.innerWidth;

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 360,
    });
    act(() => {
      fireEvent(window, new Event("resize"));
    });

    try {
      render(<App />);

      expect(await screen.findByText("Resumo financeiro")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Filtros" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      expect(screen.queryByLabelText("Periodo")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Filtros" }));

      expect(screen.getByRole("button", { name: "Ocultar" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      expect(screen.getByLabelText("Periodo")).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: originalInnerWidth,
      });
      act(() => {
        fireEvent(window, new Event("resize"));
      });
    }
  });

  it("abre painel de filtros automaticamente no mobile quando existem filtros ativos", async () => {
    const originalInnerWidth = window.innerWidth;
    const originalPathWithSearch = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(null, "", "/app?q=mercado");

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 360,
    });
    act(() => {
      fireEvent(window, new Event("resize"));
    });

    try {
      render(<App />);

      expect(await screen.findByText("Filtros ativos (1)")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Ocultar" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      expect(screen.getByLabelText("Periodo")).toBeInTheDocument();
    } finally {
      window.history.replaceState(null, "", originalPathWithSearch);
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: originalInnerWidth,
      });
      act(() => {
        fireEvent(window, new Event("resize"));
      });
    }
  });

  it("abre painel de filtros e foca busca ao clicar em editar filtros no mobile", async () => {
    const user = userEvent.setup();
    const originalInnerWidth = window.innerWidth;
    const originalPathWithSearch = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(null, "", "/app?q=mercado");

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 360,
    });
    act(() => {
      fireEvent(window, new Event("resize"));
    });

    try {
      render(<App />);

      expect(await screen.findByText("Filtros ativos (1)")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Ocultar" }));
      expect(screen.queryByLabelText("Buscar")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Editar filtros" }));

      const searchInput = await screen.findByLabelText("Buscar");
      await waitFor(() => {
        expect(searchInput).toHaveFocus();
      });
    } finally {
      window.history.replaceState(null, "", originalPathWithSearch);
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: originalInnerWidth,
      });
      act(() => {
        fireEvent(window, new Event("resize"));
      });
    }
  });

  it("abre importacao CSV, processa dry-run e exibe preview", async () => {
    const user = userEvent.setup();
    const csvFile = new File(
      ["date,type,value,description\n2026-03-01,Entrada,100,Salario"],
      "import.csv",
      {
        type: "text/csv",
      },
    );

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Importar CSV" }));
    await user.upload(screen.getByLabelText("Arquivo CSV"), csvFile);
    await user.click(screen.getByRole("button", { name: "Pre-visualizar" }));

    expect(transactionsService.dryRunImportCsv).toHaveBeenCalledTimes(1);
    expect(transactionsService.dryRunImportCsv.mock.calls[0][0]).toBe(csvFile);
    expect(await screen.findByText("Salario")).toBeInTheDocument();
    expect(screen.getByText("Valor invalido.")).toBeInTheDocument();
    expect(screen.getByText("Sessao expira em: 2026-03-01T10:00:00.000Z")).toBeInTheDocument();
  });

  it("mantem botao importar desabilitado quando dry-run nao tem linhas validas", async () => {
    const user = userEvent.setup();
    const csvFile = new File(
      ["date,type,value,description\n2026-03-01,Saida,0,Cafe"],
      "import.csv",
      {
        type: "text/csv",
      },
    );
    transactionsService.dryRunImportCsv.mockResolvedValueOnce(
      buildImportDryRunResponse({
        summary: {
          totalRows: 1,
          validRows: 0,
          invalidRows: 1,
          income: 0,
          expense: 0,
        },
      }),
    );

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Importar CSV" }));
    await user.upload(screen.getByLabelText("Arquivo CSV"), csvFile);
    await user.click(screen.getByRole("button", { name: "Pre-visualizar" }));
    expect(await screen.findByText("Cafe")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Importar" })).toBeDisabled();
  });

  it("confirma importacao CSV e recarrega listagem e resumo", async () => {
    const user = userEvent.setup();
    const csvFile = new File(
      ["date,type,value,description\n2026-03-01,Entrada,100,Salario"],
      "import.csv",
      {
        type: "text/csv",
      },
    );
    transactionsService.dryRunImportCsv.mockResolvedValueOnce(buildImportDryRunResponse());

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Importar CSV" }));
    await user.upload(screen.getByLabelText("Arquivo CSV"), csvFile);
    await user.click(screen.getByRole("button", { name: "Pre-visualizar" }));
    await screen.findByText("Salario");
    await user.click(screen.getByRole("button", { name: "Importar" }));

    await waitFor(() => {
      expect(transactionsService.commitImportCsv).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
      );
      expect(transactionsService.listPage).toHaveBeenCalledTimes(2);
      expect(transactionsService.getMonthlySummary).toHaveBeenCalledTimes(2);
      expect(transactionsService.getMonthlySummaryCompare).toHaveBeenCalledTimes(2);
    });

    expect(screen.queryByLabelText("Arquivo CSV")).not.toBeInTheDocument();
  });

  it("exibe mensagem de erro quando dry-run falha", async () => {
    const user = userEvent.setup();
    const csvFile = new File(
      ["date,type,value,description\n2026-03-01,Entrada,100,Salario"],
      "import.csv",
      {
        type: "text/csv",
      },
    );
    transactionsService.dryRunImportCsv.mockRejectedValueOnce({
      response: { data: { message: "Arquivo invalido. Envie um CSV." } },
    });

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Importar CSV" }));
    await user.upload(screen.getByLabelText("Arquivo CSV"), csvFile);
    await user.click(screen.getByRole("button", { name: "Pre-visualizar" }));

    expect(await screen.findByText("Arquivo invalido. Envie um CSV.")).toBeInTheDocument();
  });

  it("exibe orientacao para sessao expirada durante commit", async () => {
    const user = userEvent.setup();
    const csvFile = new File(
      ["date,type,value,description\n2026-03-01,Entrada,100,Salario"],
      "import.csv",
      {
        type: "text/csv",
      },
    );
    transactionsService.dryRunImportCsv.mockResolvedValueOnce(buildImportDryRunResponse());
    transactionsService.commitImportCsv.mockRejectedValueOnce({
      response: { data: { message: "Sessao de importacao expirada." } },
    });

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Importar CSV" }));
    await user.upload(screen.getByLabelText("Arquivo CSV"), csvFile);
    await user.click(screen.getByRole("button", { name: "Pre-visualizar" }));
    await screen.findByText("Salario");
    await user.click(screen.getByRole("button", { name: "Importar" }));

    expect(
      await screen.findByText("Sessao de importacao expirada. Rode a pre-visualizacao novamente."),
    ).toBeInTheDocument();
  });

  it("navega para a proxima pagina", async () => {
    const user = userEvent.setup();
    transactionsService.listPage
      .mockResolvedValueOnce(
        buildPageResponse(
          [{ id: 1, value: 100, type: CATEGORY_ENTRY, date: "2026-02-13", description: "Pagina 1" }],
          { page: 1, total: 2, totalPages: 2 },
        ),
      )
      .mockResolvedValueOnce(
        buildPageResponse(
          [{ id: 2, value: 70, type: CATEGORY_EXIT, date: "2026-02-14", description: "Pagina 2" }],
          { page: 2, total: 2, totalPages: 2 },
        ),
      );

    render(<App />);

    expect(await screen.findByText("Pagina 1")).toBeInTheDocument();

    const previousButton = screen.getByRole("button", { name: "Anterior" });
    const nextButton = screen.getByRole("button", { name: "Proxima" });

    expect(previousButton).toBeDisabled();
    expect(nextButton).toBeEnabled();

    await user.click(nextButton);

    expect(await screen.findByText("Pagina 2")).toBeInTheDocument();
    expect(screen.getByText("Pagina 2 de 2")).toBeInTheDocument();
    expect(transactionsService.listPage).toHaveBeenNthCalledWith(2, {
      limit: 20,
      offset: 20,
      sort: "date:asc",
      from: undefined,
      to: undefined,
      type: undefined,
      categoryId: undefined,
    });
  });

  it("permite alterar itens por pagina e reseta para pagina 1", async () => {
    const user = userEvent.setup();
    transactionsService.listPage
      .mockResolvedValueOnce(
        buildPageResponse(
          [{ id: 1, value: 100, type: CATEGORY_ENTRY, date: "2026-02-13", description: "P1" }],
          { page: 1, limit: 20, total: 35, totalPages: 2 },
        ),
      )
      .mockResolvedValueOnce(
        buildPageResponse(
          [{ id: 2, value: 90, type: CATEGORY_ENTRY, date: "2026-02-14", description: "P2" }],
          { page: 2, limit: 20, total: 35, totalPages: 2 },
        ),
      )
      .mockResolvedValueOnce(
        buildPageResponse(
          [{ id: 3, value: 80, type: CATEGORY_ENTRY, date: "2026-02-15", description: "P1-L10" }],
          { page: 1, limit: 10, total: 35, totalPages: 4 },
        ),
      );

    render(<App />);

    expect(await screen.findByText("P1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Proxima" }));
    expect(await screen.findByText("P2")).toBeInTheDocument();
    expect(screen.getByText("Pagina 2 de 2")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Itens por pagina"), "10");

    expect(await screen.findByText("P1-L10")).toBeInTheDocument();
    expect(screen.getByText("Pagina 1 de 4")).toBeInTheDocument();
    expect(screen.getByText("Mostrando 1-1 de 35")).toBeInTheDocument();
    expect(transactionsService.listPage).toHaveBeenLastCalledWith({
      limit: 10,
      offset: 0,
      sort: "date:asc",
      from: undefined,
      to: undefined,
      type: undefined,
      categoryId: undefined,
    });
  });

  it("permite navegar para a ultima pagina", async () => {
    const user = userEvent.setup();
    transactionsService.listPage
      .mockResolvedValueOnce(
        buildPageResponse(
          [{ id: 1, value: 100, type: CATEGORY_ENTRY, date: "2026-02-13", description: "Pagina inicial" }],
          { page: 1, limit: 20, total: 61, totalPages: 4 },
        ),
      )
      .mockResolvedValueOnce(
        buildPageResponse(
          [{ id: 4, value: 50, type: CATEGORY_EXIT, date: "2026-02-16", description: "Pagina final" }],
          { page: 4, limit: 20, total: 61, totalPages: 4 },
        ),
      );

    render(<App />);

    expect(await screen.findByText("Pagina inicial")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ultima" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Ultima" }));

    expect(await screen.findByText("Pagina final")).toBeInTheDocument();
    expect(screen.getByText("Pagina 4 de 4")).toBeInTheDocument();
    expect(screen.getByText("Mostrando 61-61 de 61")).toBeInTheDocument();
    expect(transactionsService.listPage).toHaveBeenNthCalledWith(2, {
      limit: 20,
      offset: 60,
      sort: "date:asc",
      from: undefined,
      to: undefined,
      type: undefined,
      categoryId: undefined,
    });
  });

  it("reseta para pagina 1 ao trocar filtro", async () => {
    const user = userEvent.setup();
    transactionsService.listPage
      .mockResolvedValueOnce(
        buildPageResponse(
          [{ id: 1, value: 100, type: CATEGORY_ENTRY, date: "2026-02-13", description: "Entrada p1" }],
          { page: 1, total: 2, totalPages: 2 },
        ),
      )
      .mockResolvedValueOnce(
        buildPageResponse(
          [{ id: 2, value: 80, type: CATEGORY_EXIT, date: "2026-02-13", description: "Saida p2" }],
          { page: 2, total: 2, totalPages: 2 },
        ),
      )
      .mockResolvedValueOnce(
        buildPageResponse(
          [{ id: 3, value: 60, type: CATEGORY_ENTRY, date: "2026-02-13", description: "Entrada filtrada" }],
          { page: 1, total: 1, totalPages: 1 },
        ),
      );

    render(<App />);

    expect(await screen.findByText("Entrada p1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Proxima" }));
    expect(await screen.findByText("Saida p2")).toBeInTheDocument();
    expect(screen.getByText("Pagina 2 de 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await user.click(screen.getByRole("button", { name: "Filtrar entradas" }));

    expect(await screen.findByText("Entrada filtrada")).toBeInTheDocument();
    expect(screen.getByText("Pagina 1 de 1")).toBeInTheDocument();
    expect(transactionsService.listPage).toHaveBeenLastCalledWith({
      limit: 20,
      offset: 0,
      sort: "date:asc",
      from: undefined,
      to: undefined,
      type: CATEGORY_ENTRY,
      categoryId: undefined,
    });
  });

  it("adiciona transacao via API", async () => {
    const user = userEvent.setup();
    transactionsService.listPage
      .mockResolvedValueOnce(buildPageResponse())
      .mockResolvedValueOnce(
        buildPageResponse([
          {
            id: 1,
            value: 100.5,
            type: CATEGORY_ENTRY,
            date: "2026-02-13",
            description: "Extra",
            notes: "",
          },
        ]),
      );
    transactionsService.create.mockResolvedValueOnce({
      id: 1,
      value: 100.5,
      type: CATEGORY_ENTRY,
      date: "2026-02-13",
      description: "Extra",
      notes: "",
    });

    render(<App />);

    await screen.findByText("Nenhum valor cadastrado.");
    await user.click(screen.getByRole("button", { name: "Registrar novo valor" }));
    await user.type(screen.getByLabelText("Valor"), "100,50");
    await user.type(screen.getByLabelText("Descricao"), "Extra");
    fireEvent.change(screen.getByLabelText("Data"), {
      target: { value: "2026-02-13" },
    });
    await user.click(screen.getByRole("button", { name: "Inserir valor" }));

    expect(transactionsService.create).toHaveBeenCalledWith({
      value: 100.5,
      type: CATEGORY_ENTRY,
      category_id: null,
      date: "2026-02-13",
      description: "Extra",
      notes: "",
    });
    expect(await screen.findByText("Extra")).toBeInTheDocument();
    expect(transactionsService.listPage).toHaveBeenCalledTimes(2);
  });

  it("adiciona transacao com categoria selecionada", async () => {
    const user = userEvent.setup();
    transactionsService.listCategories.mockResolvedValueOnce([{ id: 7, name: "Lazer" }]);
    transactionsService.listPage
      .mockResolvedValueOnce(buildPageResponse())
      .mockResolvedValueOnce(
        buildPageResponse([
          {
            id: 7,
            value: 60,
            type: CATEGORY_EXIT,
            categoryId: 7,
            date: "2026-02-13",
            description: "Cinema",
            notes: "",
          },
        ]),
      );
    transactionsService.create.mockResolvedValueOnce({
      id: 7,
      value: 60,
      type: CATEGORY_EXIT,
      categoryId: 7,
      date: "2026-02-13",
      description: "Cinema",
      notes: "",
    });

    render(<App />);

    await screen.findByText("Nenhum valor cadastrado.");
    await user.click(screen.getByRole("button", { name: "Registrar novo valor" }));
    const modalForm = screen.getByRole("button", { name: "Inserir valor" }).closest("form");

    if (!modalForm) {
      throw new Error("Formulario de criacao nao encontrado.");
    }

    const modalQueries = within(modalForm);

    await user.type(modalQueries.getByLabelText("Valor"), "60,00");
    await user.type(modalQueries.getByLabelText("Descricao"), "Cinema");
    await user.click(modalQueries.getByRole("button", { name: "Saida" }));
    await user.selectOptions(modalQueries.getByLabelText("Categoria"), "7");
    fireEvent.change(modalQueries.getByLabelText("Data"), {
      target: { value: "2026-02-13" },
    });
    await user.click(modalQueries.getByRole("button", { name: "Inserir valor" }));

    expect(transactionsService.create).toHaveBeenCalledWith({
      value: 60,
      type: CATEGORY_EXIT,
      category_id: 7,
      date: "2026-02-13",
      description: "Cinema",
      notes: "",
    });
  });

  it("edita transacao via API", async () => {
    const user = userEvent.setup();
    transactionsService.listPage
      .mockResolvedValueOnce(
        buildPageResponse([
          {
            id: 1,
            value: 150,
            type: CATEGORY_ENTRY,
            date: "2026-02-12",
            description: "Salario",
            notes: "",
          },
        ]),
      )
      .mockResolvedValueOnce(
        buildPageResponse([
          {
            id: 1,
            value: 120.5,
            type: CATEGORY_EXIT,
            date: "2026-02-12",
            description: "Mercado",
            notes: "Compra do mes",
          },
        ]),
      );
    transactionsService.update.mockResolvedValueOnce({
      id: 1,
      value: 120.5,
      type: CATEGORY_EXIT,
      date: "2026-02-12",
      description: "Mercado",
      notes: "Compra do mes",
    });

    render(<App />);

    await screen.findByText("Salario");
    await user.click(screen.getByRole("button", { name: /Editar transacao 1/i }));
    const modalForm = screen.getByRole("button", { name: "Salvar alteracoes" }).closest("form");

    if (!modalForm) {
      throw new Error("Formulario de edicao nao encontrado.");
    }

    const modalQueries = within(modalForm);

    await user.clear(modalQueries.getByLabelText("Valor"));
    await user.type(modalQueries.getByLabelText("Valor"), "120,50");
    await user.clear(modalQueries.getByLabelText("Descricao"));
    await user.type(modalQueries.getByLabelText("Descricao"), "Mercado");
    await user.clear(modalQueries.getByLabelText("Observacoes"));
    await user.type(modalQueries.getByLabelText("Observacoes"), "Compra do mes");
    await user.click(modalQueries.getByRole("button", { name: "Saida" }));
    await user.click(modalQueries.getByRole("button", { name: "Salvar alteracoes" }));

    await waitFor(() => {
      expect(transactionsService.update).toHaveBeenCalledWith(1, {
        value: 120.5,
        type: CATEGORY_EXIT,
        category_id: null,
        date: "2026-02-12",
        description: "Mercado",
        notes: "Compra do mes",
      });
    });

    expect(await screen.findByText("Mercado")).toBeInTheDocument();
    expect(screen.getByText("Compra do mes")).toBeInTheDocument();
  });

  it("exibe aviso e salva como Sem categoria ao editar transacao com categoria removida", async () => {
    const user = userEvent.setup();
    transactionsService.listCategories.mockResolvedValueOnce([]);
    transactionsService.listPage.mockResolvedValueOnce(
      buildPageResponse([
        {
          id: 14,
          value: 85,
          type: CATEGORY_EXIT,
          categoryId: 99,
          date: "2026-02-12",
          description: "Taxi",
          notes: "",
        },
      ]),
    );
    transactionsService.update.mockResolvedValueOnce({
      id: 14,
      value: 85,
      type: CATEGORY_EXIT,
      categoryId: null,
      date: "2026-02-12",
      description: "Taxi",
      notes: "",
    });

    render(<App />);

    await screen.findByText("Taxi");
    await user.click(screen.getByRole("button", { name: /Editar transacao 14/i }));

    expect(
      await screen.findByText(
        "Categoria removida. Ao salvar, a transacao sera atualizada para Sem categoria.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Salvar alteracoes" }));

    await waitFor(() => {
      expect(transactionsService.update).toHaveBeenCalledWith(14, {
        value: 85,
        type: CATEGORY_EXIT,
        category_id: null,
        date: "2026-02-12",
        description: "Taxi",
        notes: "",
      });
    });
  });

  it("orienta uso de Sem categoria quando API retorna categoria nao encontrada ao salvar", async () => {
    const user = userEvent.setup();
    transactionsService.listCategories.mockResolvedValueOnce([{ id: 5, name: "Mercado" }]);
    transactionsService.listPage.mockResolvedValueOnce(buildPageResponse());
    transactionsService.create.mockRejectedValueOnce({
      response: {
        data: {
          message: "Categoria nao encontrada.",
        },
      },
    });

    render(<App />);

    await screen.findByText("Nenhum valor cadastrado.");
    await user.click(screen.getByRole("button", { name: "Registrar novo valor" }));
    const modalForm = screen.getByRole("button", { name: "Inserir valor" }).closest("form");

    if (!modalForm) {
      throw new Error("Formulario de criacao nao encontrado.");
    }

    const modalQueries = within(modalForm);

    await user.type(modalQueries.getByLabelText("Valor"), "34,90");
    await user.type(modalQueries.getByLabelText("Descricao"), "Padaria");
    await user.selectOptions(modalQueries.getByLabelText("Categoria"), "5");
    await user.click(modalQueries.getByRole("button", { name: "Inserir valor" }));

    expect(
      await screen.findByText(
        "A categoria selecionada foi removida. Escolha outra categoria ou use Sem categoria.",
      ),
    ).toBeInTheDocument();
  });

  it("remove e restaura transacao com desfazer", async () => {
    const user = userEvent.setup();
    transactionsService.listPage
      .mockResolvedValueOnce(
        buildPageResponse([
          {
            id: 1,
            value: 45,
            type: CATEGORY_ENTRY,
            date: "2026-02-12",
            description: "Freela",
          },
        ]),
      )
      .mockResolvedValueOnce(buildPageResponse())
      .mockResolvedValueOnce(
        buildPageResponse([
          {
            id: 1,
            value: 45,
            type: CATEGORY_ENTRY,
            date: "2026-02-12",
            description: "Freela",
            notes: "",
          },
        ]),
      );
    transactionsService.remove.mockResolvedValueOnce({ id: 1, success: true });
    transactionsService.restore.mockResolvedValueOnce({
      id: 1,
      value: 45,
      type: CATEGORY_ENTRY,
      date: "2026-02-12",
      description: "Freela",
      notes: "",
    });

    render(<App />);

    await screen.findByText("Freela");
    await user.click(screen.getByRole("button", { name: /Excluir transacao 1/i }));
    await user.click(screen.getByRole("button", { name: "Confirmar exclusao" }));

    await waitFor(() => {
      expect(transactionsService.remove).toHaveBeenCalledWith(1);
    });

    expect(await screen.findByText("Transacao removida.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Desfazer" }));

    await waitFor(() => {
      expect(transactionsService.restore).toHaveBeenCalledWith(1);
    });

    expect(await screen.findByText("Freela")).toBeInTheDocument();
  });

  it("exporta CSV usando filtros ativos", async () => {
    const user = userEvent.setup();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURLMock = vi.fn(() => "blob:transacoes");
    const revokeObjectURLMock = vi.fn();
    const clickMock = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    URL.createObjectURL = createObjectURLMock;
    URL.revokeObjectURL = revokeObjectURLMock;

    try {
      transactionsService.listPage
        .mockResolvedValueOnce(buildPageResponse())
        .mockResolvedValue(buildPageResponse());

      render(<App />);

      await screen.findByText("Resumo financeiro");
      await user.click(screen.getByRole("button", { name: "Filtros" }));
      await user.selectOptions(screen.getByLabelText("Periodo"), "Personalizado");
      fireEvent.change(screen.getByLabelText("Data inicial"), {
        target: { value: "2026-02-01" },
      });
      fireEvent.change(screen.getByLabelText("Data final"), {
        target: { value: "2026-02-20" },
      });
      await user.click(screen.getByRole("button", { name: "Filtrar saidas" }));
      await user.click(screen.getByRole("button", { name: "Exportar CSV" }));

      await waitFor(() => {
        expect(transactionsService.exportCsv).toHaveBeenCalledWith({
          from: "2026-02-01",
          to: "2026-02-20",
          type: CATEGORY_EXIT,
          categoryId: undefined,
        });
      });
      expect(createObjectURLMock).toHaveBeenCalledTimes(1);
      expect(clickMock).toHaveBeenCalledTimes(1);
      expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:transacoes");
    } finally {
      clickMock.mockRestore();
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });

  describe("persistencia de summaryMonth na URL", () => {
    it("inicializa selectedSummaryMonth a partir de summaryMonth valido na URL", async () => {
      window.history.replaceState(null, "", "/app?summaryMonth=2025-10");

      render(<App />);

      await waitFor(() => {
        expect(transactionsService.getMonthlySummary).toHaveBeenCalledWith("2025-10");
        expect(transactionsService.getMonthlySummaryCompare).toHaveBeenCalledWith("2025-10");
        expect(transactionsService.getMonthlyBudgets).toHaveBeenCalledWith("2025-10");
      });
    });

    it("ignora summaryMonth invalido na URL e usa mes corrente", async () => {
      window.history.replaceState(null, "", "/app?summaryMonth=nao-e-um-mes");

      render(<App />);

      await waitFor(() => {
        const month = transactionsService.getMonthlySummary.mock.calls[0]?.[0];
        expect(month).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
        expect(month).not.toBe("nao-e-um-mes");
      });
    });

    it("atualiza summaryMonth na URL quando o usuario seleciona um mes via grafico", async () => {
      render(<App />);

      await screen.findByTestId("trend-chart");

      await userEvent.click(screen.getByTestId("trend-month-2025-11"));

      await waitFor(() => {
        expect(new URLSearchParams(window.location.search).get("summaryMonth")).toBe("2025-11");
      });
    });

    it("preserva outros query params ao atualizar summaryMonth na URL", async () => {
      window.history.replaceState(null, "", "/app?sort=amount%3Adesc");

      render(<App />);

      await screen.findByTestId("trend-chart");

      await userEvent.click(screen.getByTestId("trend-month-2025-12"));

      await waitFor(() => {
        const params = new URLSearchParams(window.location.search);
        expect(params.get("summaryMonth")).toBe("2025-12");
        expect(params.get("sort")).toBe("amount:desc");
      });
    });
  });

  describe("grafico de evolucao historica (TrendChart)", () => {
    it("renderiza o grafico de evolucao quando a API retorna dados", async () => {
      analyticsService.getMonthlyTrend.mockResolvedValueOnce(buildTrendResponse());

      render(<App />);

      expect(await screen.findByTestId("trend-chart")).toBeInTheDocument();
    });

    it("exibe mensagem de erro quando a API de trend falha", async () => {
      analyticsService.getMonthlyTrend.mockRejectedValueOnce(new Error("network error"));

      render(<App />);

      expect(
        await screen.findByText("Grafico de evolucao indisponivel."),
      ).toBeInTheDocument();
    });

    it("exibe skeleton de loading enquanto a requisicao de trend esta pendente", async () => {
      const deferred = createDeferred();
      analyticsService.getMonthlyTrend.mockReturnValueOnce(deferred.promise);

      render(<App />);

      expect(await screen.findByText("Carregando evolucao...")).toBeInTheDocument();

      await act(async () => {
        deferred.resolve(buildTrendResponse());
      });
    });

    it("chama getMonthlyTrend com months=6", async () => {
      analyticsService.getMonthlyTrend.mockResolvedValueOnce(buildTrendResponse());

      render(<App />);

      await screen.findByTestId("trend-chart");

      expect(analyticsService.getMonthlyTrend).toHaveBeenCalledWith(6);
    });

    it("clicar num mes do grafico recarrega summary e budgets para o mes clicado", async () => {
      render(<App />);

      await screen.findByTestId("trend-chart");

      transactionsService.getMonthlySummary.mockClear();
      transactionsService.getMonthlySummaryCompare.mockClear();
      transactionsService.getMonthlyBudgets.mockClear();

      await userEvent.click(screen.getByTestId("trend-month-2025-10"));

      await waitFor(() => {
        expect(transactionsService.getMonthlySummary).toHaveBeenCalledWith("2025-10");
        expect(transactionsService.getMonthlySummaryCompare).toHaveBeenCalledWith("2025-10");
        expect(transactionsService.getMonthlyBudgets).toHaveBeenCalledWith("2025-10");
      });
    });

    it("clicar em meses distintos aciona re-fetch para cada mes clicado", async () => {
      render(<App />);

      await screen.findByTestId("trend-chart");

      transactionsService.getMonthlySummary.mockClear();

      await userEvent.click(screen.getByTestId("trend-month-2025-11"));

      await waitFor(() => {
        expect(transactionsService.getMonthlySummary).toHaveBeenCalledWith("2025-11");
      });

      transactionsService.getMonthlySummary.mockClear();

      await userEvent.click(screen.getByTestId("trend-month-2025-12"));

      await waitFor(() => {
        expect(transactionsService.getMonthlySummary).toHaveBeenCalledWith("2025-12");
      });
    });

    it("passa selectedMonth corrente para o TrendChart", async () => {
      window.history.replaceState(null, "", "/app?summaryMonth=2025-11");

      render(<App />);

      await screen.findByTestId("trend-chart");

      expect(screen.getByTestId("trend-selected-month")).toHaveTextContent("2025-11");
    });

    it("atualiza selectedMonth no TrendChart apos clique num mes", async () => {
      render(<App />);

      await screen.findByTestId("trend-chart");

      await userEvent.click(screen.getByTestId("trend-month-2025-10"));

      await waitFor(() => {
        expect(screen.getByTestId("trend-selected-month")).toHaveTextContent("2025-10");
      });
    });

    it("chama scrollIntoView na secao de resumo ao clicar num mes no grafico", async () => {
      const scrollMock = vi.fn();
      window.HTMLElement.prototype.scrollIntoView = scrollMock;

      render(<App />);

      await screen.findByTestId("trend-chart");

      await userEvent.click(screen.getByTestId("trend-month-2025-10"));

      await waitFor(() => {
        expect(scrollMock).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
      });

      delete window.HTMLElement.prototype.scrollIntoView;
    });
  });

  it("fechar modal de budget ao abrir modal de transacao (isolamento de modais)", async () => {
    const user = userEvent.setup();
    transactionsService.listCategories.mockResolvedValueOnce([{ id: 1, name: "Alimentacao" }]);

    render(<App />);

    const newBudgetButton = screen.getByRole("button", { name: "+ Nova meta" });
    await waitFor(() => expect(newBudgetButton).toBeEnabled());
    await user.click(newBudgetButton);

    expect(screen.getByRole("dialog", { name: "Meta do mes" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Registrar novo valor" }));

    expect(screen.queryByRole("dialog", { name: "Meta do mes" })).not.toBeInTheDocument();
    expect(screen.getByText("Registro de valor")).toBeInTheDocument();
  });

  it("exibe cards de pendencias no dashboard", async () => {
    billsService.getSummary.mockResolvedValue({
      pendingCount: 3,
      pendingTotal: 450.0,
      overdueCount: 1,
      overdueTotal: 150.0,
    });

    render(<App />);

    expect(await screen.findByText(/450[,.]00/)).toBeInTheDocument();
    expect(screen.getByText(/150[,.]00/)).toBeInTheDocument();
    expect(screen.getByText("3 contas")).toBeInTheDocument();
  });
});
