import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TaxPage from "./TaxPage";
import { profileService } from "../services/profile.service";
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
    syncAppData: vi.fn(),
    deleteDocument: vi.fn(),
    downloadExport: vi.fn(),
    getSummary: vi.fn(),
    rebuildSummary: vi.fn(),
    getObligation: vi.fn(),
    listFacts: vi.fn(),
    createManualFact: vi.fn(),
    reviewFact: vi.fn(),
    bulkApproveFacts: vi.fn(),
  },
}));

vi.mock("../services/profile.service", () => ({
  profileService: {
    getMe: vi.fn(),
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
    annualWithheldTax: 4321.09,
    totalLegalDeductions: 0,
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

const renderPage = (props: { onOpenProfileSettings?: () => void } = {}) =>
  render(
    <MemoryRouter initialEntries={["/app/tax/2026"]}>
      <Routes>
        <Route path="/app/tax/:taxYear" element={<TaxPage onBack={vi.fn()} {...props} />} />
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
    vi.mocked(taxService.syncAppData).mockResolvedValue({
      taxYear: 2026,
      exerciseYear: 2026,
      calendarYear: 2025,
      sourceOrigin: "app",
      processedStatements: 1,
      processedTransactions: 1,
      totalFactsGenerated: 2,
      preservedReviewedFactsCount: 0,
      summariesRebuilt: 1,
    });
    vi.mocked(taxService.deleteDocument).mockResolvedValue({
      deletedDocumentId: 1,
      deletedFactsCount: 1,
    });
    vi.mocked(taxService.downloadExport).mockResolvedValue({
      fileName: "dossie-fiscal-2026.json",
    });
    vi.mocked(taxService.getSummary).mockResolvedValue(buildSummary());
    vi.mocked(taxService.getObligation).mockResolvedValue(buildObligation());
    vi.mocked(taxService.listFacts).mockResolvedValue({
      items: [buildFact()],
      page: 1,
      pageSize: 25,
      total: 1,
    });
    vi.mocked(taxService.createManualFact).mockResolvedValue(
      buildFact({
        id: 301,
        sourceDocumentId: null,
        sourceDocument: null,
        category: "manual_entry",
        subcategory: "Renda manual INSS",
        payerName: "INSS",
      }),
    );
    vi.mocked(taxService.rebuildSummary).mockResolvedValue(buildSummary({ snapshotVersion: 2 }));
    vi.mocked(taxService.bulkApproveFacts).mockResolvedValue({
      updatedCount: 1,
      taxYear: 2026,
      preview: null,
    });
    vi.mocked(taxService.reviewFact).mockResolvedValue({
      fact: buildFact({ reviewStatus: "approved" }),
      preview: null,
    });
    vi.mocked(profileService.getMe).mockResolvedValue({
      id: 1,
      name: "Jr",
      email: "jr@example.com",
      trialEndsAt: null,
      trialExpired: false,
      profile: {
        displayName: "Jr",
        salaryMonthly: null,
        payday: null,
        avatarUrl: null,
        taxpayerCpf: "52998224725",
      },
    });
  });

  it("renderiza resumo, gatilhos e fila de revisão", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Central do Leão" })).toBeInTheDocument();
    });

    expect(screen.getByText("Obrigatório declarar")).toBeInTheDocument();
    expect(screen.getByText("Rendimentos tributáveis acima do limite")).toBeInTheDocument();
    expect(screen.getByText("ACME LTDA")).toBeInTheDocument();
    expect(screen.getByText("Documentos do exercício")).toBeInTheDocument();
    expect(screen.getByText("empregador.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aprovar todos pendentes" })).toBeInTheDocument();
  });

  it("exibe resumo da declaração e painel operacional de pendências", async () => {
    vi.mocked(taxService.getSummary).mockResolvedValue(
      buildSummary({
        sourceCounts: {
          documents: 1,
          factsPending: 3,
          factsApproved: 2,
        },
      }),
    );
    vi.mocked(taxService.getObligation).mockResolvedValue(
      buildObligation({
        approvedFactsCount: 2,
      }),
    );
    vi.mocked(taxService.listFacts).mockResolvedValue({
      items: [
        buildFact({
          id: 901,
          sourceDocumentId: null,
          sourceDocument: null,
          factType: "debt_balance",
          amount: 1500,
        }),
        buildFact({
          id: 902,
          conflictCode: "TAX_FACT_DUPLICATE",
          conflictMessage: "Fato potencialmente duplicado.",
          metadata: {
            beneficiaryDocument: "11111111111",
          },
        }),
        buildFact({
          id: 903,
          metadata: {
            beneficiaryDocument: "52998224725",
          },
        }),
      ],
      page: 1,
      pageSize: 25,
      total: 3,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Resumo da declaração em tela")).toBeInTheDocument();
    });

    expect(screen.getByText("Painel de pendências de conferência")).toBeInTheDocument();
    expect(screen.getByText("CPF titular: 529.982.247-25")).toBeInTheDocument();
    expect(screen.getByText("3 pendência(s) em revisão humana")).toBeInTheDocument();
    expect(screen.getByText("Entradas sem arquivo fiscal de origem")).toBeInTheDocument();
    expect(screen.getByText("Fatos sinalizados como potencialmente duplicados")).toBeInTheDocument();
  });

  it("traduz avisos, subcategoria, periodo e conflito para linguagem mais humana", async () => {
    vi.mocked(taxService.getSummary).mockResolvedValue(
      buildSummary({
        warnings: [
          {
            code: "PENDING_FACTS_EXCLUDED",
            message: "Ha fatos fiscais pendentes de revisao e eles nao entram no resumo anual.",
          },
        ],
      }),
    );
    vi.mocked(taxService.listFacts).mockResolvedValue({
      items: [
        buildFact({
          subcategory: "inss_retirement_65_plus_exempt",
          referencePeriod: "2025-annual",
          conflictCode: "TAX_FACT_DUPLICATE",
          conflictMessage: "Fato potencialmente duplicado com outro documento fiscal do usuario.",
        }),
      ],
      page: 1,
      pageSize: 25,
      total: 1,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Fatos pendentes fora do cálculo")).toBeInTheDocument();
    });

    expect(screen.getAllByText("Possível duplicidade").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Subcategoria fiscal: Aposentadoria do INSS isenta para maiores de 65 anos"),
    ).toBeInTheDocument();
    expect(screen.getByText("Período de referência: Ano de 2025")).toBeInTheDocument();
  });

  it("explica de forma didatica quando o usuario esta sem obrigatoriedade", async () => {
    vi.mocked(taxService.getSummary).mockResolvedValue(
      buildSummary({
        status: "not_generated",
        snapshotVersion: null,
        annualTaxableIncome: 0,
        annualExemptIncome: 0,
        annualExclusiveIncome: 0,
        annualWithheldTax: 0,
      }),
    );
    vi.mocked(taxService.getObligation).mockResolvedValue(
      buildObligation({
        mustDeclare: false,
        reasons: [],
        totals: {
          annualTaxableIncome: 34287.13,
          annualExemptIncome: 24751.74,
          annualExclusiveIncome: 2868.57,
          annualWithheldTax: 13.36,
          totalLegalDeductions: 0,
          annualCombinedExemptAndExclusiveIncome: 27620.31,
          totalAssetBalance: 0,
        },
        approvedFactsCount: 5,
      }),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Sem obrigatoriedade hoje")).toBeInTheDocument();
    });

    expect(screen.getByText(/você está sem obrigatoriedade objetiva/i)).toBeInTheDocument();
    expect(screen.getAllByText("Rendimentos Isentos").length).toBeGreaterThan(0);
    expect(screen.getAllByText((content) => content.includes("24.751,74")).length).toBeGreaterThan(0);
    expect(screen.getAllByText((content) => content.includes("13,36")).length).toBeGreaterThan(0);
  });

  it("sinaliza fato pendente com CPF divergente do titular cadastrado", async () => {
    vi.mocked(taxService.listFacts).mockResolvedValue({
      items: [
        buildFact({
          metadata: {
            beneficiaryDocument: "11111111111",
          },
        }),
      ],
      page: 1,
      pageSize: 25,
      total: 1,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("CPF divergente")).toBeInTheDocument();
    });

    expect(await screen.findByText(/Titular do informe: 111.111.111-11/)).toBeInTheDocument();
    expect(screen.getByText(/fica fora do cálculo oficial do IRPF/i)).toBeInTheDocument();
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

  it("aplica filtros da fila e recarrega listagem com os parametros selecionados", async () => {
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Central do Leão" })).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText("Status de revisão"), "approved");
    await user.selectOptions(screen.getByLabelText("Tipo de fato"), "withheld_tax");
    await user.selectOptions(screen.getByLabelText("Fonte do fato"), "with_document");

    await waitFor(() => {
      const calledWithFilters = vi
        .mocked(taxService.listFacts)
        .mock.calls.some(
          ([params]) =>
            params.taxYear === 2026 &&
            params.reviewStatus === "approved" &&
            params.factType === "withheld_tax" &&
            params.sourceFilter === "with_document",
        );

      expect(calledWithFilters).toBe(true);
    });

    expect(
      screen.getByText(
        "Escopo do lote: 1 pendente(s) visível(is). Filtros atuais: Aprovados | IR retido na fonte | Com documento.",
      ),
    ).toBeInTheDocument();
  });

  it("consome preview do bulk-review sem recarregar summary snapshotado", async () => {
    const user = userEvent.setup();

    vi.mocked(taxService.bulkApproveFacts).mockResolvedValueOnce({
      updatedCount: 1,
      taxYear: 2026,
      preview: {
        taxYear: 2026,
        exerciseYear: 2026,
        calendarYear: 2025,
        summary: buildSummary({
          status: "preview",
          snapshotVersion: null,
          generatedAt: null,
          bestMethod: "legal_deductions",
          sourceCounts: {
            documents: 1,
            factsPending: 0,
            factsApproved: 4,
          },
        }),
        obligation: buildObligation({
          approvedFactsCount: 4,
        }),
      },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("ACME LTDA")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Aprovar todos pendentes" }));

    await waitFor(() => {
      expect(screen.getAllByText("Prévia").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Deduções legais").length).toBeGreaterThan(0);
    });

    expect(taxService.getSummary).toHaveBeenCalledTimes(1);
    expect(taxService.getObligation).toHaveBeenCalledTimes(1);
  });

  it("gerar resumo chama rebuildSummary e recarrega o espelho fiscal completo", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Gerar resumo" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Gerar resumo" }));

    await waitFor(() => {
      expect(taxService.rebuildSummary).toHaveBeenCalledWith(2026);
    });

    await waitFor(() => {
      expect(taxService.getSummary).toHaveBeenCalledTimes(2);
      expect(taxService.getObligation).toHaveBeenCalledTimes(2);
      expect(taxService.listDocuments).toHaveBeenCalledTimes(2);
      expect(taxService.listFacts).toHaveBeenCalledTimes(2);
    });
  });

  it("baixa dossiês oficiais JSON e CSV pelo backend", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Baixar JSON" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Baixar JSON" }));

    await waitFor(() => {
      expect(taxService.downloadExport).toHaveBeenCalledWith(2026, "json");
    });

    vi.mocked(taxService.downloadExport).mockResolvedValueOnce({
      fileName: "dossie-fiscal-2026.csv",
    });

    await user.click(screen.getByRole("button", { name: "Baixar CSV" }));

    await waitFor(() => {
      expect(taxService.downloadExport).toHaveBeenCalledWith(2026, "csv");
    });
  });

  it("abre visualização de impressão para conferência em PDF", async () => {
    const user = userEvent.setup();
    const originalPrint = window.print;
    const printMock = vi.fn();

    Object.defineProperty(window, "print", {
      configurable: true,
      value: printMock,
    });

    try {
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Imprimir / PDF" })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: "Imprimir / PDF" }));

      expect(printMock).toHaveBeenCalledTimes(1);
      expect(
        await screen.findByText(
          "Modo imprimível aberto. Para gerar PDF, use 'Salvar como PDF' na janela de impressão.",
        ),
      ).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "print", {
        configurable: true,
        value: originalPrint,
      });
    }
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
    await user.type(screen.getByLabelText(/Observação/), "Informe 2025");
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

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Confirmar" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(
      (
        await screen.findAllByText(
          "Documento enviado e processado. Fatos disponíveis na fila de revisão.",
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(await screen.findByText("informe-2025.pdf")).toBeInTheDocument();
  });

  it("sincroniza fatos fiscais a partir dos dados ja alimentados no app", async () => {
    const user = userEvent.setup();

    vi.mocked(taxService.listDocuments).mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 6,
      total: 0,
    });
    vi.mocked(taxService.listFacts).mockResolvedValue({
      items: [
        buildFact({
          id: 201,
          sourceDocumentId: null,
          sourceDocument: null,
          subcategory: "app_income_statement_taxable_income",
          payerName: "Empresa ABC",
          amount: 4500,
        }),
      ],
      page: 1,
      pageSize: 25,
      total: 1,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sincronizar do app" })).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: "Sincronizar do app" }));

    await waitFor(() => {
      expect(taxService.syncAppData).toHaveBeenCalledWith(2026);
    });

    expect(
      await screen.findByText(
        "Importamos 2 fatos fiscais pendentes a partir dos dados do app. Revise-os para entrarem no cálculo oficial.",
      ),
    ).toBeInTheDocument();
  });

  it("permite adicionar um fato fiscal manual à fila de revisão", async () => {
    const user = userEvent.setup();

    vi.mocked(taxService.listFacts)
      .mockResolvedValueOnce({
        items: [],
        page: 1,
        pageSize: 25,
        total: 0,
      })
      .mockResolvedValue({
        items: [
          buildFact({
            id: 301,
            sourceDocumentId: null,
            sourceDocument: null,
            category: "manual_entry",
            subcategory: "Renda manual INSS",
            payerName: "INSS",
          }),
        ],
        page: 1,
        pageSize: 25,
        total: 1,
      });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Adicionar manualmente" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Adicionar manualmente" }));
    await user.selectOptions(screen.getByLabelText("Tipo de fato fiscal"), "taxable_income");
    await user.type(screen.getByLabelText("Período de referência"), "2025-12");
    await user.type(screen.getByLabelText("Descrição ou subcategoria fiscal"), "Renda manual INSS");
    await user.type(screen.getByLabelText("Fonte pagadora / origem"), "INSS");
    await user.type(screen.getByLabelText("Documento da fonte (opcional)"), "29.979.036/0001-40");
    await user.type(screen.getByLabelText("Valor"), "2803,52");
    await user.type(screen.getByLabelText("Observação (opcional)"), "Lancamento manual de apoio.");
    await user.click(screen.getByRole("button", { name: "Adicionar à revisão" }));

    await waitFor(() => {
      expect(taxService.createManualFact).toHaveBeenCalledWith({
        taxYear: 2026,
        factType: "taxable_income",
        subcategory: "Renda manual INSS",
        payerName: "INSS",
        payerDocument: "29.979.036/0001-40",
        referencePeriod: "2025-12",
        amount: 2803.52,
        note: "Lancamento manual de apoio.",
      });
    });

    expect(await screen.findByText("Fato manual adicionado à fila de revisão.")).toBeInTheDocument();
    expect(
      await screen.findByText((content) => content.includes("Renda manual INSS")),
    ).toBeInTheDocument();
  }, 10000);

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

  it("bloqueia upload quando a API retorna conflito de CPF divergente", async () => {
    const user = userEvent.setup();
    const uploadedFile = new File(["conteudo fiscal"], "picpay.pdf", {
      type: "application/pdf",
    });

    vi.mocked(taxService.uploadDocument).mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          message:
            "Conflito de CPF divergente. Documento no CPF 214.679.738-07 e perfil fiscal no CPF 529.982.247-25.",
          code: "TAX_DOCUMENT_TAXPAYER_CPF_MISMATCH",
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
        "Conflito de CPF divergente. Documento no CPF 214.679.738-07 e perfil fiscal no CPF 529.982.247-25.",
      ),
    ).toBeInTheDocument();
    expect(taxService.reprocessDocument).not.toHaveBeenCalled();
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
      await screen.findByText("Documento excluído. 2 fatos fiscais vinculados foram removidos."),
    ).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  // ─── Auto-sync ────────────────────────────────────────────────────────────

  it("auto-sync dispara quando nao ha fatos nem documentos ao carregar", async () => {
    vi.mocked(taxService.listDocuments).mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 6,
      total: 0,
    });
    vi.mocked(taxService.listFacts).mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
    });
    vi.mocked(taxService.syncAppData).mockResolvedValue({
      taxYear: 2026,
      exerciseYear: 2026,
      calendarYear: 2025,
      sourceOrigin: "app",
      processedStatements: 2,
      processedTransactions: 0,
      totalFactsGenerated: 2,
      preservedReviewedFactsCount: 0,
      summariesRebuilt: 1,
    });

    renderPage();

    await waitFor(() => {
      expect(taxService.syncAppData).toHaveBeenCalledWith(2026);
    });

    // loadPageData re-executado após sync bem-sucedido com fatos gerados
    await waitFor(() => {
      expect(taxService.getSummary).toHaveBeenCalledTimes(2);
    });
  });

  it("auto-sync nao dispara quando ja existem fatos", async () => {
    // beforeEach já configura listFacts com total: 1 e listDocuments com total: 1
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Central do Leão" })).toBeInTheDocument();
    });

    expect(taxService.syncAppData).not.toHaveBeenCalled();
  });

  it("auto-sync nao dispara mais de uma vez no mesmo mount", async () => {
    vi.mocked(taxService.listDocuments).mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 6,
      total: 0,
    });
    vi.mocked(taxService.listFacts).mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
    });
    vi.mocked(taxService.syncAppData).mockResolvedValue({
      taxYear: 2026,
      exerciseYear: 2026,
      calendarYear: 2025,
      sourceOrigin: "app",
      processedStatements: 0,
      processedTransactions: 0,
      totalFactsGenerated: 0,
      preservedReviewedFactsCount: 0,
      summariesRebuilt: 0,
    });

    renderPage();

    await waitFor(() => {
      expect(taxService.syncAppData).toHaveBeenCalledTimes(1);
    });

    // Aguarda estabilização — não deve ter chamadas adicionais
    await new Promise((r) => setTimeout(r, 100));
    expect(taxService.syncAppData).toHaveBeenCalledTimes(1);
  });

  it("exibe botão 'Configurar CPF' no alerta de CPF não configurado e chama onOpenProfileSettings ao clicar", async () => {
    const user = userEvent.setup();
    const onOpenProfileSettings = vi.fn();

    vi.mocked(profileService.getMe).mockResolvedValue({
      id: 1,
      name: "Test",
      email: "test@example.com",
      trialEndsAt: null,
      trialExpired: false,
      profile: {
        salaryMonthly: null,
        bankLimitTotal: null,
        payday: null,
        displayName: null,
        avatarUrl: null,
        taxpayerCpf: null, // sem CPF → warning TAXPAYER_CPF_NOT_CONFIGURED
      },
    });

    renderPage({ onOpenProfileSettings });

    await waitFor(() => {
      expect(screen.getByText("Configurar CPF")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Configurar CPF" }));
    expect(onOpenProfileSettings).toHaveBeenCalledOnce();
  });

  it("nao exibe botão 'Configurar CPF' quando CPF já está configurado", async () => {
    vi.mocked(profileService.getMe).mockResolvedValue({
      id: 1,
      name: "Test",
      email: "test@example.com",
      trialEndsAt: null,
      trialExpired: false,
      profile: {
        salaryMonthly: null,
        bankLimitTotal: null,
        payday: null,
        displayName: null,
        avatarUrl: null,
        taxpayerCpf: "123.456.789-09",
      },
    });

    renderPage({ onOpenProfileSettings: vi.fn() });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Central do Leão" })).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "Configurar CPF" })).not.toBeInTheDocument();
  });
});
