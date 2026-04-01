import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { transactionsService } from "./transactions.service";

vi.mock("./api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const postMock = vi.mocked(api.post);

const BASE_DRY_RUN_RESPONSE = {
  importId: "import-session-1",
  expiresAt: "2026-04-10T12:00:00.000Z",
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
};

describe("transactions service import dry-run", () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it("preserva billType=gas na suggestion principal", async () => {
    postMock.mockResolvedValueOnce({
      data: {
        ...BASE_DRY_RUN_RESPONSE,
        suggestion: {
          type: "bill",
          billType: "gas",
          issuer: "COMGAS",
        },
      },
    });

    const file = new File(["dummy"], "gas.pdf", { type: "application/pdf" });
    const result = await transactionsService.dryRunImportCsv(file);

    expect(postMock).toHaveBeenCalledWith(
      "/transactions/import/dry-run",
      expect.any(FormData),
    );
    expect(result.suggestion).toMatchObject({
      type: "bill",
      billType: "gas",
      issuer: "COMGAS",
    });
  });

  it("preserva billType telecom no array de suggestions", async () => {
    postMock.mockResolvedValueOnce({
      data: {
        ...BASE_DRY_RUN_RESPONSE,
        suggestions: [
          { type: "bill", billType: "internet" },
          { type: "bill", billType: "phone" },
          { type: "bill", billType: "tv" },
        ],
      },
    });

    const file = new File(["dummy"], "telecom.pdf", { type: "application/pdf" });
    const result = await transactionsService.dryRunImportCsv(file);

    expect(result.suggestions?.map((suggestion) =>
      suggestion.type === "bill" ? suggestion.billType : null,
    )).toEqual(["internet", "phone", "tv"]);
  });

  it("normaliza billType desconhecido para null", async () => {
    postMock.mockResolvedValueOnce({
      data: {
        ...BASE_DRY_RUN_RESPONSE,
        suggestion: {
          type: "bill",
          billType: "unknown",
        },
      },
    });

    const file = new File(["dummy"], "unknown.pdf", { type: "application/pdf" });
    const result = await transactionsService.dryRunImportCsv(file);

    expect(result.suggestion).toMatchObject({
      type: "bill",
      billType: null,
    });
  });
});
