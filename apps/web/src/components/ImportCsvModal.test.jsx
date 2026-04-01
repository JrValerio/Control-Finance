import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImportCsvModal from "./ImportCsvModal";
import { transactionsService } from "../services/transactions.service";
import { categoriesService } from "../services/categories.service";
import { incomeSourcesService } from "../services/incomeSources.service";
import { profileService } from "../services/profile.service";
import { salaryService } from "../services/salary.service";
import { forecastService } from "../services/forecast.service";

vi.mock("../services/transactions.service", () => ({
  transactionsService: {
    dryRunImportCsv: vi.fn(),
    commitImportCsv: vi.fn(),
    deleteImportSession: vi.fn(),
    listImportCategoryRules: vi.fn(),
    createImportCategoryRule: vi.fn(),
    deleteImportCategoryRule: vi.fn(),
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
    listStatements: vi.fn(),
    createStatement: vi.fn(),
    linkTransaction: vi.fn(),
    postStatement: vi.fn(),
  },
}));

vi.mock("../services/profile.service", () => ({
  profileService: {
    updateProfile: vi.fn(),
  },
}));

vi.mock("../services/salary.service", () => ({
  salaryService: {
    syncImportedBenefitProfile: vi.fn(),
  },
}));

vi.mock("../services/forecast.service", () => ({
  forecastService: {
    recompute: vi.fn(),
  },
}));

const buildDryRunResponse = (overrides = {}) => ({
  importId: "import-session-1",
  expiresAt: "2026-02-21T23:59:59Z",
  summary: {
    totalRows: 2,
    validRows: 1,
    invalidRows: 1,
    duplicateRows: 0,
    conflictRows: 0,
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
    transactionsService.listImportCategoryRules.mockResolvedValue([]);
    incomeSourcesService.list.mockResolvedValue([]);
    incomeSourcesService.listStatements.mockResolvedValue([]);
    incomeSourcesService.postStatement.mockResolvedValue({
      statement: {
        id: 11,
        incomeSourceId: 1,
        referenceMonth: "2026-02",
        netAmount: 1412,
        totalDeductions: 0,
        grossAmount: 1800,
        details: null,
        paymentDate: "2026-02-25",
        status: "posted",
        postedTransactionId: 91,
        createdAt: "2026-02-25T00:00:00Z",
        updatedAt: "2026-02-25T00:00:00Z",
      },
      transaction: {
        id: 91,
        type: "Entrada",
        value: 1412,
        date: "2026-02-25",
        description: "INSS Beneficio - 2026-02",
        categoryId: null,
      },
    });
    profileService.updateProfile.mockResolvedValue({});
    salaryService.syncImportedBenefitProfile.mockResolvedValue({});
    forecastService.recompute.mockResolvedValue({});
  });

  it("does not render when isOpen is false", () => {
    render(<ImportCsvModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the import modal shell scrollable inside the viewport", async () => {
    render(<ImportCsvModal isOpen onClose={vi.fn()} />);

    await waitFor(() => {
      expect(categoriesService.listCategories).toHaveBeenCalled();
    });

    expect(screen.getByTestId("import-csv-modal-shell")).toHaveClass("flex", "flex-col", "overflow-hidden");
    expect(screen.getByTestId("import-csv-modal-body")).toHaveClass("min-h-0", "overflow-y-auto");
    expect(screen.getByTestId("import-csv-modal-footer")).toHaveClass("border-t");
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

    const validRowsCard = screen.getAllByText("Válidas")[0].closest("div");
    const invalidRowsCard = screen.getAllByText("Inválidas")[0].closest("div");

    expect(validRowsCard).toHaveTextContent("1");
    expect(invalidRowsCard).toHaveTextContent("1");
  });

  it("exibe badge e aviso para conta de telecom detectada", async () => {
    const file = new File(["dummy"], "telecom.pdf", { type: "application/pdf" });
    transactionsService.dryRunImportCsv.mockResolvedValueOnce(
      buildDryRunResponse({
        documentType: "utility_bill_telecom",
        summary: {
          totalRows: 0,
          validRows: 0,
          invalidRows: 0,
          duplicateRows: 0,
          conflictRows: 0,
          income: 0,
          expense: 0,
        },
        rows: [],
        suggestion: {
          type: "bill",
          billType: "tv",
          issuer: "VIVO",
          referenceMonth: "2026-03",
          dueDate: "2026-03-18",
          amountDue: 189.9,
          customerCode: "12345",
        },
      }),
    );

    render(<ImportCsvModal isOpen onClose={vi.fn()} />);

    await userEvent.upload(screen.getByLabelText("Arquivo do extrato"), file);
    await userEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

    await waitFor(() => {
      expect(screen.getByText("Conta de internet/telefone/TV")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/energia, água, internet, telefone e TV/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar pendência" })).toBeInTheDocument();
  });

  it("prefill da pendência usa o tipo telecom extraído", async () => {
    const file = new File(["dummy"], "telecom.pdf", { type: "application/pdf" });
    transactionsService.dryRunImportCsv.mockResolvedValueOnce(
      buildDryRunResponse({
        documentType: "utility_bill_telecom",
        summary: {
          totalRows: 0,
          validRows: 0,
          invalidRows: 0,
          duplicateRows: 0,
          conflictRows: 0,
          income: 0,
          expense: 0,
        },
        rows: [],
        suggestion: {
          type: "bill",
          billType: "tv",
          issuer: "VIVO",
          referenceMonth: "2026-03",
          dueDate: "2026-03-18",
          amountDue: 189.9,
          customerCode: "12345",
        },
      }),
    );

    render(<ImportCsvModal isOpen onClose={vi.fn()} />);

    await userEvent.upload(screen.getByLabelText("Arquivo do extrato"), file);
    await userEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Criar pendência" })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Criar pendência" }));

    await waitFor(() => {
      expect(screen.getByText("Nova pendência")).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/título/i)).toHaveValue("Conta de TV — VIVO");
    expect(screen.getByLabelText(/valor/i)).toHaveValue("189,90");
    expect(screen.getByLabelText(/vencimento/i)).toHaveValue("2026-03-18");
    expect(screen.getByLabelText(/mês de referência/i)).toHaveValue("2026-03");
  });

  it("renders conflict rows with visible reason and blocks import when there are no valid rows", async () => {
    const file = new File(["date,type,value"], "import.csv", { type: "text/csv" });
    transactionsService.dryRunImportCsv.mockResolvedValueOnce(
      buildDryRunResponse({
        summary: {
          totalRows: 1,
          validRows: 0,
          invalidRows: 0,
          duplicateRows: 0,
          conflictRows: 1,
          income: 0,
          expense: 0,
        },
        rows: [
          {
            line: 2,
            status: "conflict",
            raw: {
              date: "2026-03-06",
              type: "Entrada",
              value: "1412",
              description: "CREDITO BENEFICIO INSS",
              notes: "",
              category: "",
            },
            normalized: null,
            errors: [],
            statusDetail:
              "INSS Beneficio ja registrado no historico de renda (2026-03, 2026-03-05).",
            conflict: {
              type: "income_statement",
              statementId: 15,
              sourceName: "INSS Beneficio",
              referenceMonth: "2026-03",
              paymentDate: "2026-03-05",
              netAmount: 1412,
              status: "draft",
              postedTransactionId: null,
            },
          },
        ],
      }),
    );

    render(<ImportCsvModal isOpen onClose={vi.fn()} />);

    await userEvent.upload(screen.getByLabelText("Arquivo do extrato"), file);
    await userEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

    await waitFor(() => {
      expect(screen.getAllByText("Para revisar")[0]).toBeInTheDocument();
    });

    expect(screen.getByText("Revisar")).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "Esta renda já existe no histórico: INSS Beneficio, competência 03/2026, pagamento em 05/03/2026.",
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Importar" })).toBeDisabled();
  });

  it("commits import and calls onImported callback when Fechar is clicked", async () => {
    const onImported = vi.fn();
    const onDataChanged = vi.fn();
    const file = new File(["date,type,value"], "import.csv", { type: "text/csv" });

    transactionsService.dryRunImportCsv.mockResolvedValueOnce(buildDryRunResponse());
    transactionsService.commitImportCsv.mockResolvedValueOnce({
      imported: 1,
      importSessionId: "import-session-1",
      summary: { income: 100, expense: 20, balance: 80 },
    });

    render(<ImportCsvModal isOpen onClose={vi.fn()} onImported={onImported} onDataChanged={onDataChanged} />);

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
    expect(onDataChanged).toHaveBeenCalledTimes(1);

    // onImported not yet called — deferred until user clicks Fechar
    expect(onImported).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Fechar" }));

    await waitFor(() => {
      expect(onImported).toHaveBeenCalled();
    });
  });

  it("abre o histórico depois do commit sem perder o refresh do app", async () => {
    const onImported = vi.fn();
    const onOpenHistory = vi.fn();
    const onDataChanged = vi.fn();
    const file = new File(["date,type,value"], "import.csv", { type: "text/csv" });

    transactionsService.dryRunImportCsv.mockResolvedValueOnce(buildDryRunResponse());
    transactionsService.commitImportCsv.mockResolvedValueOnce({
      imported: 1,
      importSessionId: "import-session-1",
      summary: { income: 100, expense: 20, balance: 80 },
    });

    render(
      <ImportCsvModal
        isOpen
        onClose={vi.fn()}
        onImported={onImported}
        onOpenHistory={onOpenHistory}
        onDataChanged={onDataChanged}
      />,
    );

    await userEvent.upload(screen.getByLabelText("Arquivo do extrato"), file);
    await userEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Importar" })).not.toBeDisabled();
    });

    await userEvent.click(screen.getByRole("button", { name: "Importar" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Ver histórico" })).toBeInTheDocument();
    });
    expect(onDataChanged).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Ver histórico" }));

    await waitFor(() => {
      expect(onImported).toHaveBeenCalledWith(
        expect.objectContaining({
          importSessionId: "import-session-1",
        }),
      );
      expect(onOpenHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          importSessionId: "import-session-1",
        }),
      );
    });
  });

  it("pede confirmação antes de desfazer a importação", async () => {
    const onImported = vi.fn();
    const file = new File(["date,type,value"], "import.csv", { type: "text/csv" });

    transactionsService.dryRunImportCsv.mockResolvedValueOnce(buildDryRunResponse());
    transactionsService.commitImportCsv.mockResolvedValueOnce({
      imported: 1,
      importSessionId: "import-session-1",
      summary: { income: 100, expense: 20, balance: 80 },
    });
    transactionsService.deleteImportSession.mockResolvedValueOnce({
      importSessionId: "import-session-1",
      deletedCount: 1,
      success: true,
    });

    render(<ImportCsvModal isOpen onClose={vi.fn()} onImported={onImported} />);

    await userEvent.upload(screen.getByLabelText("Arquivo do extrato"), file);
    await userEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Importar" })).not.toBeDisabled();
    });

    await userEvent.click(screen.getByRole("button", { name: "Importar" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Desfazer importação" })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Desfazer importação" }));

    expect(transactionsService.deleteImportSession).not.toHaveBeenCalled();
    const confirmDialog = screen.getByRole("dialog", { name: "Desfazer esta importação?" });
    expect(confirmDialog).toBeInTheDocument();

    await userEvent.click(
      within(confirmDialog).getByRole("button", { name: "Desfazer importação" }),
    );

    await waitFor(() => {
      expect(transactionsService.deleteImportSession).toHaveBeenCalledWith("import-session-1");
      expect(onImported).toHaveBeenCalledWith(null);
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

  describe("preview search and filters", () => {
    it("filtra o preview por busca textual e status", async () => {
      const file = new File(["date,type,value"], "import.csv", { type: "text/csv" });
      transactionsService.dryRunImportCsv.mockResolvedValueOnce(
        buildDryRunResponse({
          summary: {
            totalRows: 3,
            validRows: 2,
            invalidRows: 0,
            duplicateRows: 1,
            conflictRows: 0,
            income: 250,
            expense: 0,
          },
          rows: [
            {
              line: 2,
              status: "valid",
              raw: {
                date: "2026-02-21",
                type: "Entrada",
                value: "100",
                description: "PIX FARMACIA CENTRAL",
                notes: "",
                category: "",
              },
              normalized: {
                date: "2026-02-21",
                type: "Entrada",
                value: 100,
                description: "PIX FARMACIA CENTRAL",
                notes: "",
                categoryId: null,
              },
              errors: [],
            },
            {
              line: 3,
              status: "valid",
              raw: {
                date: "2026-02-22",
                type: "Entrada",
                value: "100",
                description: "PIX MERCADO BAIRRO",
                notes: "",
                category: "",
              },
              normalized: {
                date: "2026-02-22",
                type: "Entrada",
                value: 100,
                description: "PIX MERCADO BAIRRO",
                notes: "",
                categoryId: null,
              },
              errors: [],
            },
            {
              line: 4,
              status: "duplicate",
              statusDetail: "Ja existe uma transacao importada equivalente.",
              raw: {
                date: "2026-02-25",
                type: "Entrada",
                value: "50",
                description: "SALARIO INSS",
                notes: "",
                category: "Trabalho",
              },
              normalized: null,
              errors: [],
            },
          ],
        }),
      );

      render(<ImportCsvModal isOpen onClose={vi.fn()} />);
      await userEvent.upload(screen.getByLabelText("Arquivo do extrato"), file);
      await userEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

      await waitFor(() => {
        expect(screen.getByLabelText(/buscar na pré-visualização/i)).toBeInTheDocument();
      });

      await userEvent.type(screen.getByLabelText(/buscar na pré-visualização/i), "farmacia");

      expect(screen.getByText("PIX FARMACIA CENTRAL")).toBeInTheDocument();
      expect(screen.queryByText("PIX MERCADO BAIRRO")).not.toBeInTheDocument();
      expect(screen.getByText(/1 de 3 linhas visíveis/i)).toBeInTheDocument();

      await userEvent.clear(screen.getByLabelText(/buscar na pré-visualização/i));
      await userEvent.selectOptions(screen.getByLabelText(/filtrar por status/i), "duplicate");

      expect(screen.getByText("SALARIO INSS")).toBeInTheDocument();
      expect(screen.queryByText("PIX FARMACIA CENTRAL")).not.toBeInTheDocument();
      expect(screen.getByText(/1 de 3 linhas visíveis/i)).toBeInTheDocument();
    });

    it(
      "mantem o preview navegavel com extrato grande e busca pontual",
      async () => {
        const file = new File(["date,type,value"], "import.csv", { type: "text/csv" });
        const rows = Array.from({ length: 320 }, (_, index) => {
          const line = index + 2;
          const description =
            line === 211
              ? "PIX FARMACIA ESPECIAL"
              : `PIX TRANSFERENCIA ${String(line).padStart(3, "0")}`;

          return {
            line,
            status: "valid",
            raw: {
              date: "2026-02-21",
              type: "Entrada",
              value: "10",
              description,
              notes: "",
              category: "",
            },
            normalized: {
              date: "2026-02-21",
              type: "Entrada",
              value: 10,
              description,
              notes: "",
              categoryId: null,
            },
            errors: [],
          };
        });

        transactionsService.dryRunImportCsv.mockResolvedValueOnce(
          buildDryRunResponse({
            summary: {
              totalRows: rows.length,
              validRows: rows.length,
              invalidRows: 0,
              duplicateRows: 0,
              conflictRows: 0,
              income: rows.length * 10,
              expense: 0,
            },
            rows,
          }),
        );

        render(<ImportCsvModal isOpen onClose={vi.fn()} />);
        await userEvent.upload(screen.getByLabelText("Arquivo do extrato"), file);
        await userEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

        await waitFor(() => {
          expect(screen.getByText(/320 de 320 linhas visíveis/i)).toBeInTheDocument();
          expect(screen.getByText(/mostrando 100 agora para manter a revisão leve/i)).toBeInTheDocument();
          expect(screen.getByText(/mostrando 100 de 320 linhas filtradas/i)).toBeInTheDocument();
        });

        expect(screen.queryByText("PIX TRANSFERENCIA 102")).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: /mostrar mais 100/i }));

        await waitFor(() => {
          expect(screen.getByText(/mostrando 200 de 320 linhas filtradas/i)).toBeInTheDocument();
        });

        expect(screen.getByText("PIX TRANSFERENCIA 102")).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText(/buscar na pré-visualização/i), {
          target: { value: "farmacia especial" },
        });

        await waitFor(() => {
          expect(screen.getByText("PIX FARMACIA ESPECIAL")).toBeInTheDocument();
          expect(screen.queryByText("PIX TRANSFERENCIA 002")).not.toBeInTheDocument();
          expect(screen.getByText(/1 de 320 linhas visíveis/i)).toBeInTheDocument();
        });
      },
      20000,
    );
  });

  describe("import category rules", () => {
    it("salva regra a partir da busca atual e da categoria em lote", async () => {
      const file = new File(["date,type,value"], "import.csv", { type: "text/csv" });
      categoriesService.listCategories.mockResolvedValue([
        { id: 7, name: "Saude" },
      ]);
      transactionsService.createImportCategoryRule.mockResolvedValue({
        id: 91,
        matchText: "farmacia",
        transactionType: "Entrada",
        categoryId: 7,
        categoryName: "Saude",
        createdAt: "2026-03-26T10:00:00Z",
        updatedAt: "2026-03-26T10:00:00Z",
      });
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
                description: "PIX FARMACIA CENTRAL",
                notes: "",
                category: "",
              },
              normalized: {
                date: "2026-02-21",
                type: "Entrada",
                value: 100,
                description: "PIX FARMACIA CENTRAL",
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
        expect(screen.getByLabelText(/buscar na pré-visualização/i)).toBeInTheDocument();
      });

      await userEvent.type(screen.getByLabelText(/buscar na pré-visualização/i), "farmacia");
      await userEvent.click(screen.getByLabelText(/selecionar todas as linhas válidas/i));
      await userEvent.selectOptions(screen.getByLabelText(/categoria para aplicar em lote/i), "7");
      await userEvent.click(screen.getByRole("button", { name: /aplicar e salvar regra/i }));

      await waitFor(() => {
        expect(transactionsService.createImportCategoryRule).toHaveBeenCalledWith({
          matchText: "farmacia",
          categoryId: 7,
          transactionType: "Entrada",
        });
      });

      expect(screen.getByText(/regra salva para "farmacia"/i)).toBeInTheDocument();
      expect(screen.getAllByText("Saude")[0]).toBeInTheDocument();
      expect(screen.getByText(/contem "farmacia" · entrada/i)).toBeInTheDocument();
    });

    it("lista e remove regras salvas de importação", async () => {
      const file = new File(["date,type,value"], "import.csv", { type: "text/csv" });
      transactionsService.listImportCategoryRules.mockResolvedValue([
        {
          id: 15,
          matchText: "neoenergia",
          transactionType: "Saida",
          categoryId: 3,
          categoryName: "Moradia",
          createdAt: "2026-03-26T10:00:00Z",
          updatedAt: "2026-03-26T10:00:00Z",
        },
      ]);
      transactionsService.deleteImportCategoryRule.mockResolvedValue({
        id: 15,
        success: true,
      });

      render(<ImportCsvModal isOpen onClose={vi.fn()} />);

      transactionsService.dryRunImportCsv.mockResolvedValueOnce(buildDryRunResponse());
      await userEvent.upload(screen.getByLabelText("Arquivo do extrato"), file);
      await userEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

      await waitFor(() => {
        expect(screen.getByText("Moradia")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: /remover regra neoenergia/i }));

      await waitFor(() => {
        expect(transactionsService.deleteImportCategoryRule).toHaveBeenCalledWith(15);
      });

      expect(screen.queryByText("Moradia")).not.toBeInTheDocument();
      expect(screen.getByText(/regra removida com sucesso/i)).toBeInTheDocument();
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
          profileKind: "inss",
          referenceMonth: "2026-02",
          netAmount: 1412.0,
          paymentDate: "2026-02-25",
          grossAmount: 1800.0,
          benefitKind: "Aposentadoria",
          },
        });

      const buildMultiCompetenceInssResponse = () =>
        buildDryRunResponse({
          documentType: "income_statement_inss",
          summary: { totalRows: 2, validRows: 2, invalidRows: 0, duplicateRows: 0, conflictRows: 0, income: 5607.04, expense: 0 },
          rows: [
            {
              line: 8,
              status: "valid",
              raw: {
                date: "2026-03-05",
                type: "Entrada",
                value: "2803.52",
                description: "Credito INSS 02/2026",
                notes: "",
                category: "",
              },
              normalized: {
                date: "2026-03-05",
                type: "Entrada",
                value: 2803.52,
                description: "Credito INSS 02/2026",
                notes: "",
                categoryId: null,
              },
              errors: [],
            },
            {
              line: 15,
              status: "valid",
              raw: {
                date: "2026-04-07",
                type: "Entrada",
                value: "2803.52",
                description: "Credito INSS 03/2026",
                notes: "",
                category: "",
              },
              normalized: {
                date: "2026-04-07",
                type: "Entrada",
                value: 2803.52,
                description: "Credito INSS 03/2026",
                notes: "",
                categoryId: null,
              },
              errors: [],
            },
          ],
          suggestions: [
            {
              type: "profile",
              line: 8,
              profileKind: "inss",
              referenceMonth: "2026-02",
              paymentDate: "2026-03-05",
              netAmount: 2803.52,
              grossAmount: 4958.67,
              benefitKind: "Pensão por morte",
              birthYear: 1955,
              deductions: [
                { code: "216", label: "CONSIGNACAO EMPRESTIMO BANCARIO", amount: 156, consignacaoType: "loan" },
                { code: "217", label: "EMPRESTIMO SOBRE A RMC", amount: 238, consignacaoType: "loan" },
              ],
            },
            {
              type: "profile",
              line: 15,
              profileKind: "inss",
              referenceMonth: "2026-03",
              paymentDate: "2026-04-07",
              netAmount: 2803.52,
              grossAmount: 4958.67,
              benefitKind: "Pensão por morte",
              birthYear: 1955,
              deductions: [
                { code: "216", label: "CONSIGNACAO EMPRESTIMO BANCARIO", amount: 75.17, consignacaoType: "loan" },
                { code: "268", label: "CONSIGNACAO - CARTAO", amount: 247.93, consignacaoType: "card" },
              ],
            },
          ],
          suggestion: {
            type: "profile",
            line: 8,
            profileKind: "inss",
            referenceMonth: "2026-02",
            paymentDate: "2026-03-05",
            netAmount: 2803.52,
            grossAmount: 4958.67,
          },
        });

      const buildPayrollResponse = () =>
        buildDryRunResponse({
          documentType: "income_statement_payroll",
          summary: { totalRows: 0, validRows: 0, invalidRows: 0, income: 0, expense: 0 },
          rows: [],
          suggestion: {
            type: "profile",
            profileKind: "clt",
            employerName: "ACME LTDA",
            referenceMonth: "2026-03",
            netAmount: 4180.55,
            paymentDate: "2026-03-30",
            grossAmount: 5200,
            deductions: [{ label: "descontos_folha", amount: 1019.45 }],
          },
        });

      it("exibe botao de compor renda para suggestion type=profile", async () => {
      const file = new File(["dummy"], "inss.pdf", { type: "application/pdf" });
      transactionsService.dryRunImportCsv.mockResolvedValueOnce(buildInssResponse());

      render(<ImportCsvModal isOpen onClose={vi.fn()} />);
      await userEvent.upload(screen.getByLabelText("Arquivo do extrato"), file);
      await userEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Usar este documento na minha renda" }),
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
          screen.getByRole("button", { name: "Usar este documento na minha renda" }),
        ).toBeInTheDocument();
      });

      await userEvent.click(
        screen.getByRole("button", { name: "Usar este documento na minha renda" }),
      );

      await waitFor(() => {
        expect(
          screen.getByRole("dialog", { name: /Registrar no histórico de renda/i }),
        ).toBeInTheDocument();
      });
    });

    it("permite escolher a competencia do INSS e envia os descontos individualizados", async () => {
      const file = new File(["dummy"], "inss.pdf", { type: "application/pdf" });
      transactionsService.dryRunImportCsv.mockResolvedValueOnce(buildMultiCompetenceInssResponse());
      incomeSourcesService.list.mockResolvedValue([
        { id: 1, name: "INSS Benefício", deductions: [], userId: 1, categoryId: null, defaultDay: null, notes: null, createdAt: "", updatedAt: "" },
      ]);
      incomeSourcesService.createStatement.mockResolvedValue({
        statement: {
          id: 11,
          incomeSourceId: 1,
          referenceMonth: "2026-02",
          netAmount: 2803.52,
          totalDeductions: 394,
          grossAmount: 4958.67,
          details: null,
          paymentDate: "2026-03-05",
          status: "draft",
          postedTransactionId: null,
          createdAt: "2026-03-05T00:00:00Z",
          updatedAt: "2026-03-05T00:00:00Z",
        },
        deductions: [],
      });

      render(<ImportCsvModal isOpen onClose={vi.fn()} />);
      await userEvent.upload(screen.getByLabelText("Arquivo do extrato"), file);
      await userEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /2026-03\s*·\s*2026-04-07/i }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: /2026-02\s*·\s*2026-03-05/i }),
        ).toBeInTheDocument();
      });

      await userEvent.click(
        screen.getByRole("button", { name: /2026-02\s*·\s*2026-03-05/i }),
      );

      await waitFor(() => {
        expect(screen.getByText("Competência: 2026-02")).toBeInTheDocument();
        expect(screen.getByText("Pagamento: 2026-03-05")).toBeInTheDocument();
      });

      await userEvent.click(
        screen.getByRole("button", { name: "Usar este documento na minha renda" }),
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Registrar e lançar entrada" })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: "Registrar e lançar entrada" }));

      await waitFor(() => {
        expect(incomeSourcesService.createStatement).toHaveBeenCalledWith(1, {
          referenceMonth: "2026-02",
          netAmount: 2803.52,
          paymentDate: "2026-03-05",
          grossAmount: 4958.67,
          deductions: [
            { label: "216 CONSIGNACAO EMPRESTIMO BANCARIO", amount: 156, isVariable: false },
            { label: "217 EMPRESTIMO SOBRE A RMC", amount: 238, isVariable: false },
          ],
          details: {
            profileKind: "inss",
            benefitKind: "Pensão por morte",
            birthYear: 1955,
          },
          sourceImportSessionId: "import-session-1",
        });
      });
    });

  it("sugere atualizar perfil e planejamento depois de confirmar a renda estruturada", async () => {
      const file = new File(["dummy"], "inss.pdf", { type: "application/pdf" });
      const onDataChanged = vi.fn();
      transactionsService.dryRunImportCsv.mockResolvedValueOnce(buildInssResponse());
      incomeSourcesService.list.mockResolvedValue([
        {
          id: 1,
          name: "INSS Benefício",
          deductions: [],
          userId: 1,
          categoryId: null,
          defaultDay: null,
          notes: null,
          createdAt: "",
          updatedAt: "",
        },
      ]);
      incomeSourcesService.createStatement.mockResolvedValue({
        statement: {
          id: 11,
          incomeSourceId: 1,
          referenceMonth: "2026-02",
          netAmount: 1412,
          totalDeductions: 0,
          grossAmount: 1800,
          details: null,
          paymentDate: "2026-02-25",
          status: "draft",
          postedTransactionId: null,
          createdAt: "2026-02-25T00:00:00Z",
          updatedAt: "2026-02-25T00:00:00Z",
        },
        deductions: [],
      });

      render(<ImportCsvModal isOpen onClose={vi.fn()} onDataChanged={onDataChanged} />);
      await userEvent.upload(screen.getByLabelText("Arquivo do extrato"), file);
      await userEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Usar este documento na minha renda" }),
        ).toBeInTheDocument();
      });

      await userEvent.click(
        screen.getByRole("button", { name: "Usar este documento na minha renda" }),
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Registrar e lançar entrada" }),
        ).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: "Registrar e lançar entrada" }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Atualizar perfil e planejamento" }),
        ).toBeInTheDocument();
      });
      expect(onDataChanged).toHaveBeenCalledTimes(1);

      await userEvent.click(
        screen.getByRole("button", { name: "Atualizar perfil e planejamento" }),
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Confirmar" })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));

      await waitFor(() => {
        expect(profileService.updateProfile).toHaveBeenCalledWith({
          salary_monthly: 1412,
          payday: 25,
        });
      });
      expect(salaryService.syncImportedBenefitProfile).toHaveBeenCalledWith({
        gross_salary: 1800,
        payment_day: 25,
        birth_year: null,
        reference_month: "2026-02",
        payment_date: "2026-02-25",
        consignacoes: [],
      });
      expect(forecastService.recompute).toHaveBeenCalled();
      expect(
        screen.getByText(/perfil, planejamento e benefício atualizados com sucesso/i),
      ).toBeInTheDocument();
    });

    it("exibe badge e dados de holerite CLT no preview", async () => {
      const file = new File(["dummy"], "holerite.pdf", { type: "application/pdf" });
      transactionsService.dryRunImportCsv.mockResolvedValueOnce(buildPayrollResponse());

      render(<ImportCsvModal isOpen onClose={vi.fn()} />);
      await userEvent.upload(screen.getByLabelText("Arquivo do extrato"), file);
      await userEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

      await waitFor(() => {
        expect(screen.getByText("Holerite / CLT")).toBeInTheDocument();
        expect(screen.getByText("Empresa: ACME LTDA")).toBeInTheDocument();
        expect(screen.getByText("Tipo: Holerite / CLT")).toBeInTheDocument();
      });
    });

    it("permite ignorar a sugestao de perfil depois de confirmar a renda", async () => {
      const file = new File(["dummy"], "inss.pdf", { type: "application/pdf" });
      transactionsService.dryRunImportCsv.mockResolvedValueOnce(buildInssResponse());
      incomeSourcesService.list.mockResolvedValue([
        {
          id: 1,
          name: "INSS Benefício",
          deductions: [],
          userId: 1,
          categoryId: null,
          defaultDay: null,
          notes: null,
          createdAt: "",
          updatedAt: "",
        },
      ]);
      incomeSourcesService.createStatement.mockResolvedValue({
        statement: {
          id: 11,
          incomeSourceId: 1,
          referenceMonth: "2026-02",
          netAmount: 1412,
          totalDeductions: 0,
          grossAmount: 1800,
          details: null,
          paymentDate: "2026-02-25",
          status: "draft",
          postedTransactionId: null,
          createdAt: "2026-02-25T00:00:00Z",
          updatedAt: "2026-02-25T00:00:00Z",
        },
        deductions: [],
      });

      render(<ImportCsvModal isOpen onClose={vi.fn()} />);
      await userEvent.upload(screen.getByLabelText("Arquivo do extrato"), file);
      await userEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Usar este documento na minha renda" }),
        ).toBeInTheDocument();
      });

      await userEvent.click(
        screen.getByRole("button", { name: "Usar este documento na minha renda" }),
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Registrar e lançar entrada" }),
        ).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: "Registrar e lançar entrada" }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Atualizar perfil e planejamento" }),
        ).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: "Ignorar" }));

      expect(profileService.updateProfile).not.toHaveBeenCalled();
      expect(forecastService.recompute).not.toHaveBeenCalled();
      expect(screen.getByText(/sugestao de atualizacao ignorada por enquanto/i)).toBeInTheDocument();
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
