import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import UpgradeModal from "./UpgradeModal";

vi.mock("../utils/analytics", () => ({
  trackPaywallEvent: vi.fn(),
}));

describe("UpgradeModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mostra bloqueio de importação como limitação de plano, não erro técnico", () => {
    render(
      <MemoryRouter>
        <UpgradeModal
          isOpen
          reason="Importação de extratos é um recurso do Pro. No Pro, você importa CSV, OFX e PDF com prévia antes de confirmar."
          feature="csv_import"
          context="feature_gate"
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Importação disponível no Pro")).toBeInTheDocument();
    expect(
      screen.getByText(/Importação de extratos é um recurso do Pro/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Importar extratos (CSV, OFX e PDF)"),
    ).toBeInTheDocument();
  });
});
