import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TaxPage from "./TaxPage";
import {
  taxService,
  type TaxFact,
  type TaxObligation,
  type TaxSummary,
} from "../services/tax.service";

vi.mock("../services/tax.service", () => ({
  taxService: {
    getSummary: vi.fn(),
    rebuildSummary: vi.fn(),
    getObligation: vi.fn(),
    listFacts: vi.fn(),
    reviewFact: vi.fn(),
    bulkApproveFacts: vi.fn(),
  },
}));

const buildSummary = (overrides: Partial<TaxSummary> = {}): TaxSummary => ({
  taxYear: 2026,
  exerciseYear: 2026,
  calendarYear: 2025,
  status: "generated",
  snapshotVersion: 1,
  mustDeclare: true,
  obligationReasons: ["TAXABLE_INCOME_LIMIT"],
  annualTaxableIncome: 54321,
  annualExemptIncome: 0,
  annualExclusiveIncome: 5000,
  annualWithheldTax: 4321.09,
  totalLegalDeductions: 0,
  simplifiedDiscountUsed: 10864.2,
  bestMethod: "simplified_discount",
  estimatedAnnualTax: 1839.49,
  warnings: [],
  sourceCounts: {
    documents: 1,
    factsPending: 1,
    factsApproved: 3,
  },
  generatedAt: "2026-03-26T12:00:00.000Z",
  ...overrides,
});

const buildObligation = (overrides: Partial<TaxObligation> = {}): TaxObligation => ({
  taxYear: 2026,
  exerciseYear: 2026,
  calendarYear: 2025,
  mustDeclare: true,
  reasons: [
    {
      code: "TAXABLE_INCOME_LIMIT",
      message: "Rendimentos tributaveis acima do limite do exercicio.",
    },
  ],
  thresholds: {
    taxableIncome: 35584,
    exemptAndExclusiveIncome: 200000,
    assets: 800000,
    ruralRevenue: 177920,
  },
  totals: {
    annualTaxableIncome: 54321,
    annualExemptIncome: 0,
    annualExclusiveIncome: 5000,
    annualCombinedExemptAndExclusiveIncome: 5000,
    totalAssetBalance: 0,
  },
  approvedFactsCount: 3,
  ...overrides,
});

const buildFact = (overrides: Partial<TaxFact> = {}): TaxFact => ({
  id: 91,
  taxYear: 2026,
  sourceDocumentId: 1,
  factType: "taxable_income",
  category: "Rendimentos",
  subcategory: "annual_taxable_income",
  payerName: "ACME LTDA",
  payerDocument: "12345678000190",
  referencePeriod: "2025-12",
  currency: "BRL",
  amount: 54321,
  confidenceScore: 0.98,
  dedupeStrength: "strong",
  reviewStatus: "pending",
  conflictCode: null,
  conflictMessage: null,
  metadata: {},
  createdAt: "2026-03-26T12:00:00.000Z",
  updatedAt: "2026-03-26T12:00:00.000Z",
  sourceDocument: {
    id: 1,
    originalFileName: "empregador.csv",
    documentType: "income_report_employer",
    processingStatus: "normalized",
    sourceLabel: "ACME",
    uploadedAt: "2026-03-26T12:00:00.000Z",
  },
  ...overrides,
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/app/tax/2026"]}>
      <Routes>
        <Route path="/app/tax/:taxYear" element={<TaxPage onBack={vi.fn()} />} />
      </Routes>
    </MemoryRouter>,
  );

describe("TaxPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(taxService.getSummary).mockResolvedValue(buildSummary());
    vi.mocked(taxService.getObligation).mockResolvedValue(buildObligation());
    vi.mocked(taxService.listFacts).mockResolvedValue({
      items: [buildFact()],
      page: 1,
      pageSize: 25,
      total: 1,
    });
    vi.mocked(taxService.rebuildSummary).mockResolvedValue(buildSummary({ snapshotVersion: 2 }));
    vi.mocked(taxService.bulkApproveFacts).mockResolvedValue({ updatedCount: 1 });
    vi.mocked(taxService.reviewFact).mockResolvedValue(buildFact({ reviewStatus: "approved" }));
  });

  it("renderiza resumo, gatilhos e fila de revisão", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Central do Leão" })).toBeInTheDocument();
    });

    expect(screen.getByText("Obrigatório declarar")).toBeInTheDocument();
    expect(screen.getByText("TAXABLE_INCOME_LIMIT")).toBeInTheDocument();
    expect(screen.getByText("ACME LTDA")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aprovar todos pendentes" })).toBeInTheDocument();
  });

  it("aprovar todos pendentes chama bulkApproveFacts e recarrega os dados", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("ACME LTDA")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Aprovar todos pendentes" }));

    await waitFor(() => {
      expect(taxService.bulkApproveFacts).toHaveBeenCalledWith(
        [91],
        "Aprovação em lote pela Central do Leão.",
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });

  it("gerar resumo chama rebuildSummary", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Gerar resumo" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Gerar resumo" }));

    await waitFor(() => {
      expect(taxService.rebuildSummary).toHaveBeenCalledWith(2026);
    });
  });
});
