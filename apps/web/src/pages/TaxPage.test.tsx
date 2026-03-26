import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TaxPage from "./TaxPage";
import {
  taxService,
  type TaxDocument,
  type TaxDocumentDetail,
  type TaxFact,
  type TaxObligation,
  type TaxSummary,
} from "../services/tax.service";

vi.mock("../services/tax.service", () => ({
  taxService: {
    listDocuments: vi.fn(),
    uploadDocument: vi.fn(),
    reprocessDocument: vi.fn(),
    deleteDocument: vi.fn(),
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

const buildDocument = (overrides: Partial<TaxDocument> = {}): TaxDocument => ({
  id: 1,
  taxYear: 2026,
  originalFileName: "empregador.pdf",
  documentType: "income_report_employer",
  processingStatus: "normalized",
  sourceLabel: "ACME",
  sourceHint: "Informe 2025",
  uploadedAt: "2026-03-26T12:00:00.000Z",
  ...overrides,
});

const buildDocumentDetail = (overrides: Partial<TaxDocumentDetail> = {}): TaxDocumentDetail => ({
  ...buildDocument(overrides),
  mimeType: "application/pdf",
  byteSize: 12345,
  sha256: "abc123",
  latestExtraction: null,
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
    vi.mocked(taxService.listDocuments).mockResolvedValue({
      items: [buildDocument()],
      page: 1,
      pageSize: 6,
      total: 1,
    });
    vi.mocked(taxService.uploadDocument).mockResolvedValue(buildDocumentDetail());
    vi.mocked(taxService.reprocessDocument).mockResolvedValue(
      buildDocumentDetail({
        processingStatus: "normalized",
        latestExtraction: {
          extractorName: "income-report-employer",
          extractorVersion: "1.0.0",
          classification: "income_report_employer",
          confidenceScore: 0.98,
          warnings: [],
          createdAt: "2026-03-26T12:00:00.000Z",
        },
      }),
    );
    vi.mocked(taxService.deleteDocument).mockResolvedValue({
      deletedDocumentId: 1,
      deletedFactsCount: 1,
    });
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
    expect(screen.getByText("Documentos do exercício")).toBeInTheDocument();
    expect(screen.getByText("empregador.pdf")).toBeInTheDocument();
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

  it("envia documento, reprocessa e atualiza o dashboard fiscal", async () => {
    const user = userEvent.setup();
    const uploadedFile = new File(["conteudo fiscal"], "informe-2025.pdf", {
      type: "application/pdf",
    });

    vi.mocked(taxService.listDocuments)
      .mockResolvedValueOnce({
        items: [],
        page: 1,
        pageSize: 6,
        total: 0,
      })
      .mockResolvedValue({
        items: [
          buildDocument({
            id: 55,
            originalFileName: "informe-2025.pdf",
            sourceLabel: "Banco Inter",
            sourceHint: "Informe 2025",
          }),
        ],
        page: 1,
        pageSize: 6,
        total: 1,
      });

    vi.mocked(taxService.uploadDocument).mockResolvedValueOnce(
      buildDocumentDetail({
        id: 55,
        originalFileName: "informe-2025.pdf",
        processingStatus: "uploaded",
        sourceLabel: "Banco Inter",
        sourceHint: "Informe 2025",
      }),
    );

    vi.mocked(taxService.reprocessDocument).mockResolvedValueOnce(
      buildDocumentDetail({
        id: 55,
        originalFileName: "informe-2025.pdf",
        processingStatus: "normalized",
        sourceLabel: "Banco Inter",
        sourceHint: "Informe 2025",
      }),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Enviar documento" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Enviar documento" }));
    await user.upload(screen.getByLabelText("Arquivo fiscal"), uploadedFile);
    await user.type(screen.getByLabelText("Fonte ou instituição"), "Banco Inter");
    await user.type(screen.getByLabelText("Observação"), "Informe 2025");
    await user.click(screen.getByRole("button", { name: "Enviar e processar" }));

    await waitFor(() => {
      expect(taxService.uploadDocument).toHaveBeenCalledWith(2026, uploadedFile, {
        sourceLabel: "Banco Inter",
        sourceHint: "Informe 2025",
      });
    });

    await waitFor(() => {
      expect(taxService.reprocessDocument).toHaveBeenCalledWith(55);
    });

    await waitFor(() => {
      expect(taxService.rebuildSummary).toHaveBeenCalledWith(2026);
    });

    expect(
      (
        await screen.findAllByText(
          "Documento enviado e processado. Se houver fatos extraídos, eles já aparecem na fila de revisão.",
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(await screen.findByText("informe-2025.pdf")).toBeInTheDocument();
  });

  it("distingue upload concluído de falha no processamento", async () => {
    const user = userEvent.setup();
    const uploadedFile = new File(["conteudo fiscal"], "falhou.pdf", {
      type: "application/pdf",
    });

    vi.mocked(taxService.listDocuments)
      .mockResolvedValueOnce({
        items: [],
        page: 1,
        pageSize: 6,
        total: 0,
      })
      .mockResolvedValue({
        items: [
          buildDocument({
            id: 77,
            originalFileName: "falhou.pdf",
            processingStatus: "failed",
            sourceLabel: "Plano de Saúde",
          }),
        ],
        page: 1,
        pageSize: 6,
        total: 1,
      });

    vi.mocked(taxService.uploadDocument).mockResolvedValueOnce(
      buildDocumentDetail({
        id: 77,
        originalFileName: "falhou.pdf",
        processingStatus: "uploaded",
        sourceLabel: "Plano de Saúde",
      }),
    );
    vi.mocked(taxService.reprocessDocument).mockRejectedValueOnce({
      response: {
        data: {
          message: "Falha ao processar documento fiscal.",
        },
      },
    });

    renderPage();

    await screen.findByRole("button", { name: "Enviar documento" });
    await user.click(screen.getByRole("button", { name: "Enviar documento" }));
    await user.upload(screen.getByLabelText("Arquivo fiscal"), uploadedFile);
    await user.click(screen.getByRole("button", { name: "Enviar e processar" }));

    expect(
      await screen.findByText(
        "Documento enviado, mas não foi possível processar. Falha ao processar documento fiscal.",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("falhou.pdf")).toBeInTheDocument();
    expect(taxService.rebuildSummary).not.toHaveBeenCalled();
  });

  it("permite tentar novamente um documento com falha e rebuilda o resumo", async () => {
    const user = userEvent.setup();

    vi.mocked(taxService.listDocuments).mockResolvedValue({
      items: [
        buildDocument({
          id: 44,
          originalFileName: "falha-retry.pdf",
          processingStatus: "failed",
        }),
      ],
      page: 1,
      pageSize: 6,
      total: 1,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("falha-retry.pdf")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Tentar novamente falha-retry.pdf" }));

    await waitFor(() => {
      expect(taxService.reprocessDocument).toHaveBeenCalledWith(44);
    });

    await waitFor(() => {
      expect(taxService.rebuildSummary).toHaveBeenCalledWith(2026);
    });

    expect(
      await screen.findByText(
        "Documento processado novamente. Se houver fatos extraídos, eles já aparecem na fila de revisão.",
      ),
    ).toBeInTheDocument();
  });

  it("exclui documento, confirma a ação e rebuilda o resumo", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    vi.mocked(taxService.listDocuments).mockResolvedValue({
      items: [
        buildDocument({
          id: 18,
          originalFileName: "documento-errado.pdf",
          processingStatus: "uploaded",
        }),
      ],
      page: 1,
      pageSize: 6,
      total: 1,
    });
    vi.mocked(taxService.deleteDocument).mockResolvedValueOnce({
      deletedDocumentId: 18,
      deletedFactsCount: 2,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("documento-errado.pdf")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Excluir documento-errado.pdf" }));

    expect(confirmSpy).toHaveBeenCalledWith(
      "Excluir documento? Os fatos fiscais extraídos deste documento também serão apagados.",
    );

    await waitFor(() => {
      expect(taxService.deleteDocument).toHaveBeenCalledWith(18);
    });

    await waitFor(() => {
      expect(taxService.rebuildSummary).toHaveBeenCalledWith(2026);
    });

    expect(
      await screen.findByText("Documento excluído. 2 fato(s) fiscal(is) vinculado(s) foram removidos."),
    ).toBeInTheDocument();

    confirmSpy.mockRestore();
  });
});
