import { describe, expect, it } from "vitest";
import { resolveInvoiceClassificationSignals } from "./credit-card-invoice-classification.service.js";

describe("credit-card-invoice classification service", () => {
  it("returns non-ambiguous classification for high confidence without review signals", () => {
    const result = resolveInvoiceClassificationSignals({
      parseConfidence: "high",
      parseMetadata: {
        reviewContext: {
          needsReview: false,
          reasonCodes: [],
        },
      },
    });

    expect(result).toEqual({
      classificationConfidence: 0.9,
      classificationAmbiguous: false,
      reasonCode: "not_ambiguous",
      requiresUserConfirmation: false,
      parseMetadata: {
        reviewContext: {
          needsReview: false,
          reasonCodes: [],
        },
      },
    });
  });

  it("keeps low confidence fallback reason when no explicit review reason exists", () => {
    const result = resolveInvoiceClassificationSignals({
      parseConfidence: "LOW",
      parseMetadata: {
        reviewContext: {
          needsReview: false,
          reasonCodes: [],
        },
      },
    });

    expect(result).toMatchObject({
      classificationConfidence: 0.45,
      classificationAmbiguous: true,
      reasonCode: "parse_confidence_low",
      requiresUserConfirmation: true,
    });
  });

  it("prioritizes normalized review reason codes over fallback reason", () => {
    const result = resolveInvoiceClassificationSignals({
      parseConfidence: "high",
      parseMetadata: JSON.stringify({
        reviewContext: {
          needsReview: false,
          reasonCodes: [" Period_Inferred_From_Closing_Day ", ""],
        },
      }),
    });

    expect(result).toMatchObject({
      classificationConfidence: 0.9,
      classificationAmbiguous: true,
      reasonCode: "period_inferred_from_closing_day",
      requiresUserConfirmation: true,
    });
  });

  it("falls back to empty metadata for invalid serialized payload", () => {
    const result = resolveInvoiceClassificationSignals({
      parseConfidence: "high",
      parseMetadata: "{invalid-json",
    });

    expect(result).toEqual({
      classificationConfidence: 0.9,
      classificationAmbiguous: false,
      reasonCode: "not_ambiguous",
      requiresUserConfirmation: false,
      parseMetadata: {},
    });
  });
});