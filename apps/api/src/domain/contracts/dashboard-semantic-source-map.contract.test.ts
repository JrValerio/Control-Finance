import { describe, expect, it } from "vitest";

import { DashboardSemanticSourceMapSchema } from "./dashboard-response.schema";
import { DASHBOARD_SEMANTIC_SOURCE_MAP } from "./dashboard-semantic-source-map.contract";

describe("dashboard semantic source map shared contract", () => {
  it("keeps canonical source map compatible with dashboard public schema", () => {
    const parsed = DashboardSemanticSourceMapSchema.parse(DASHBOARD_SEMANTIC_SOURCE_MAP);

    expect(parsed).toEqual(DASHBOARD_SEMANTIC_SOURCE_MAP);
  });
});