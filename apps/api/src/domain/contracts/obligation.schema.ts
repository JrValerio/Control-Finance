import { z } from "zod";

export const ObligationTypeSchema = z.enum([
  "bill",
  "open_invoice",
  "credit_card_cycle",
  "pending_charge",
]);

export const ObligationStatusSchema = z.enum(["open", "due", "paid"]);

export const ObligationSchema = z.object({
  amount: z.number(),
  obligationType: ObligationTypeSchema,
  dueDate: z.string().datetime({ offset: true }),
  status: ObligationStatusSchema,
});

export type ObligationType = z.infer<typeof ObligationTypeSchema>;
export type ObligationStatus = z.infer<typeof ObligationStatusSchema>;
export type Obligation = z.infer<typeof ObligationSchema>;
