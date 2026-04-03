import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import OperationalWidgetsSection from "./OperationalWidgetsSection";

vi.mock("./OperationalSummaryPanel", () => ({
  default: ({ onOpenDueSoonBills }: { onOpenDueSoonBills: () => void }) => (
    <button type="button" onClick={onOpenDueSoonBills}>
      Abrir contas vencendo
    </button>
  ),
}));

vi.mock("./ForecastCard", () => ({
  default: ({ onOpenProfileSettings }: { onOpenProfileSettings: () => void }) => (
    <button type="button" onClick={onOpenProfileSettings}>
      Abrir configuracoes de perfil
    </button>
  ),
}));

vi.mock("./BillsSummaryWidget", () => ({
  default: ({ onOpenBills }: { onOpenBills: () => void }) => (
    <button type="button" onClick={onOpenBills}>
      Abrir contas
    </button>
  ),
}));

vi.mock("./CreditCardsSummaryWidget", () => ({
  default: ({ onOpenCreditCards }: { onOpenCreditCards: () => void }) => (
    <button type="button" onClick={onOpenCreditCards}>
      Abrir cartoes
    </button>
  ),
}));

vi.mock("./ConsignadoOverviewWidget", () => ({
  default: ({ onOpenIncomeSources }: { onOpenIncomeSources: () => void }) => (
    <button type="button" onClick={onOpenIncomeSources}>
      Abrir fontes de renda
    </button>
  ),
}));

vi.mock("./BankAccountsWidget", () => ({
  default: () => <div>Widget contas bancarias</div>,
}));

vi.mock("./UtilityBillsWidget", () => ({
  default: () => <div>Widget contas de consumo</div>,
}));

vi.mock("./SalaryWidget", () => ({
  default: () => <div>Widget salario</div>,
}));

const buildProps = () => ({
  onOpenDueSoonBills: vi.fn(),
  onOpenProfileSettings: vi.fn(),
  onOpenBills: vi.fn(),
  onOpenCreditCards: vi.fn(),
  onOpenIncomeSources: vi.fn(),
});

describe("OperationalWidgetsSection", () => {
  it("renderiza as secoes operacionais", () => {
    render(<OperationalWidgetsSection {...buildProps()} />);

    expect(screen.getByText("Painel operacional")).toBeInTheDocument();
    expect(screen.getByText("Cards críticos")).toBeInTheDocument();
    expect(screen.getByText("Renda e estrutura")).toBeInTheDocument();
  });

  it("propaga callbacks de abertura dos widgets", () => {
    const props = buildProps();
    render(<OperationalWidgetsSection {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Abrir contas vencendo" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir configuracoes de perfil" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir contas" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir cartoes" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir fontes de renda" }));

    expect(props.onOpenDueSoonBills).toHaveBeenCalledTimes(1);
    expect(props.onOpenProfileSettings).toHaveBeenCalledTimes(1);
    expect(props.onOpenBills).toHaveBeenCalledTimes(1);
    expect(props.onOpenCreditCards).toHaveBeenCalledTimes(1);
    expect(props.onOpenIncomeSources).toHaveBeenCalledTimes(1);
  });
});
