import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import HealthOverview, { generateTrajectory } from "./HealthOverview";

vi.mock("recharts", () => ({
  AreaChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="area-chart" data-points={data.length} />
  ),
  Area: () => null,
  XAxis: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ReferenceLine: () => null,
}));

vi.mock("../services/forecast.service", () => ({
  forecastService: { getCurrent: vi.fn() },
}));

import { forecastService } from "../services/forecast.service";

const buildForecast = (overrides = {}) => ({
  month: "2026-03",
  projectedBalance: 1200,
  adjustedProjectedBalance: 1200,
  spendingToDate: 500,
  dailyAvgSpending: 50,
  daysRemaining: 10,
  flipDetected: false,
  flipDirection: null,
  engineVersion: "v1",
  incomeExpected: 3000,
  billsPendingTotal: 0,
  billsPendingCount: 0,
  ...overrides,
});

describe("generateTrajectory", () => {
  it("retorna array vazio quando daysRemaining e zero", () => {
    expect(generateTrajectory(buildForecast({ daysRemaining: 0 }) as never)).toEqual([]);
  });

  it("primeiro ponto e Hoje, ultimo ponto e Fim", () => {
    const points = generateTrajectory(buildForecast({ daysRemaining: 5 }) as never);
    expect(points[0].day).toBe("Hoje");
    expect(points[points.length - 1].day).toBe("Fim");
  });

  it("gera daysRemaining+1 pontos", () => {
    const points = generateTrajectory(buildForecast({ daysRemaining: 8 }) as never);
    expect(points).toHaveLength(9);
  });

  it("ultimo ponto e igual ao adjustedProjectedBalance", () => {
    const forecast = buildForecast({ adjustedProjectedBalance: 800, dailyAvgSpending: 40, daysRemaining: 5 });
    const points = generateTrajectory(forecast as never);
    expect(points[points.length - 1].balance).toBe(800);
  });

  it("saldo decai diariamente pelo dailyAvgSpending", () => {
    const forecast = buildForecast({ adjustedProjectedBalance: 1000, dailyAvgSpending: 100, daysRemaining: 3 });
    const points = generateTrajectory(forecast as never);
    expect(points[0].balance).toBe(1300); // 1000 + 100*3
    expect(points[1].balance).toBe(1200);
    expect(points[2].balance).toBe(1100);
    expect(points[3].balance).toBe(1000);
  });
});

describe("HealthOverview", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("retorna null quando forecast e null", async () => {
    (forecastService.getCurrent as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await act(async () => {
      render(<HealthOverview />);
    });
    expect(screen.queryByText("Saúde Financeira do Mês")).toBeNull();
  });

  it("retorna null quando daysRemaining e zero", async () => {
    (forecastService.getCurrent as ReturnType<typeof vi.fn>).mockResolvedValue(
      buildForecast({ daysRemaining: 0 }),
    );
    await act(async () => {
      render(<HealthOverview />);
    });
    expect(screen.queryByText("Saúde Financeira do Mês")).toBeNull();
  });

  it("renderiza titulo e paineis quando forecast e valido", async () => {
    (forecastService.getCurrent as ReturnType<typeof vi.fn>).mockResolvedValue(buildForecast());
    await act(async () => {
      render(<HealthOverview />);
    });
    expect(screen.getByText("Saúde Financeira do Mês")).toBeInTheDocument();
    expect(screen.getByText("Dinheiro Livre")).toBeInTheDocument();
    expect(screen.getByText("Trajetória do Mês")).toBeInTheDocument();
  });

  it("renderiza AreaChart com daysRemaining+1 pontos na trajetoria", async () => {
    (forecastService.getCurrent as ReturnType<typeof vi.fn>).mockResolvedValue(
      buildForecast({ daysRemaining: 5 }),
    );
    await act(async () => {
      render(<HealthOverview />);
    });
    expect(Number(screen.getByTestId("area-chart").dataset.points)).toBe(6);
  });

  it("exibe mensagem de risco quando saldo projetado e negativo", async () => {
    (forecastService.getCurrent as ReturnType<typeof vi.fn>).mockResolvedValue(
      buildForecast({ adjustedProjectedBalance: -200 }),
    );
    await act(async () => {
      render(<HealthOverview />);
    });
    expect(screen.getByText("Projeção negativa — revise seus gastos")).toBeInTheDocument();
  });

  it("exibe label positivo quando saldo projetado e positivo", async () => {
    (forecastService.getCurrent as ReturnType<typeof vi.fn>).mockResolvedValue(buildForecast());
    await act(async () => {
      render(<HealthOverview />);
    });
    expect(screen.getByText("projetado ao fim do mês")).toBeInTheDocument();
  });

  it("renderiza gauge SVG quando incomeExpected esta disponivel", async () => {
    (forecastService.getCurrent as ReturnType<typeof vi.fn>).mockResolvedValue(buildForecast());
    await act(async () => {
      render(<HealthOverview />);
    });
    expect(screen.getByRole("img", { name: /gauge/i })).toBeInTheDocument();
  });

  it("omite gauge SVG quando incomeExpected e null", async () => {
    (forecastService.getCurrent as ReturnType<typeof vi.fn>).mockResolvedValue(
      buildForecast({ incomeExpected: null }),
    );
    await act(async () => {
      render(<HealthOverview />);
    });
    expect(screen.queryByRole("img", { name: /gauge/i })).toBeNull();
  });
});
