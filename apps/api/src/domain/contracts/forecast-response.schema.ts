import { z } from "zod";

const YearMonthSchema = z.string().regex(/^\d{4}-\d{2}$/);

const GeneratedAtSchema = z.union([
  z.string().datetime({ offset: true }),
  z.date(),
]);

const ForecastBankLimitProjectionSchema = z.object({
  total: z.number(),
  used: z.number(),
  remaining: z.number(),
  exceededBy: z.number(),
  usagePct: z.number(),
  status: z.enum(["unused", "using", "exceeded"]),
  alertTriggered: z.boolean(),
});

const ForecastHttpPayloadSchema = z.object({
  month: YearMonthSchema,
  engineVersion: z.string(),
  projectedBalance: z.number(),
  incomeExpected: z.number().nullable(),
  spendingToDate: z.number(),
  dailyAvgSpending: z.number(),
  daysRemaining: z.number().int().positive(),
  flipDetected: z.boolean(),
  flipDirection: z.string().nullable(),
  generatedAt: GeneratedAtSchema,
  billsPendingTotal: z.number(),
  billsPendingCount: z.number().int().nonnegative(),
  adjustedProjectedBalance: z.number(),
  bankLimit: ForecastBankLimitProjectionSchema.nullable(),
});

export const ForecastCurrentResponseSchema = ForecastHttpPayloadSchema.nullable();

export const ForecastRecomputeResponseSchema = ForecastHttpPayloadSchema;

export type ForecastBankLimitProjection = z.infer<typeof ForecastBankLimitProjectionSchema>;
export type ForecastHttpPayload = z.infer<typeof ForecastHttpPayloadSchema>;
export type ForecastCurrentResponse = z.infer<typeof ForecastCurrentResponseSchema>;
export type ForecastRecomputeResponse = z.infer<typeof ForecastRecomputeResponseSchema>;
