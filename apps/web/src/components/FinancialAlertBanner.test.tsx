import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FinancialAlertBanner from "./FinancialAlertBanner";

vi.mock("../services/forecast.service", () => ({
  forecastService: {
    getCurrent: vi.fn(),
  },
}));

import { forecastService } from "../services/forecast.service";

const buildForecast = (adjustedProjectedBalance: number, month = "2026-03") => ({
  month,
  projectedBalance: adjustedProjectedBalance,
  adjustedProjectedBalance,
  spendingToDate: 500,
  dailyAvgSpending: 20,
  daysRemaining: 10,
  flipDetected: false,
  flipDirection: null,
  engineVersion: "v1",
  incomeExpected: null,
  billsPendingTotal: 0,
  billsPendingCount: 0,
});

describe("FinancialAlertBanner", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sessionStorage.clear();
  });

  it("nao exibe nada quando projecao e null (sem forecast ainda)", async () => {
    (forecastService.getCurrent as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await act(async () => {
      render(<FinancialAlertBanner />);
    });

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("nao exibe nada quando saldo projetado e positivo", async () => {
    (forecastService.getCurrent as ReturnType<typeof vi.fn>).mockResolvedValue(
      buildForecast(250),
    );

    await act(async () => {
      render(<FinancialAlertBanner />);
    });

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("nao exibe nada quando saldo projetado e zero", async () => {
    (forecastService.getCurrent as ReturnType<typeof vi.fn>).mockResolvedValue(
      buildForecast(0),
    );

    await act(async () => {
      render(<FinancialAlertBanner />);
    });

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("exibe alerta quando saldo projetado e negativo", async () => {
    (forecastService.getCurrent as ReturnType<typeof vi.fn>).mockResolvedValue(
      buildForecast(-320.5, "2026-03"),
    );

    await act(async () => {
      render(<FinancialAlertBanner />);
    });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert").textContent).toContain("2026-03");
  });

  it("botao fechar oculta o alerta e persiste no sessionStorage", async () => {
    (forecastService.getCurrent as ReturnType<typeof vi.fn>).mockResolvedValue(
      buildForecast(-100),
    );

    await act(async () => {
      render(<FinancialAlertBanner />);
    });

    expect(screen.getByRole("alert")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /fechar alerta/i }));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(sessionStorage.getItem("cf.forecast_alert.dismissed_v1")).toBe("1");
  });

  it("nao exibe alerta se ja foi dispensado via sessionStorage", async () => {
    sessionStorage.setItem("cf.forecast_alert.dismissed_v1", "1");
    (forecastService.getCurrent as ReturnType<typeof vi.fn>).mockResolvedValue(
      buildForecast(-200),
    );

    await act(async () => {
      render(<FinancialAlertBanner />);
    });

    expect(screen.queryByRole("alert")).toBeNull();
  });
});
