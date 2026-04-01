import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import BillsPage from "./BillsPage";
import { billsService, type Bill, type BillsSummary } from "../services/bills.service";
import { categoriesService } from "../services/categories.service";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../services/bills.service", () => ({
  billsService: {
    getSummary: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    createBatch: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    markPaid: vi.fn(),
  },
}));

vi.mock("../services/categories.service", () => ({
  categoriesService: {
    listCategories: vi.fn(),
  },
}));

// ─── Builders ─────────────────────────────────────────────────────────────────

const buildBill = (overrides: Partial<Bill> = {}): Bill => ({
  id: 1,
  userId: 1,
  title: "Conta de Agua",
  amount: 132.9,
  dueDate: "2026-03-25",
  status: "pending",
  isOverdue: false,
  operationalBucket: "future",
  daysUntilDue: 20,
  categoryId: null,
  paidAt: null,
  notes: null,
  provider: null,
  referenceMonth: null,
  billType: null,
  sourceImportSessionId: null,
  matchStatus: "unmatched",
  linkedTransactionId: null,
  createdAt: "2026-02-01T12:00:00.000Z",
  updatedAt: "2026-02-01T12:00:00.000Z",
  ...overrides,
});

const buildSummary = (overrides: Partial<BillsSummary> = {}): BillsSummary => ({
  pendingCount: 2,
  pendingTotal: 265.8,
  overdueCount: 1,
  overdueTotal: 132.9,
  ...overrides,
});

const buildListResult = (items: Bill[] = [buildBill()]) => ({
  items,
  pagination: { limit: 20, offset: 0, total: items.length },
});

// ─── Render helper ────────────────────────────────────────────────────────────

const renderPage = (initialEntries: string[] = ["/app/bills"]) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <BillsPage onBack={vi.fn()} onLogout={vi.fn()} />
    </MemoryRouter>,
  );

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("BillsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(billsService.getSummary).mockResolvedValue(buildSummary());
    vi.mocked(billsService.list).mockResolvedValue(buildListResult());
    vi.mocked(categoriesService.listCategories).mockResolvedValue([]);
  });

  it("renderiza cards de resumo com valores do mock", async () => {
    renderPage();

    await waitFor(() => {
      // Use regex to avoid locale-specific currency formatting in Node.js
      expect(screen.getByText(/265[,.]80/)).toBeInTheDocument();
    });

    expect(screen.getAllByText(/132[,.]90/).length).toBeGreaterThan(0);
    expect(screen.getByText("2 contas em aberto")).toBeInTheDocument();
    expect(screen.getByText("1 conta em atraso")).toBeInTheDocument();
  });

  it("renderiza lista de bills com titulo e valor", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Conta de Agua")).toBeInTheDocument();
    });

    // The amount 132.90 appears in both the summary overdue card and the list item
    expect(screen.getAllByText(/132[,.]90/).length).toBeGreaterThan(0);
  });

  it("exibe badge Vencida para bill com isOverdue true", async () => {
    vi.mocked(billsService.list).mockResolvedValue(
      buildListResult([buildBill({ isOverdue: true, operationalBucket: "overdue", daysUntilDue: -1 })]),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Vencida")).toBeInTheDocument();
    });
  });

  it("exibe badge Paga para bill com status paid", async () => {
    vi.mocked(billsService.list).mockResolvedValue(
      buildListResult([
        buildBill({
          status: "paid",
          paidAt: "2026-02-15T10:00:00.000Z",
          operationalBucket: "paid",
          daysUntilDue: null,
        }),
      ]),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Paga")).toBeInTheDocument();
    });
  });

  it("fatura de cartão não mostra editar nem excluir", async () => {
    vi.mocked(billsService.list).mockResolvedValue(
      buildListResult([
        buildBill({
          title: "Fatura Nubank 2026-03",
          billType: "credit_card_invoice",
          provider: "Nubank",
        }),
      ]),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Fatura do cartão")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar pagamento" })).toBeInTheDocument();
  });

  it("clicar filtro Pendentes chama list com status pending", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Conta de Agua")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Pendentes" }));

    await waitFor(() => {
      expect(billsService.list).toHaveBeenCalledWith(
        expect.objectContaining({ status: "pending", offset: 0 }),
      );
    });
  });

  it("clicar filtro Vencidas chama list com status overdue", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Conta de Agua")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Vencidas" }));

    await waitFor(() => {
      expect(billsService.list).toHaveBeenCalledWith(
        expect.objectContaining({ status: "overdue" }),
      );
    });
  });

  it("exibe badge A vencer para bill com bucket due_soon", async () => {
    vi.mocked(billsService.list).mockResolvedValue(
      buildListResult([buildBill({ operationalBucket: "due_soon", daysUntilDue: 3 })]),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("A vencer")).toBeInTheDocument();
    });
  });

  it("clicar filtro A vencer chama list com status due_soon", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Conta de Agua")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "A vencer" }));

    await waitFor(() => {
      expect(billsService.list).toHaveBeenCalledWith(
        expect.objectContaining({ status: "due_soon" }),
      );
    });
  });

  it("aplica filtro inicial quando URL traz status=due_soon", async () => {
    renderPage(["/app/bills?status=due_soon"]);

    await waitFor(() => {
      expect(billsService.list).toHaveBeenCalledWith(
        expect.objectContaining({ status: "due_soon", offset: 0 }),
      );
    });
  });

  it("marcar como paga chama markPaid e exibe mensagem de sucesso", async () => {
    const user = userEvent.setup();
    vi.mocked(billsService.markPaid).mockResolvedValue({
      bill: buildBill({ status: "paid" }),
      transaction: { id: 99, type: "Saida", value: 132.9, date: "2026-02-15", description: "Conta de Agua" },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Conta de Agua")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Registrar pagamento" }));

    await waitFor(() => {
      expect(billsService.markPaid).toHaveBeenCalledWith(1);
    });

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });

  it("excluir bill com confirmacao chama remove e refetch", async () => {
    const user = userEvent.setup();
    vi.mocked(billsService.remove).mockResolvedValue(undefined);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Conta de Agua")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Excluir" }));
    expect(screen.getByText("Confirmar?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sim" }));

    await waitFor(() => {
      expect(billsService.remove).toHaveBeenCalledWith(1);
    });
  });

  it("erro de carregamento exibe mensagem de erro", async () => {
    vi.mocked(billsService.getSummary).mockRejectedValue(new Error("Falha de rede"));

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("lista vazia exibe mensagem de estado vazio", async () => {
    vi.mocked(billsService.list).mockResolvedValue(buildListResult([]));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Nenhuma conta encontrada para este filtro.")).toBeInTheDocument();
    });
  });

  it("botao Próxima chama list com offset 20", async () => {
    const user = userEvent.setup();
    // Return full page (20 items) to enable "Próxima"
    const fullPage = Array.from({ length: 20 }, (_, i) =>
      buildBill({ id: i + 1, title: `Bill ${i + 1}` }),
    );
    vi.mocked(billsService.list).mockResolvedValue({
      items: fullPage,
      pagination: { limit: 20, offset: 0, total: 25 },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Bill 1")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Próxima" }));

    await waitFor(() => {
      expect(billsService.list).toHaveBeenCalledWith(
        expect.objectContaining({ offset: 20 }),
      );
    });
  });

  // ─── Parcelamento ─────────────────────────────────────────────────────────────

  it("parcelamento cria N bills via createBatch com titulos corretos", async () => {
    const user = userEvent.setup();
    vi.mocked(billsService.createBatch).mockResolvedValue([
      buildBill({ id: 10, title: "IPTU (1/3)" }),
      buildBill({ id: 11, title: "IPTU (2/3)" }),
      buildBill({ id: 12, title: "IPTU (3/3)" }),
    ]);

    renderPage();
    await waitFor(() => expect(screen.getByText("Conta de Agua")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Nova pendência/ }));
    await user.type(screen.getByLabelText(/Título/), "IPTU");
    await user.type(screen.getByLabelText(/Valor/), "500");
    await user.click(screen.getByRole("checkbox", { name: /Parcelar/ }));

    const countInput = screen.getByRole("spinbutton", { name: /parcelas/i });
    await user.clear(countInput);
    await user.type(countInput, "3");

    await user.click(screen.getByRole("button", { name: "Gerar 3 parcelas" }));

    await waitFor(() => {
      expect(billsService.createBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ title: "IPTU (1/3)" }),
          expect.objectContaining({ title: "IPTU (2/3)" }),
          expect.objectContaining({ title: "IPTU (3/3)" }),
        ]),
      );
    });
  });

  it("erro no createBatch exibe mensagem de erro no modal", async () => {
    const user = userEvent.setup();
    vi.mocked(billsService.createBatch).mockRejectedValue(
      new Error("Falha ao criar parcelas."),
    );

    renderPage();
    await waitFor(() => expect(screen.getByText("Conta de Agua")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Nova pendência/ }));
    await user.type(screen.getByLabelText(/Título/), "IPTU");
    await user.type(screen.getByLabelText(/Valor/), "500");
    await user.click(screen.getByRole("checkbox", { name: /Parcelar/ }));
    await user.click(screen.getByRole("button", { name: "Gerar 2 parcelas" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });
});
