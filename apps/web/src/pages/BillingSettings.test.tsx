import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import BillingSettings from "./BillingSettings";
import { billingService, type SubscriptionSummary } from "../services/billing.service";

vi.mock("../services/billing.service", () => ({
  billingService: {
    getSubscription: vi.fn(),
    createCheckout: vi.fn(),
    createPortal: vi.fn(),
  },
}));

const buildSummary = (overrides: Partial<SubscriptionSummary> = {}): SubscriptionSummary => ({
  plan: "free",
  displayName: "Plano Gratuito",
  features: {
    csv_import: false,
    csv_export: false,
    analytics_months_max: 6,
    budget_tracking: true,
    salary_annual: true,
  },
  subscription: null,
  entitlementSource: "trial",
  trialEndsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  trialExpired: false,
  ...overrides,
});

describe("BillingSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("explica no trial que importação e exportação de extratos fazem parte do Pro", async () => {
    vi.mocked(billingService.getSubscription).mockResolvedValue(buildSummary());

    render(<BillingSettings />);

    await waitFor(() =>
      expect(screen.getByText("Trial do Control Finance")).toBeInTheDocument(),
    );

    expect(
      screen.getByText(
        /Durante o trial, você testa o painel financeiro, metas, cartões, renda e a Central do Leão/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Importação e exportação de extratos fazem parte do plano Pro/i),
    ).toBeInTheDocument();
  });
});
