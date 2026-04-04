const HIGH_CONFIDENCE_SCORE = 0.9;
const LOW_CONFIDENCE_SCORE = 0.45;

const normalizeJsonObject = (value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return {};
    }
  }

  return {};
};

export const resolveInvoiceClassificationSignals = ({ parseConfidence, parseMetadata }) => {
  const normalizedParseConfidence = String(parseConfidence || "").trim().toLowerCase() === "high" ? "high" : "low";
  const normalizedParseMetadata = normalizeJsonObject(parseMetadata);
  const reviewContext = normalizeJsonObject(normalizedParseMetadata.reviewContext);
  const reasonCodes = Array.isArray(reviewContext.reasonCodes)
    ? reviewContext.reasonCodes
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
    : [];

  const classificationAmbiguous =
    reviewContext.needsReview === true || normalizedParseConfidence !== "high" || reasonCodes.length > 0;

  const reasonCode = classificationAmbiguous
    ? reasonCodes[0] || (normalizedParseConfidence === "low" ? "parse_confidence_low" : "manual_review_required")
    : "not_ambiguous";

  return {
    classificationConfidence: normalizedParseConfidence === "high" ? HIGH_CONFIDENCE_SCORE : LOW_CONFIDENCE_SCORE,
    classificationAmbiguous,
    reasonCode,
    requiresUserConfirmation: classificationAmbiguous,
    parseMetadata: normalizedParseMetadata,
  };
};