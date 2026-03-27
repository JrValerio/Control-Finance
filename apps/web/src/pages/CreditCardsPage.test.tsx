import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import CreditCardsPage from "./CreditCardsPage";
import {
  creditCardsService,
  type CreditCardItem,
  type CreditCardPurchase,
  type CreditCardInvoice,
} from "../services/credit-cards.service";
import { billsService } from "../services/bills.service";

vi.mock("../services/credit-cards.service", () => ({
  creditCardsService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    createPurchase: vi.fn(),
    createInstallments: vi.fn(),
    removePurchase: vi.fn(),
    closeInvoice: vi.fn(),
  },
}));

vi.mock("../services/bills.service", () => ({
  billsService: {
    markPaid: vi.fn(),
  },
}));

const buildOpenPurchase = (): CreditCardPurchase => ({
  id: 11,
  userId: 1,
  creditCardId: 1,
  billId: null,
  title: "Mercado",
  amount: 180,
  purchaseDate: "2026-03-15",
  status: "open",
  statementMonth: null,
  installmentGroupId: null,
  installmentNumber: null,
  installmentCount: null,
  notes: null,
  createdAt: "2026-03-15T10:00:00.000Z",
  updatedAt: "2026-03-15T10:00:00.000Z",
});

const buildInvoice = (): CreditCardInvoice => ({
  id: 91,
  title: "Fatura Nubank 2026-03",
  amount: 300,
  dueDate: "2026-03-20",
  status: "pending",
  paidAt: null,
  referenceMonth: "2026-03",
  isOverdue: false,
});

const buildCard = (overrides: Partial<CreditCardItem> = {}): CreditCardItem => ({
  id: 1,
  userId: 1,
  name: "Nubank",
  limitTotal: 2000,
  closingDay: 10,
  dueDay: 20,
  isActive: true,
  createdAt: "2026-03-26T10:00:00.000Z",
  updatedAt: "2026-03-26T10:00:00.000Z",
  usage: {
    total: 2000,
    used: 480,
    available: 1520,
    exceededBy: 0,
    usagePct: 24,
    status: "using" as const,
  },
  openPurchasesCount: 1,
  openPurchasesTotal: 180,
  pendingInvoicesCount: 1,
  pendingInvoicesTotal: 300,
  openPurchases: [buildOpenPurchase()],
  invoices: [buildInvoice()],
  ...overrides,
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <CreditCardsPage onBack={vi.fn()} />
    </MemoryRouter>,
  );

describe("CreditCardsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(creditCardsService.list).mockResolvedValue({ items: [buildCard()] });
    vi.mocked(creditCardsService.create).mockResolvedValue(buildCard());
    vi.mocked(creditCardsService.update).mockResolvedValue(buildCard());
    vi.mocked(creditCardsService.createPurchase).mockResolvedValue(buildOpenPurchase());
    vi.mocked(creditCardsService.createInstallments).mockResolvedValue({
      purchases: [
        {
          ...buildOpenPurchase(),
          id: 21,
          amount: 60,
          purchaseDate: "2026-03-15",
          installmentGroupId: "grp_1",
          installmentNumber: 1,
          installmentCount: 3,
        },
        {
          ...buildOpenPurchase(),
          id: 22,
          amount: 60,
          purchaseDate: "2026-04-15",
          installmentGroupId: "grp_1",
          installmentNumber: 2,
          installmentCount: 3,
        },
        {
          ...buildOpenPurchase(),
          id: 23,
          amount: 60,
          purchaseDate: "2026-05-15",
          installmentGroupId: "grp_1",
          installmentNumber: 3,
          installmentCount: 3,
        },
      ],
      installmentCount: 3,
      totalAmount: 180,
    });
    vi.mocked(creditCardsService.removePurchase).mockResolvedValue(undefined);
    vi.mocked(creditCardsService.closeInvoice).mockResolvedValue({
      invoice: buildInvoice(),
      purchasesCount: 1,
      total: 180,
    });
    vi.mocked(billsService.markPaid).mockResolvedValue({
      bill: {} as never,
      transaction: {
        id: 1,
        type: "Saida",
        value: 300,
        date: "2026-03-20",
        description: "Fatura Nubank 2026-03",
      },
    });
  });

  it("renderiza uso do cartão, compras abertas e fatura pendente", async () => {
    renderPage();

    expect(await screen.findByText("Nubank")).toBeInTheDocument();
    expect(screen.getByText("Mercado")).toBeInTheDocument();
    expect(screen.getByText("Fatura Nubank 2026-03")).toBeInTheDocument();
    expect(screen.getByText("24.00% do limite")).toBeInTheDocument();
  });

  it("cria cartão novo pelo modal", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Nubank");
    await user.click(screen.getByRole("button", { name: "+ Novo cartão" }));
    await user.clear(screen.getByLabelText("Nome do cartão"));
    await user.type(screen.getByLabelText("Nome do cartão"), "Inter");
    await user.clear(screen.getByLabelText("Limite total"));
    await user.type(screen.getByLabelText("Limite total"), "1500");
    await user.clear(screen.getByLabelText("Fechamento"));
    await user.type(screen.getByLabelText("Fechamento"), "12");
    await user.clear(screen.getByLabelText("Vencimento"));
    await user.type(screen.getByLabelText("Vencimento"), "22");
    await user.click(screen.getByRole("button", { name: "Criar cartão" }));

    await waitFor(() => {
      expect(creditCardsService.create).toHaveBeenCalledWith({
        name: "Inter",
        limitTotal: 1500,
        closingDay: 12,
        dueDay: 22,
      });
    });
  }, 10000);

  it("adiciona compra aberta no cartão", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Nubank");
    await user.click(screen.getByRole("button", { name: "Nova compra" }));
    await user.type(screen.getByLabelText("Descrição"), "Farmácia");
    await user.type(screen.getByLabelText("Valor"), "89,90");
    await user.click(screen.getByRole("button", { name: "Adicionar compra" }));

    await waitFor(() => {
      expect(creditCardsService.createPurchase).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          title: "Farmácia",
          amount: 89.9,
        }),
      );
    });
  });

  it("adiciona compra parcelada no cartão", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Nubank");
    await user.click(screen.getByRole("button", { name: "Nova compra" }));
    await user.type(screen.getByLabelText("Descrição"), "Curso");
    await user.type(screen.getByLabelText("Valor"), "180,00");
    await user.click(screen.getByLabelText("Parcelar esta compra"));
    const countInput = screen.getByRole("spinbutton", { name: "Parcelas" });
    await user.clear(countInput);
    await user.type(countInput, "3");
    await user.click(screen.getByRole("button", { name: "Adicionar em 3x" }));

    await waitFor(() => {
      expect(creditCardsService.createInstallments).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          title: "Curso",
          amount: 180,
          installmentCount: 3,
        }),
      );
    });
  }, 10000);

  it("fecha e paga a fatura pelo fluxo da tela", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Nubank");
    await user.click(screen.getByRole("button", { name: "Fechar fatura" }));

    await waitFor(() => {
      expect(creditCardsService.closeInvoice).toHaveBeenCalledWith(1);
    });

    await user.click(screen.getByRole("button", { name: "Pagar fatura" }));

    await waitFor(() => {
      expect(billsService.markPaid).toHaveBeenCalledWith(91);
    });
  });
});
