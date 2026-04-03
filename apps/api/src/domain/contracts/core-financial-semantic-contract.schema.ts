import { z } from "zod";

const YearMonthSchema = z.string().regex(/^\d{4}-\d{2}$/);

const AsOfSchema = z.union([
  z.string().datetime({ offset: true }),
  z.date(),
]);

export const CoreFinancialRealizedSchema = z.object({
  confirmedInflowTotal: z.number(),
  settledOutflowTotal: z.number(),
  netAmount: z.number(),
  referenceMonth: YearMonthSchema,
});

export const CoreFinancialCurrentPositionSchema = z.object({
  bankBalance: z.number(),
  technicalBalance: z.number(),
  asOf: AsOfSchema,
});

export const CoreFinancialProjectionSchema = z.object({
  referenceMonth: YearMonthSchema,
  projectedBalance: z.number(),
  adjustedProjectedBalance: z.number(),
  expectedInflow: z.number().nullable(),
});

export const CoreFinancialSemanticContractSchema = z.object({
  semanticsVersion: z.literal("v1"),
  realized: CoreFinancialRealizedSchema,
  currentPosition: CoreFinancialCurrentPositionSchema,
  projection: CoreFinancialProjectionSchema,
});

const CoreFinancialSemanticSourcePathSchema = z.enum([
  "dashboard.bankBalance",
  "dashboard.income.receivedThisMonth",
  "dashboard.income.pendingThisMonth",
  "dashboard.forecast.projectedBalance",
  "forecast.spendingToDate",
  "forecast.projectedBalance",
  "forecast.adjustedProjectedBalance",
  "forecast.incomeExpected",
]);

export const CoreFinancialSemanticSourceMapSchema = z
  .object({
    realized: z.array(CoreFinancialSemanticSourcePathSchema).min(1),
    currentPosition: z.array(CoreFinancialSemanticSourcePathSchema).min(1),
    projection: z.array(CoreFinancialSemanticSourcePathSchema).min(1),
  })
  .superRefine((value, ctx) => {
    const owners = new Map<string, "realized" | "currentPosition" | "projection">();

    const register = (
      semanticScope: "realized" | "currentPosition" | "projection",
      sourcePath: string,
      path: ["realized" | "currentPosition" | "projection", number],
    ) => {
      const existing = owners.get(sourcePath);
      if (existing && existing !== semanticScope) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `source path '${sourcePath}' cannot belong to both ${existing} and ${semanticScope}`,
          path,
        });
        return;
      }
      owners.set(sourcePath, semanticScope);
    };

    value.realized.forEach((sourcePath, index) => {
      register("realized", sourcePath, ["realized", index]);
    });
    value.currentPosition.forEach((sourcePath, index) => {
      register("currentPosition", sourcePath, ["currentPosition", index]);
    });
    value.projection.forEach((sourcePath, index) => {
      register("projection", sourcePath, ["projection", index]);
    });
  });

export const CORE_FINANCIAL_SEMANTIC_SOURCE_MAP =
  CoreFinancialSemanticSourceMapSchema.parse({
    realized: [
      "dashboard.income.receivedThisMonth",
      "forecast.spendingToDate",
    ],
    currentPosition: ["dashboard.bankBalance"],
    projection: [
      "dashboard.income.pendingThisMonth",
      "dashboard.forecast.projectedBalance",
      "forecast.projectedBalance",
      "forecast.adjustedProjectedBalance",
      "forecast.incomeExpected",
    ],
  });

export type CoreFinancialRealized = z.infer<typeof CoreFinancialRealizedSchema>;
export type CoreFinancialCurrentPosition = z.infer<
  typeof CoreFinancialCurrentPositionSchema
>;
export type CoreFinancialProjection = z.infer<typeof CoreFinancialProjectionSchema>;
export type CoreFinancialSemanticContract = z.infer<
  typeof CoreFinancialSemanticContractSchema
>;
export type CoreFinancialSemanticSourceMap = z.infer<
  typeof CoreFinancialSemanticSourceMapSchema
>;