import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TaxUploadModal from "./TaxUploadModal";
import type { TaxDocumentDetail } from "../services/tax.service";

const buildPreviewDocument = (overrides: Partial<TaxDocumentDetail> = {}): TaxDocumentDetail => ({
  id: 42,
  taxYear: 2026,
  originalFileName: "informe_banco_inter_2025.pdf",
  documentType: "income_report_bank",
  processingStatus: "normalized",
  sourceLabel: "Banco Inter",
  sourceHint: "",
  uploadedAt: "2026-03-01T10:00:00Z",
  mimeType: "application/pdf",
  byteSize: 120000,
  sha256: "abc123",
  latestExtraction: null,
  ...overrides,
});

describe("TaxUploadModal", () => {
  it("does not render when closed", () => {
    render(
      <TaxUploadModal
        isOpen={false}
        taxYear={2026}
        stage="idle"
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the tax upload modal shell scrollable inside the viewport", () => {
    render(
      <TaxUploadModal
        isOpen
        taxYear={2026}
        stage="idle"
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Enviar documento fiscal" })).toBeInTheDocument();
    expect(screen.getByTestId("tax-upload-modal-shell")).toHaveClass("flex", "flex-col", "overflow-hidden");
    expect(screen.getByTestId("tax-upload-modal-body")).toHaveClass("min-h-0", "overflow-y-auto");
  });

  it("shows human processing guidance while the document is being reviewed", () => {
    render(
      <TaxUploadModal
        isOpen
        taxYear={2026}
        stage="processing"
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Lendo o arquivo e preparando a revisão fiscal...",
    );
  });

  it("mostra fallback restritivo quando a matriz de suporte está indisponível", () => {
    render(
      <TaxUploadModal
        isOpen
        taxYear={2026}
        stage="idle"
        supportMatrix={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("Matriz de suporte indisponível")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Matriz de suporte indisponível no momento. Siga com revisão manual: documentos podem ser bloqueados para extração e execução automática nesta fatia.",
      ),
    ).toBeInTheDocument();
  });

  it("expõe matriz de suporte com estados suportado, restrito e não suportado", () => {
    render(
      <TaxUploadModal
        isOpen
        taxYear={2026}
        stage="idle"
        supportMatrixVersion="2026-04-03.aud-001"
        supportMatrix={[
          {
            documentType: "income_report_bank",
            sourceType: "income",
            supportLevel: "supported",
            supportsExtraction: true,
            allowsSuggestion: true,
            allowsExecution: true,
          },
          {
            documentType: "bank_statement_support",
            sourceType: "support",
            supportLevel: "restricted",
            supportsExtraction: false,
            allowsSuggestion: true,
            allowsExecution: false,
          },
          {
            documentType: "unknown",
            sourceType: "unknown",
            supportLevel: "not_supported",
            supportsExtraction: false,
            allowsSuggestion: false,
            allowsExecution: false,
          },
        ]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("Matriz real de suporte documental")).toBeInTheDocument();
    expect(screen.getByText("v2026-04-03.aud-001")).toBeInTheDocument();
    expect(screen.getByText("Suportado (1)")).toBeInTheDocument();
    expect(screen.getByText("Restrito (1)")).toBeInTheDocument();
    expect(screen.getByText("Não suportado (0)")).toBeInTheDocument();
  });

  // ─── Preview step ──────────────────────────────────────────────────────────

  it("renderiza o step de preview com nome do arquivo, tipo e contagem de fatos", () => {
    render(
      <TaxUploadModal
        isOpen
        taxYear={2026}
        stage="preview"
        previewDocument={buildPreviewDocument()}
        previewFactCount={3}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onConfirmPreview={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Documento processado" })).toBeInTheDocument();
    expect(screen.getByText("informe_banco_inter_2025.pdf")).toBeInTheDocument();
    expect(screen.getByText("Informe bancário")).toBeInTheDocument();
    expect(screen.getByText("Banco Inter")).toBeInTheDocument();
    expect(screen.getByText("Processado")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("3 fatos fiscais identificados");
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeInTheDocument();
  });

  it("renderiza aviso âmbar quando nenhum fato foi identificado", () => {
    render(
      <TaxUploadModal
        isOpen
        taxYear={2026}
        stage="preview"
        previewDocument={buildPreviewDocument({ processingStatus: "normalized" })}
        previewFactCount={0}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onConfirmPreview={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Nenhum fato identificado");
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeInTheDocument();
  });

  it("renderiza alerta de falha quando processingStatus é failed", () => {
    render(
      <TaxUploadModal
        isOpen
        taxYear={2026}
        stage="preview"
        previewDocument={buildPreviewDocument({ processingStatus: "failed" })}
        previewFactCount={0}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onConfirmPreview={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível processar o documento");
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeInTheDocument();
  });

  it("chama onConfirmPreview ao clicar em Confirmar", async () => {
    const user = userEvent.setup();
    const onConfirmPreview = vi.fn();

    render(
      <TaxUploadModal
        isOpen
        taxYear={2026}
        stage="preview"
        previewDocument={buildPreviewDocument()}
        previewFactCount={2}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onConfirmPreview={onConfirmPreview}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(onConfirmPreview).toHaveBeenCalledOnce();
  });

  it("renderiza texto singular corretamente quando há exatamente 1 fato", () => {
    render(
      <TaxUploadModal
        isOpen
        taxYear={2026}
        stage="preview"
        previewDocument={buildPreviewDocument()}
        previewFactCount={1}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onConfirmPreview={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("1 fato fiscal identificado");
  });
});
