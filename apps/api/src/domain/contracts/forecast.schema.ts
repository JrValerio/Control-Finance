import { z } from "zod";

export const ForecastBalanceBasisSchema = z.enum([
  "bank_account",
  "net_month_transactions",
]);

export const ForecastIncomeBasisSchema = z.enum([
  "confirmed_statement",
  "salary_profile_fallback",
]);

export const ForecastPendingItemsSchema = z.object({
  bills: z.number().int().nonnegative(),
  invoices: z.number().int().nonnegative(),
  creditCardCycles: z.number().int().nonnegative(),
});

export const ForecastBasisSchema = z.object({
  balanceBasis: ForecastBalanceBasisSchema,
  incomeBasis: ForecastIncomeBasisSchema,
  pendingItems: ForecastPendingItemsSchema,
  fallbacksUsed: z.array(z.string()),
});

export const ForecastConfidenceSchema = z.enum(["high", "medium", "low"]);

export const ForecastResultSchema = z.object({
  projectedBalance: z.number(),
  basis: ForecastBasisSchema,
  confidence: ForecastConfidenceSchema,
  periodEnd: z.string().datetime({ offset: true }),
});

export type ForecastBalanceBasis = z.infer<typeof ForecastBalanceBasisSchema>;
export type ForecastIncomeBasis = z.infer<typeof ForecastIncomeBasisSchema>;
export type ForecastPendingItems = z.infer<typeof ForecastPendingItemsSchema>;
export type ForecastBasis = z.infer<typeof ForecastBasisSchema>;
export type ForecastConfidence = z.infer<typeof ForecastConfidenceSchema>;
export type ForecastResult = z.infer<typeof ForecastResultSchema>;
