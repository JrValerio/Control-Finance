import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CreditCardsSummaryWidget from "./CreditCardsSummaryWidget";
import { creditCardsService, type CreditCardItem } from "../services/credit-cards.service";

vi.mock("../services/credit-cards.service", () => ({
  creditCardsService: {
    list: vi.fn(),
  },
}));

const buildCard = (overrides: Partial<CreditCardItem> = {}): CreditCardItem => ({
  id: 1,
  userId: 1,
  name: "Nubank",
  limitTotal: 3000,
  closingDay: 10,
  dueDay: 17,
  isActive: true,
  createdAt: "2026-03-27T00:00:00.000Z",
  updatedAt: "2026-03-27T00:00:00.000Z",
  usage: {
    total: 3000,
    used: 1480,
    available: 1520,
    exceededBy: 0,
    usagePct: 49.33,
    status: "using",
  },
  openPurchasesCount: 3,
  openPurchasesTotal: 480,
  pendingInvoicesCount: 1,
  pendingInvoicesTotal: 1000,
  openPurchases: [],
  invoices: [],
  ...overrides,
});

const renderWidget = (onOpenCreditCards?: () => void) =>
  render(<CreditCardsSummaryWidget onOpenCreditCards={onOpenCreditCards} />);

describe("CreditCardsSummaryWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(creditCardsService.list).mockResolvedValue({
      items: [buildCard()],
    });
  });

  it("renderiza loading enquanto busca os cartões", () => {
    vi.mocked(creditCardsService.list).mockReturnValue(new Promise(() => {}));
    renderWidget();
    expect(screen.getByText("Carregando cartões...")).toBeInTheDocument();
  });

  it("agrega limite disponível, compras abertas e faturas pendentes", async () => {
    vi.mocked(creditCardsService.list).mockResolvedValue({
      items: [
        buildCard(),
        buildCard({
          id: 2,
          name: "Inter",
          usage: {
            total: 2000,
            used: 700,
            available: 1300,
            exceededBy: 0,
            usagePct: 35,
            status: "using",
          },
          openPurchasesTotal: 200,
          pendingInvoicesCount: 2,
          pendingInvoicesTotal: 900,
        }),
      ],
    });

    renderWidget();

    await waitFor(() => {
      expect(screen.getByText("2 cartões ativos")).toBeInTheDocument();
    });

    expect(screen.getByText(/2\.820,00|2820,00/)).toBeInTheDocument();
    expect(screen.getByText(/680,00|680,00/)).toBeInTheDocument();
    expect(screen.getByText(/1\.900,00|1900,00/)).toBeInTheDocument();
    expect(screen.getByText("3 faturas")).toBeInTheDocument();
    expect(screen.getByText("Limite em uso")).toBeInTheDocument();
    expect(screen.getByText("Em uso")).toBeInTheDocument();
    expect(screen.getByText("43.60% do limite total")).toBeInTheDocument();
  });

  it("mostra estado vazio amigável quando não há cartão cadastrado", async () => {
    vi.mocked(creditCardsService.list).mockResolvedValue({ items: [] });

    renderWidget();

    await waitFor(() => {
      expect(screen.getByText("Nenhum cartão cadastrado ainda.")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Cadastre um cartão para acompanhar limite disponível/i),
    ).toBeInTheDocument();
  });

  it("mostra mensagem honesta quando o resumo de cartões falha", async () => {
    vi.mocked(creditCardsService.list).mockRejectedValue(new Error("network"));

    renderWidget();

    await waitFor(() => {
      expect(
        screen.getByText("Não foi possível carregar o resumo de cartões agora."),
      ).toBeInTheDocument();
    });
  });

  it("abre a área de cartões quando o CTA é clicado", async () => {
    const user = userEvent.setup();
    const onOpenCreditCards = vi.fn();
    renderWidget(onOpenCreditCards);

    await waitFor(() => {
      expect(screen.getByText("Ver cartões →")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Ver cartões →"));
    expect(onOpenCreditCards).toHaveBeenCalledOnce();
  });
});
