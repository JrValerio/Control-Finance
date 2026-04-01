import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { billsService } from "./bills.service";

vi.mock("./api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const getMock = vi.mocked(api.get);
const postMock = vi.mocked(api.post);
const patchMock = vi.mocked(api.patch);

describe("bills service billType normalization", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
  });

  it("normaliza bill_type conhecido para minúsculo", async () => {
    getMock.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 11,
            user_id: 7,
            title: "Conta COMGAS",
            amount: 95.4,
            due_date: "2026-05-12",
            status: "pending",
            is_overdue: false,
            bill_type: " GAS ",
          },
        ],
        pagination: { limit: 20, offset: 0, total: 1 },
      },
    });

    const result = await billsService.list();

    expect(result.items).toHaveLength(1);
    expect(result.items[0].billType).toBe("gas");
  });

  it("retorna billType null quando API envia tipo desconhecido", async () => {
    getMock.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 12,
            user_id: 7,
            title: "Conta desconhecida",
            amount: 10,
            due_date: "2026-05-20",
            status: "pending",
            is_overdue: false,
            bill_type: "steam",
          },
        ],
        pagination: { limit: 20, offset: 0, total: 1 },
      },
    });

    const result = await billsService.list();

    expect(result.items).toHaveLength(1);
    expect(result.items[0].billType).toBeNull();
  });

  it("preserva billType conhecido no retorno de create", async () => {
    postMock.mockResolvedValueOnce({
      data: {
        id: 13,
        user_id: 7,
        title: "Conta de internet",
        amount: 129.9,
        due_date: "2026-06-10",
        status: "pending",
        is_overdue: false,
        bill_type: "internet",
      },
    });

    const result = await billsService.create({
      title: "Conta de internet",
      amount: 129.9,
      dueDate: "2026-06-10",
      billType: "internet",
    });

    expect(postMock).toHaveBeenCalledWith("/bills", {
      title: "Conta de internet",
      amount: 129.9,
      dueDate: "2026-06-10",
      billType: "internet",
    });
    expect(result.billType).toBe("internet");
  });

  it("sanitiza payload do create quando billType/sourceImportSessionId sao invalidos", async () => {
    postMock.mockResolvedValueOnce({
      data: {
        id: 14,
        user_id: 7,
        title: "Conta",
        amount: 80,
        due_date: "2026-06-20",
        status: "pending",
        is_overdue: false,
        bill_type: null,
        source_import_session_id: null,
      },
    });

    await billsService.create({
      title: "Conta",
      amount: 80,
      dueDate: "2026-06-20",
      billType: "steam" as unknown as "energy",
      sourceImportSessionId: "   " as unknown as string,
    });

    expect(postMock).toHaveBeenCalledWith("/bills", {
      title: "Conta",
      amount: 80,
      dueDate: "2026-06-20",
      billType: null,
      sourceImportSessionId: null,
    });
  });

  it("preserva update parcial sem limpar billType/sourceImportSessionId ausentes", async () => {
    patchMock.mockResolvedValueOnce({
      data: {
        id: 15,
        user_id: 7,
        title: "Conta editada",
        amount: 100,
        due_date: "2026-06-25",
        status: "pending",
        is_overdue: false,
        bill_type: "gas",
      },
    });

    await billsService.update(15, {
      title: "Conta editada",
    });

    expect(patchMock).toHaveBeenCalledWith("/bills/15", {
      title: "Conta editada",
    });
  });

  it("mapeia painel utilitario com bucket paid e resumo dedicado", async () => {
    getMock.mockResolvedValueOnce({
      data: {
        overdue: [],
        dueSoon: [],
        upcoming: [],
        paid: [
          {
            id: 16,
            user_id: 7,
            title: "Energia paga",
            amount: 150,
            due_date: "2026-06-10",
            status: "paid",
            paid_at: "2026-06-09T10:00:00.000Z",
            bill_type: "energy",
          },
        ],
        summary: {
          totalPending: 0,
          totalAmount: 0,
          overdueCount: 0,
          overdueAmount: 0,
          dueSoonCount: 0,
          dueSoonAmount: 0,
          upcomingCount: 0,
          upcomingAmount: 0,
          paidCount: 1,
          paidAmount: 150,
        },
      },
    });

    const result = await billsService.getUtilityPanel();

    expect(getMock).toHaveBeenCalledWith("/bills/utility-panel");
    expect(result.paid).toHaveLength(1);
    expect(result.paid[0]).toMatchObject({
      title: "Energia paga",
      status: "paid",
      billType: "energy",
      paidAt: "2026-06-09T10:00:00.000Z",
    });
    expect(result.summary.paidCount).toBe(1);
    expect(result.summary.paidAmount).toBe(150);
    expect(result.summary.upcomingCount).toBe(0);
    expect(result.summary.upcomingAmount).toBe(0);
  });
});
