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

describe("bills service billType normalization", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
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
});
