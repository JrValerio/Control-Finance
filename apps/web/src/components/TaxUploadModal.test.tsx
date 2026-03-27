import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import TaxUploadModal from "./TaxUploadModal";

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
});
