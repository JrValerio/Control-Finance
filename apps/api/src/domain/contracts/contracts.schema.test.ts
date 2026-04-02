import { describe, expect, it } from "vitest";

import { BalanceSnapshotSchema } from "./balance.schema";
import { ForecastResultSchema } from "./forecast.schema";
import { IncomeEntrySchema } from "./income.schema";
import { ObligationSchema } from "./obligation.schema";

describe("financial contracts schemas", () => {
  describe("BalanceSnapshotSchema", () => {
    it("accepts valid payload", () => {
      const result = BalanceSnapshotSchema.safeParse({
        bankBalance: 1200.45,
        technicalBalance: 1100.1,
        source: "bank_account",
        asOf: "2026-04-02T12:00:00.000Z",
      });

      expect(result.success).toBe(true);
    });

    it("rejects payload missing required field", () => {
      const result = BalanceSnapshotSchema.safeParse({
        bankBalance: 1200.45,
        source: "bank_account",
        asOf: "2026-04-02T12:00:00.000Z",
      });

      expect(result.success).toBe(false);
    });

    it("rejects payload with wrong type", () => {
      const result = BalanceSnapshotSchema.safeParse({
        bankBalance: 1200.45,
        technicalBalance: 1100.1,
        source: 1,
        asOf: "2026-04-02T12:00:00.000Z",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("IncomeEntrySchema", () => {
    it("accepts valid payload", () => {
      const result = IncomeEntrySchema.safeParse({
        grossAmount: 7000,
        netAmount: 5500,
        status: "confirmed",
        incomeType: "salary",
        isInferred: false,
        sourceId: "statement-123",
      });

      expect(result.success).toBe(true);
    });

    it("rejects payload missing required field", () => {
      const result = IncomeEntrySchema.safeParse({
        grossAmount: 7000,
        netAmount: 5500,
        incomeType: "salary",
        isInferred: false,
        sourceId: "statement-123",
      });

      expect(result.success).toBe(false);
    });

    it("rejects payload with wrong type", () => {
      const result = IncomeEntrySchema.safeParse({
        grossAmount: 7000,
        netAmount: 5500,
        status: "confirmed",
        incomeType: "salary",
        isInferred: "no",
        sourceId: "statement-123",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("ObligationSchema", () => {
    it("accepts valid payload", () => {
      const result = ObligationSchema.safeParse({
        amount: 1800,
        obligationType: "open_invoice",
        dueDate: "2026-04-10T00:00:00.000Z",
        status: "open",
      });

      expect(result.success).toBe(true);
    });

    it("rejects payload missing required field", () => {
      const result = ObligationSchema.safeParse({
        amount: 1800,
        obligationType: "open_invoice",
        status: "open",
      });

      expect(result.success).toBe(false);
    });

    it("rejects payload with wrong type", () => {
      const result = ObligationSchema.safeParse({
        amount: 1800,
        obligationType: "open_invoice",
        dueDate: "2026-04-10T00:00:00.000Z",
        status: "pending",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("ForecastResultSchema", () => {
    it("accepts valid payload", () => {
      const result = ForecastResultSchema.safeParse({
        projectedBalance: 3210.8,
        basis: {
          balanceBasis: "bank_account",
          incomeBasis: "confirmed_statement",
          pendingItems: {
            bills: 2,
            invoices: 1,
            creditCardCycles: 1,
          },
          fallbacksUsed: [],
        },
        confidence: "high",
        periodEnd: "2026-04-30T23:59:59.000Z",
      });

      expect(result.success).toBe(true);
    });

    it("rejects payload missing required field", () => {
      const result = ForecastResultSchema.safeParse({
        projectedBalance: 3210.8,
        basis: {
          balanceBasis: "bank_account",
          incomeBasis: "confirmed_statement",
          pendingItems: {
            bills: 2,
            invoices: 1,
            creditCardCycles: 1,
          },
          fallbacksUsed: [],
        },
        periodEnd: "2026-04-30T23:59:59.000Z",
      });

      expect(result.success).toBe(false);
    });

    it("rejects payload with wrong type", () => {
      const result = ForecastResultSchema.safeParse({
        projectedBalance: "3210.8",
        basis: {
          balanceBasis: "bank_account",
          incomeBasis: "confirmed_statement",
          pendingItems: {
            bills: 2,
            invoices: 1,
            creditCardCycles: 1,
          },
          fallbacksUsed: [],
        },
        confidence: "high",
        periodEnd: "2026-04-30T23:59:59.000Z",
      });

      expect(result.success).toBe(false);
    });
  });
});
