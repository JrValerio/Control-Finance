import { z } from "zod";

export const IncomeStatusSchema = z.enum(["confirmed", "pending", "detected"]);

export const IncomeTypeSchema = z.enum(["salary", "benefit", "imported", "other"]);

export const IncomeSourceIdSchema = z.union([
  z.string().min(1),
  z.number().int().nonnegative(),
]);

export const IncomeEntrySchema = z.object({
  grossAmount: z.number(),
  netAmount: z.number(),
  status: IncomeStatusSchema,
  incomeType: IncomeTypeSchema,
  isInferred: z.boolean(),
  sourceId: IncomeSourceIdSchema,
});

export type IncomeStatus = z.infer<typeof IncomeStatusSchema>;
export type IncomeType = z.infer<typeof IncomeTypeSchema>;
export type IncomeSourceId = z.infer<typeof IncomeSourceIdSchema>;
export type IncomeEntry = z.infer<typeof IncomeEntrySchema>;
