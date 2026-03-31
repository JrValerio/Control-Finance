import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import BankAccountsWidget from "./BankAccountsWidget";
import { DiscreetModeProvider } from "../context/DiscreetModeContext";
import {
  bankAccountsService,
  type BankAccountItem,
  type BankAccountsSummary,
} from "../services/bank-accounts.service";
import { aiService } from "../services/ai.service";

vi.mock("../services/bank-accounts.service", () => ({
  bankAccountsService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../services/ai.service", () => ({
  aiService: {
    getBankAccountInsight: vi.fn(),
  },
}));

const buildAccount = (overrides: Partial<BankAccountItem> = {}): BankAccountItem => ({
  id: 1,
  userId: 1,
  name: "Conta principal",
  bankName: "Banco A",
  balance: 100,
  limitTotal: 1000,
  limitUsed: 0,
  limitAvailable: 1000,
  isActive: true,
  createdAt: "2026-03-31T00:00:00.000Z",
  updatedAt: "2026-03-31T00:00:00.000Z",
  ...overrides,
});

const buildSummary = (overrides: Partial<BankAccountsSummary> = {}): BankAccountsSummary => ({
  totalBalance: 100,
  totalLimitTotal: 1000,
  totalLimitUsed: 0,
  totalLimitAvailable: 1000,
  accountsCount: 1,
  ...overrides,
});

const renderWidget = () =>
  render(
    <DiscreetModeProvider>
      <BankAccountsWidget />
    </DiscreetModeProvider>,
  );

describe("BankAccountsWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aiService.getBankAccountInsight).mockResolvedValue(null);
    vi.mocked(bankAccountsService.list).mockResolvedValue({
      accounts: [buildAccount()],
      summary: buildSummary(),
    });
  });

  it("exibe status operacional por conta (Sem uso, Em uso, Excedido)", async () => {
    vi.mocked(bankAccountsService.list).mockResolvedValue({
      accounts: [
        buildAccount({ id: 1, name: "Conta 1", balance: 400, limitTotal: 1000, limitUsed: 0, limitAvailable: 1000 }),
        buildAccount({ id: 2, name: "Conta 2", balance: -200, limitTotal: 1000, limitUsed: 200, limitAvailable: 800 }),
        buildAccount({ id: 3, name: "Conta 3", balance: -1200, limitTotal: 1000, limitUsed: 1000, limitAvailable: 0 }),
      ],
      summary: buildSummary({
        totalBalance: -1000,
        totalLimitTotal: 3000,
        totalLimitUsed: 1200,
        totalLimitAvailable: 1800,
        accountsCount: 3,
      }),
    });

    renderWidget();

    await waitFor(() => {
      expect(screen.getByText("3 contas cadastradas")).toBeInTheDocument();
    });

    expect(screen.getByText("Sem uso")).toBeInTheDocument();
    expect(screen.getByText("Em uso")).toBeInTheDocument();
    expect(screen.getByText("Excedido")).toBeInTheDocument();
  });

  it("resume limite como esgotado quando uso total atinge o limite", async () => {
    vi.mocked(bankAccountsService.list).mockResolvedValue({
      accounts: [
        buildAccount({ id: 1, balance: -1000, limitTotal: 1000, limitUsed: 1000, limitAvailable: 0 }),
      ],
      summary: buildSummary({
        totalBalance: -1000,
        totalLimitTotal: 1000,
        totalLimitUsed: 1000,
        totalLimitAvailable: 0,
        accountsCount: 1,
      }),
    });

    renderWidget();

    await waitFor(() => {
      expect(screen.getByText("Limite esgotado")).toBeInTheDocument();
    });
  });
});
