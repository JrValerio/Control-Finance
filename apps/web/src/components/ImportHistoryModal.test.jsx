import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImportHistoryModal from "./ImportHistoryModal";
import { transactionsService } from "../services/transactions.service";

vi.mock("../services/transactions.service", () => ({
  transactionsService: {
    getImportHistory: vi.fn(),
    deleteImportSession: vi.fn(),
  },
}));

const buildHistoryResponse = (overrides = {}) => ({
  items: [],
  pagination: {
    limit: 20,
    offset: 0,
  },
  ...overrides,
});

describe("ImportHistoryModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exibe sessoes revertidas com resumo detalhado", async () => {
    transactionsService.getImportHistory.mockResolvedValueOnce(
      buildHistoryResponse({
        items: [
          {
            id: "import-1",
            createdAt: "2026-04-01T10:00:00.000Z",
            expiresAt: "2026-04-01T10:30:00.000Z",
            committedAt: "2026-04-01T10:10:00.000Z",
            fileName: "itau-90-dias.ofx",
            documentType: "bank_statement",
            canUndo: false,
            undoBlockedReason:
              "Nao e possivel desfazer esta importacao porque existem derivados ativos vinculados a ela: 1 conta derivada.",
            summary: {
              totalRows: 5,
              validRows: 3,
              duplicateRows: 1,
              conflictRows: 1,
              invalidRows: 1,
              income: 200,
              expense: 50,
              imported: 0,
            },
          },
        ],
      }),
    );

    render(<ImportHistoryModal isOpen onClose={vi.fn()} />);

    expect(await screen.findByText("Reverted")).toBeInTheDocument();
    expect(screen.getByText("itau-90-dias.ofx")).toBeInTheDocument();
    expect(screen.getByText("Extrato bancário")).toBeInTheDocument();
    expect(screen.getByText("Duplicadas: 1")).toBeInTheDocument();
    expect(screen.getByText("Conflitos: 1")).toBeInTheDocument();
    expect(screen.getByText("Sem ação")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Nao e possivel desfazer esta importacao porque existem derivados ativos vinculados a ela: 1 conta derivada.",
      ),
    ).toBeInTheDocument();
  });

  it("confirma e desfaz a sessao com refresh do histórico", async () => {
    const onImportSessionReverted = vi.fn();

    transactionsService.getImportHistory
      .mockResolvedValueOnce(
        buildHistoryResponse({
          items: [
            {
              id: "import-undo",
              createdAt: "2026-04-01T10:00:00.000Z",
              expiresAt: "2026-04-01T10:30:00.000Z",
              committedAt: "2026-04-01T10:10:00.000Z",
              fileName: "inss.pdf",
              documentType: "income_statement_inss",
              canUndo: true,
              undoBlockedReason: null,
              summary: {
                totalRows: 2,
                validRows: 2,
                duplicateRows: 0,
                conflictRows: 0,
                invalidRows: 0,
                income: 1412,
                expense: 0,
                imported: 2,
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        buildHistoryResponse({
          items: [
            {
              id: "import-undo",
              createdAt: "2026-04-01T10:00:00.000Z",
              expiresAt: "2026-04-01T10:30:00.000Z",
              committedAt: "2026-04-01T10:10:00.000Z",
              fileName: "inss.pdf",
              documentType: "income_statement_inss",
              canUndo: false,
              undoBlockedReason: null,
              summary: {
                totalRows: 2,
                validRows: 2,
                duplicateRows: 0,
                conflictRows: 0,
                invalidRows: 0,
                income: 1412,
                expense: 0,
                imported: 0,
              },
            },
          ],
        }),
      );
    transactionsService.deleteImportSession.mockResolvedValueOnce({
      importSessionId: "import-undo",
      deletedCount: 2,
      success: true,
    });

    render(
      <ImportHistoryModal
        isOpen
        onClose={vi.fn()}
        onImportSessionReverted={onImportSessionReverted}
      />,
    );

    expect(await screen.findByText("Committed")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Desfazer" }));

    const confirmDialog = screen.getByRole("dialog", { name: "Desfazer importação?" });
    await userEvent.click(
      within(confirmDialog).getByRole("button", { name: "Desfazer importação" }),
    );

    await waitFor(() => {
      expect(transactionsService.deleteImportSession).toHaveBeenCalledWith("import-undo");
      expect(onImportSessionReverted).toHaveBeenCalledWith("import-undo");
    });

    expect(await screen.findByText("Importação desfeita com sucesso.")).toBeInTheDocument();
    expect(screen.getByText("Reverted")).toBeInTheDocument();
  });
});
