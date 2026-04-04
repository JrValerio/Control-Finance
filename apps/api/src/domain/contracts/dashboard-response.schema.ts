import { z } from "zod";
import { CoreFinancialSemanticContractSchema } from "./core-financial-semantic-contract.schema";
import { DASHBOARD_SEMANTIC_SOURCE_MAP as DASHBOARD_CANONICAL_SEMANTIC_SOURCE_MAP } from "./dashboard-semantic-source-map.contract";

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
  realized: z.tuple([z.literal(DASHBOARD_CANONICAL_SEMANTIC_SOURCE_MAP.realized[0])]),
  currentPosition: z.tuple([z.literal(DASHBOARD_CANONICAL_SEMANTIC_SOURCE_MAP.currentPosition[0])]),
  projection: z.tuple([
    z.literal(DASHBOARD_CANONICAL_SEMANTIC_SOURCE_MAP.projection[0]),
    z.literal(DASHBOARD_CANONICAL_SEMANTIC_SOURCE_MAP.projection[1]),
  ]),
});

export const DASHBOARD_SEMANTIC_SOURCE_MAP = DashboardSemanticSourceMapSchema.parse(
  DASHBOARD_CANONICAL_SEMANTIC_SOURCE_MAP,
);

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
