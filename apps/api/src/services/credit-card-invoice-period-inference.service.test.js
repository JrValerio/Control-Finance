import { describe, expect, it } from "vitest";
import {
  inferInvoicePeriodFromDueDateAndClosingDay,
  resolveCreditCardInvoicePeriod,
} from "./credit-card-invoice-period-inference.service.js";

describe("credit-card-invoice period inference service", () => {
  it("infers period for standard due date and closing day", () => {
    const result = inferInvoicePeriodFromDueDateAndClosingDay("2026-03-15", 7);

    expect(result).toEqual({
      start: "2026-02-08",
      end: "2026-03-07",
    });
  });

  it("uses previous month closing when inferred end would be after due date", () => {
    const result = inferInvoicePeriodFromDueDateAndClosingDay("2026-03-05", 7);

    expect(result).toEqual({
      start: "2026-01-08",
      end: "2026-02-07",
    });
  });

  it("keeps existing period untouched when parser already returns period", () => {
    const result = resolveCreditCardInvoicePeriod({
      parsedPeriodStart: "2026-02-08",
      parsedPeriodEnd: "2026-03-07",
      dueDate: "2026-03-15",
      closingDay: 7,
      fieldsSources: {
        periodStart: "pdf",
        periodEnd: "pdf",
      },
    });

    expect(result).toEqual({
      periodStart: "2026-02-08",
      periodEnd: "2026-03-07",
      parseConfidence: "high",
      fieldsSources: {
        periodStart: "pdf",
        periodEnd: "pdf",
      },
      inferenceContext: {},
      inferredByClosingDay: false,
    });
  });

  it("infers missing period and marks confidence low", () => {
    const result = resolveCreditCardInvoicePeriod({
      parsedPeriodStart: null,
      parsedPeriodEnd: null,
      dueDate: "2026-03-15",
      closingDay: 7,
      fieldsSources: {
        periodStart: null,
        periodEnd: null,
      },
    });

    expect(result).toEqual({
      periodStart: "2026-02-08",
      periodEnd: "2026-03-07",
      parseConfidence: "low",
      fieldsSources: {
        periodStart: "inference:closing_day",
        periodEnd: "inference:closing_day",
      },
      inferenceContext: {
        closingDay: 7,
      },
      inferredByClosingDay: true,
    });
  });

  it("fails with explicit contract error for invalid closing day", () => {
    try {
      resolveCreditCardInvoicePeriod({
        parsedPeriodStart: null,
        parsedPeriodEnd: null,
        dueDate: "2026-03-15",
        closingDay: 0,
        fieldsSources: {
          periodStart: null,
          periodEnd: null,
        },
      });
      throw new Error("expected resolveCreditCardInvoicePeriod to throw");
    } catch (error) {
      expect(error).toMatchObject({
        status: 422,
        publicCode: "INVOICE_PERIOD_INFERENCE_FAILED",
      });
    }
  });
});
