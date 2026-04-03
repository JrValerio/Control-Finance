import { z } from "zod";

export const BalanceSourceSchema = z.enum(["bank_account", "net_transactions"]);

export const BalanceSnapshotSchema = z.object({
  bankBalance: z.number(),
  technicalBalance: z.number(),
  source: BalanceSourceSchema,
  asOf: z.string().datetime({ offset: true }),
});

export type BalanceSource = z.infer<typeof BalanceSourceSchema>;
export type BalanceSnapshot = z.infer<typeof BalanceSnapshotSchema>;
