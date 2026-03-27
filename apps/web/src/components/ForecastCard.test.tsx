import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ForecastCard from "./ForecastCard";
import { DiscreetModeProvider } from "../context/DiscreetModeContext";
import type { Forecast } from "../services/forecast.service";

vi.mock("../services/forecast.service", () => ({
  forecastService: {
    getCurrent: vi.fn(),
    recompute: vi.fn(),
  },
}));

vi.mock("../services/profile.service", () => ({
  profileService: {
    getMe: vi.fn(),
  },
}));

const { forecastService } = await import("../services/forecast.service");
const { profileService } = await import("../services/profile.service");

const buildForecast = (overrides: Partial<Forecast> = {}): Forecast => ({
  month: "2026-03",
  projectedBalance: 100,
  adjustedProjectedBalance: -220,
  spendingToDate: 900,
  dailyAvgSpending: 30,
  daysRemaining: 7,
  flipDetected: false,
  flipDirection: null,
  engineVersion: "v2",
  incomeExpected: 1200,
  billsPendingTotal: 0,
  billsPendingCount: 0,
  bankLimit: {
    total: 1000,
    used: 220,
    remaining: 780,
    exceededBy: 0,
    usagePct: 22,
    status: "using",
    alertTriggered: false,
  },
  ...overrides,
});

const buildMe = () => ({
  id: 1,
  name: "Jr",
  email: "jr@example.com",
  hasPassword: true,
  linkedProviders: [],
  trialEndsAt: null,
  trialExpired: false,
  profile: {
    displayName: "Jr",
    salaryMonthly: 5000,
    bankLimitTotal: 1000,
    payday: 5,
    avatarUrl: null,
    taxpayerCpf: null,
  },
});

const renderCard = () =>
  render(
    <DiscreetModeProvider>
      <ForecastCard />
    </DiscreetModeProvider>,
  );

describe("ForecastCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(profileService.getMe).mockResolvedValue(buildMe());
    vi.mocked(forecastService.getCurrent).mockResolvedValue(buildForecast());
    vi.mocked(forecastService.recompute).mockResolvedValue(buildForecast());
  });

  it("renderiza painel de limite bancario quando o forecast inclui uso projetado", async () => {
    renderCard();

    await waitFor(() => expect(screen.getByText("Limite bancário")).toBeInTheDocument());
    expect(screen.getByText(/A projeção usa/)).toBeInTheDocument();
    expect(screen.getByText(/disponível/)).toBeInTheDocument();
    expect(screen.getByText(/22% do limite/)).toBeInTheDocument();
  });

  it("destaca quando a projeção ultrapassa o limite bancario", async () => {
    vi.mocked(forecastService.getCurrent).mockResolvedValue(
      buildForecast({
        adjustedProjectedBalance: -1400,
        bankLimit: {
          total: 1000,
          used: 1000,
          remaining: 0,
          exceededBy: 400,
          usagePct: 100,
          status: "exceeded",
          alertTriggered: true,
        },
      }),
    );

    renderCard();

    await waitFor(() =>
      expect(screen.getByText(/A projeção ultrapassa o limite/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/100% do limite/)).toBeInTheDocument();
  });
});
