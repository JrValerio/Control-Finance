import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImportCsvModal from "./ImportCsvModal";
import { transactionsService } from "../services/transactions.service";

vi.mock("../services/transactions.service", () => ({
  transactionsService: {
    dryRunImportCsv: vi.fn(),
    commitImportCsv: vi.fn(),
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

  it("commits import and calls onImported callback", async () => {
    const onImported = vi.fn();
    const file = new File(["date,type,value"], "import.csv", { type: "text/csv" });

    transactionsService.dryRunImportCsv.mockResolvedValueOnce(buildDryRunResponse());
    transactionsService.commitImportCsv.mockResolvedValueOnce({
      imported: 1,
      summary: { income: 100, expense: 20, balance: 80 },
    });

    render(<ImportCsvModal isOpen onClose={vi.fn()} onImported={onImported} />);

    await userEvent.upload(screen.getByLabelText("Arquivo do extrato"), file);
    await userEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Importar" })).not.toBeDisabled();
    });

    await userEvent.click(screen.getByRole("button", { name: "Importar" }));

    await waitFor(() => {
      expect(transactionsService.commitImportCsv).toHaveBeenCalledWith("import-session-1");
      expect(onImported).toHaveBeenCalled();
    });
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
});
