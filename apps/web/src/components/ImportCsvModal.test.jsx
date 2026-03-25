import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImportCsvModal from "./ImportCsvModal";
import { transactionsService } from "../services/transactions.service";
import { categoriesService } from "../services/categories.service";
import { incomeSourcesService } from "../services/incomeSources.service";

vi.mock("../services/transactions.service", () => ({
  transactionsService: {
    dryRunImportCsv: vi.fn(),
    commitImportCsv: vi.fn(),
    deleteImportSession: vi.fn(),
  },
}));

vi.mock("../services/categories.service", () => ({
  categoriesService: {
    listCategories: vi.fn(),
    createCategory: vi.fn(),
  },
}));

vi.mock("../services/incomeSources.service", () => ({
  incomeSourcesService: {
    list: vi.fn(),
    createStatement: vi.fn(),
  },
}));

const buildDryRunResponse = (overrides = {}) => ({
  importId: "import-session-1",
  expiresAt: "2026-02-21T23:59:59Z",
  summary: {
    totalRows: 2,
    validRows: 1,
    invalidRows: 1,
    income: 100,
    expense: 20,
  },
  rows: [
    {
      line: 2,
      status: "valid",
      raw: {
        date: "2026-02-21",
        type: "Entrada",
        value: "100",
        description: "Salario",
        notes: "",
        category: "Trabalho",
      },
      normalized: {
        date: "2026-02-21",
        type: "Entrada",
        value: 100,
        description: "Salario",
        notes: "",
        categoryId: 1,
      },
      errors: [],
    },
  ],
  ...overrides,
});

describe("ImportCsvModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    categoriesService.listCategories.mockResolvedValue([]);
    incomeSourcesService.list.mockResolvedValue([]);
  });

  it("does not render when isOpen is false", () => {
    render(<ImportCsvModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows validation message when preview is requested without file", async () => {
    render(<ImportCsvModal isOpen onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

    expect(screen.getByText("Selecione um arquivo CSV, OFX ou PDF.")).toBeInTheDocument();
    expect(transactionsService.dryRunImportCsv).not.toHaveBeenCalled();
  });

  it("runs dry-run and renders summary", async () => {
    const file = new File(["date,type,value"], "import.csv", { type: "text/csv" });
    transactionsService.dryRunImportCsv.mockResolvedValueOnce(buildDryRunResponse());

    render(<ImportCsvModal isOpen onClose={vi.fn()} />);

    await userEvent.upload(screen.getByLabelText("Arquivo do extrato"), file);
    await userEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

    await waitFor(() => {
      expect(transactionsService.dryRunImportCsv).toHaveBeenCalledWith(file);
    });

    const validRowsCard = screen.getByText("Válidas").closest("div");
    const invalidRowsCard = screen.getByText("Inválidas").closest("div");

    expect(validRowsCard).toHaveTextContent("1");
    expect(invalidRowsCard).toHaveTextContent("1");
  });

  it("commits import and calls onImported callback when Fechar is clicked", async () => {
    const onImported = vi.fn();
    const file = new File(["date,type,value"], "import.csv", { type: "text/csv" });

    transactionsService.dryRunImportCsv.mockResolvedValueOnce(buildDryRunResponse());
    transactionsService.commitImportCsv.mockResolvedValueOnce({
      imported: 1,
      importSessionId: "import-session-1",
      summary: { income: 100, expense: 20, balance: 80 },
    });

    render(<ImportCsvModal isOpen onClose={vi.fn()} onImported={onImported} />);

    await userEvent.upload(screen.getByLabelText("Arquivo do extrato"), file);
    await userEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Importar" })).not.toBeDisabled();
    });

    await userEvent.click(screen.getByRole("button", { name: "Importar" }));

    // After commit, modal shows success state with count
    await waitFor(() => {
      expect(screen.getByText("1 lançamento importado.")).toBeInTheDocument();
    });

    // onImported not yet called — deferred until user clicks Fechar
    expect(onImported).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Fechar" }));

    await waitFor(() => {
      expect(onImported).toHaveBeenCalled();
    });
  });

  it("exibe badge Revisar para linha valida sem categoria", async () => {
    const file = new File(["date,type,value"], "import.csv", { type: "text/csv" });
    transactionsService.dryRunImportCsv.mockResolvedValueOnce(
      buildDryRunResponse({
        rows: [
          {
            line: 2,
            status: "valid",
            raw: {
              date: "2026-02-21",
              type: "Entrada",
              value: "100",
              description: "PIX SEM CATEGORIA",
              notes: "",
              category: "",
            },
            normalized: {
              date: "2026-02-21",
              type: "Entrada",
              value: 100,
              description: "PIX SEM CATEGORIA",
              notes: "",
              categoryId: null,
            },
            errors: [],
          },
        ],
      }),
    );

    render(<ImportCsvModal isOpen onClose={vi.fn()} />);
    await userEvent.upload(screen.getByLabelText("Arquivo do extrato"), file);
    await userEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

    await waitFor(() => {
      expect(screen.getByText("Revisar")).toBeInTheDocument();
    });
  });

  it("nao exibe badge Revisar quando linha valida ja tem categoria", async () => {
    const file = new File(["date,type,value"], "import.csv", { type: "text/csv" });
    categoriesService.listCategories.mockResolvedValueOnce([{ id: 1, name: "Trabalho", normalizedName: "trabalho" }]);
    transactionsService.dryRunImportCsv.mockResolvedValueOnce(buildDryRunResponse());

    render(<ImportCsvModal isOpen onClose={vi.fn()} />);
    await userEvent.upload(screen.getByLabelText("Arquivo do extrato"), file);
    await userEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

    await waitFor(() => {
      expect(screen.getByText("Trabalho")).toBeInTheDocument();
    });

    expect(screen.queryByText("Revisar")).not.toBeInTheDocument();
  });

  it("shows expired session message on commit error", async () => {
    const file = new File(["date,type,value"], "import.csv", { type: "text/csv" });

    transactionsService.dryRunImportCsv.mockResolvedValueOnce(buildDryRunResponse());
    transactionsService.commitImportCsv.mockRejectedValueOnce({
      response: { data: { message: "Sessão de importação expirada." } },
    });

    render(<ImportCsvModal isOpen onClose={vi.fn()} />);

    await userEvent.upload(screen.getByLabelText("Arquivo do extrato"), file);
    await userEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Importar" })).not.toBeDisabled();
    });

    await userEvent.click(screen.getByRole("button", { name: "Importar" }));

    await waitFor(() => {
      expect(
        screen.getByText("Sessão de importação expirada. Rode a pré-visualização novamente."),
      ).toBeInTheDocument();
    });
  });

  describe("income statement bridge", () => {
    const buildInssResponse = () =>
      buildDryRunResponse({
        documentType: "income_statement_inss",
        summary: { totalRows: 0, validRows: 0, invalidRows: 0, income: 0, expense: 0 },
        rows: [],
        suggestion: {
          type: "profile",
          referenceMonth: "2026-02",
          netAmount: 1412.0,
          paymentDate: "2026-02-25",
          grossAmount: 1800.0,
          benefitKind: "Aposentadoria",
        },
      });

    it("exibe botao Registrar no historico de renda para suggestion type=profile", async () => {
      const file = new File(["dummy"], "inss.pdf", { type: "application/pdf" });
      transactionsService.dryRunImportCsv.mockResolvedValueOnce(buildInssResponse());

      render(<ImportCsvModal isOpen onClose={vi.fn()} />);
      await userEvent.upload(screen.getByLabelText("Arquivo do extrato"), file);
      await userEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Registrar no histórico de renda" }),
        ).toBeInTheDocument();
      });
    });

    it("abre IncomeStatementQuickModal ao clicar no botao", async () => {
      const file = new File(["dummy"], "inss.pdf", { type: "application/pdf" });
      transactionsService.dryRunImportCsv.mockResolvedValueOnce(buildInssResponse());
      incomeSourcesService.list.mockResolvedValue([
        { id: 1, name: "INSS Benefício", deductions: [], userId: 1, categoryId: null, defaultDay: null, notes: null, createdAt: "", updatedAt: "" },
      ]);

      render(<ImportCsvModal isOpen onClose={vi.fn()} />);
      await userEvent.upload(screen.getByLabelText("Arquivo do extrato"), file);
      await userEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Registrar no histórico de renda" }),
        ).toBeInTheDocument();
      });

      await userEvent.click(
        screen.getByRole("button", { name: "Registrar no histórico de renda" }),
      );

      await waitFor(() => {
        expect(
          screen.getByRole("dialog", { name: /Registrar no histórico de renda/i }),
        ).toBeInTheDocument();
      });
    });
  });

  describe("batch category", () => {
    const buildMultiRowResponse = () =>
      buildDryRunResponse({
        summary: { totalRows: 2, validRows: 2, invalidRows: 0, income: 200, expense: 0 },
        rows: [
          {
            line: 2,
            status: "valid",
            raw: { date: "2026-02-21", type: "Entrada", value: "100", description: "PIX A", notes: "", category: "" },
            normalized: { date: "2026-02-21", type: "Entrada", value: 100, description: "PIX A", notes: "", categoryId: null },
            errors: [],
          },
          {
            line: 3,
            status: "valid",
            raw: { date: "2026-02-22", type: "Entrada", value: "100", description: "PIX B", notes: "", category: "" },
            normalized: { date: "2026-02-22", type: "Entrada", value: 100, description: "PIX B", notes: "", categoryId: null },
            errors: [],
          },
        ],
      });

    it("selecionar todas exibe toolbar de categoria em lote", async () => {
      const file = new File(["date,type,value"], "import.csv", { type: "text/csv" });
      transactionsService.dryRunImportCsv.mockResolvedValueOnce(buildMultiRowResponse());
      categoriesService.listCategories.mockResolvedValue([{ id: 5, name: "Salário" }]);

      render(<ImportCsvModal isOpen onClose={vi.fn()} />);
      await userEvent.upload(screen.getByLabelText("Arquivo do extrato"), file);
      await userEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

      await waitFor(() => {
        expect(screen.getByRole("checkbox", { name: /selecionar todas as linhas válidas/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("checkbox", { name: /selecionar todas as linhas válidas/i }));

      expect(screen.getByText(/2 linhas selecionadas/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /aplicar categoria/i })).toBeInTheDocument();
    });

    it("aplicar categoria em lote preenche overrides nas linhas selecionadas", async () => {
      const file = new File(["date,type,value"], "import.csv", { type: "text/csv" });
      transactionsService.dryRunImportCsv.mockResolvedValueOnce(buildMultiRowResponse());
      categoriesService.listCategories.mockResolvedValue([{ id: 5, name: "Salário" }]);

      render(<ImportCsvModal isOpen onClose={vi.fn()} />);
      await userEvent.upload(screen.getByLabelText("Arquivo do extrato"), file);
      await userEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

      await waitFor(() => {
        expect(screen.getByRole("checkbox", { name: /selecionar todas as linhas válidas/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("checkbox", { name: /selecionar todas as linhas válidas/i }));
      await userEvent.selectOptions(screen.getByRole("combobox", { name: /categoria para aplicar em lote/i }), "5");
      await userEvent.click(screen.getByRole("button", { name: /aplicar categoria/i }));

      // toolbar disappears after apply (selection cleared)
      expect(screen.queryByText(/linhas selecionadas/i)).not.toBeInTheDocument();

      // both row selects now show Salário
      const rowSelects = screen.getAllByRole("combobox", { name: /categoria da linha/i });
      expect(rowSelects).toHaveLength(2);
      rowSelects.forEach((sel) => expect(sel).toHaveValue("5"));
    });
  });
});
