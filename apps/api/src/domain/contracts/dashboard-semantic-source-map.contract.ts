export const DASHBOARD_SEMANTIC_SOURCE_MAP = {
  realized: ["dashboard.income.receivedThisMonth"],
  currentPosition: ["dashboard.bankBalance"],
  projection: ["dashboard.income.pendingThisMonth", "dashboard.forecast.projectedBalance"],
} as const;

export type DashboardSemanticSourceMapContract = typeof DASHBOARD_SEMANTIC_SOURCE_MAP;