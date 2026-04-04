import { z } from "zod";
import { CoreFinancialSemanticContractSchema } from "./core-financial-semantic-contract.schema";

const DashboardBillsSchema = z.object({
  overdueCount: z.number().int().nonnegative(),
  overdueTotal: z.number(),
  dueSoonCount: z.number().int().nonnegative(),
  dueSoonTotal: z.number(),
  upcomingCount: z.number().int().nonnegative(),
  upcomingTotal: z.number(),
});

const DashboardCardsSchema = z.object({
  openPurchasesTotal: z.number(),
  pendingInvoicesTotal: z.number(),
});

const DashboardIncomeSchema = z.object({
  receivedThisMonth: z.number(),
  pendingThisMonth: z.number(),
  referenceMonth: z.string().regex(/^\d{4}-\d{2}$/),
});

const DashboardForecastSchema = z.object({
  projectedBalance: z.number(),
  month: z.string().min(1),
});

const DashboardConsignadoSchema = z.object({
  monthlyTotal: z.number(),
  contractsCount: z.number().int().nonnegative(),
  comprometimentoPct: z.number().nullable(),
});

export const DashboardSemanticSourceMapSchema = z.object({
  realized: z.tuple([z.literal("dashboard.income.receivedThisMonth")]),
  currentPosition: z.tuple([z.literal("dashboard.bankBalance")]),
  projection: z.tuple([
    z.literal("dashboard.income.pendingThisMonth"),
    z.literal("dashboard.forecast.projectedBalance"),
  ]),
});

export const DASHBOARD_SEMANTIC_SOURCE_MAP = DashboardSemanticSourceMapSchema.parse({
  realized: ["dashboard.income.receivedThisMonth"],
  currentPosition: ["dashboard.bankBalance"],
  projection: ["dashboard.income.pendingThisMonth", "dashboard.forecast.projectedBalance"],
});

export const DashboardSnapshotResponseSchema = z.object({
  bankBalance: z.number(),
  bills: DashboardBillsSchema,
  cards: DashboardCardsSchema,
  income: DashboardIncomeSchema,
  forecast: DashboardForecastSchema.nullable(),
  semanticCore: CoreFinancialSemanticContractSchema,
  semanticSourceMap: DashboardSemanticSourceMapSchema,
  consignado: DashboardConsignadoSchema,
});

export type DashboardSnapshotResponse = z.infer<typeof DashboardSnapshotResponseSchema>;
export type DashboardSemanticSourceMap = z.infer<typeof DashboardSemanticSourceMapSchema>;
