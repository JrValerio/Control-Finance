import { logError, logInfo } from "./logger.js";

const METRIC_NAMES = {
  dryRunTotal: "import_dry_run_total",
  dryRunSemanticDriftTotal: "import_dry_run_semantic_drift_total",
  dryRunUtilityGateBlockedTotal: "import_dry_run_utility_gate_blocked_total",
  dryRunUtilityGateSupportedTotal: "import_dry_run_utility_gate_supported_total",
  commitTotal: "import_commit_total",
  commitSuccessTotal: "import_commit_success_total",
  commitFailTotal: "import_commit_fail_total",
  rowsTotal: "import_rows_total",
  rowsSamples: "import_rows_samples",
};

const importMetricsState = {
  [METRIC_NAMES.dryRunTotal]: 0,
  [METRIC_NAMES.dryRunSemanticDriftTotal]: 0,
  [METRIC_NAMES.dryRunUtilityGateBlockedTotal]: 0,
  [METRIC_NAMES.dryRunUtilityGateSupportedTotal]: 0,
  [METRIC_NAMES.commitTotal]: 0,
  [METRIC_NAMES.commitSuccessTotal]: 0,
  [METRIC_NAMES.commitFailTotal]: 0,
  [METRIC_NAMES.rowsTotal]: 0,
  [METRIC_NAMES.rowsSamples]: 0,
};

const toNonNegativeInteger = (value, fallbackValue = 0) => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    return fallbackValue;
  }

  return parsedValue;
};

const incrementMetric = (metricName, incrementValue = 1) => {
  importMetricsState[metricName] += toNonNegativeInteger(incrementValue, 0);
};

const observeRows = (rowsCount) => {
  const normalizedRowsCount = toNonNegativeInteger(rowsCount, 0);

  incrementMetric(METRIC_NAMES.rowsTotal, normalizedRowsCount);
  incrementMetric(METRIC_NAMES.rowsSamples, 1);
};

const shouldEmitImportLogs = () => {
  if (process.env.NODE_ENV !== "test") {
    return true;
  }

  return String(process.env.LOG_IMPORT_EVENTS_IN_TEST || "").trim().toLowerCase() === "true";
};

export const getImportMetricsSnapshot = () => {
  const rowsSamples = importMetricsState[METRIC_NAMES.rowsSamples];
  const rowsAverage =
    rowsSamples > 0
      ? Number((importMetricsState[METRIC_NAMES.rowsTotal] / rowsSamples).toFixed(2))
      : 0;

  return {
    import_dry_run_total: importMetricsState[METRIC_NAMES.dryRunTotal],
    import_dry_run_semantic_drift_total:
      importMetricsState[METRIC_NAMES.dryRunSemanticDriftTotal],
    import_dry_run_utility_gate_blocked_total:
      importMetricsState[METRIC_NAMES.dryRunUtilityGateBlockedTotal],
    import_dry_run_utility_gate_supported_total:
      importMetricsState[METRIC_NAMES.dryRunUtilityGateSupportedTotal],
    import_commit_total: importMetricsState[METRIC_NAMES.commitTotal],
    import_commit_success_total: importMetricsState[METRIC_NAMES.commitSuccessTotal],
    import_commit_fail_total: importMetricsState[METRIC_NAMES.commitFailTotal],
    import_rows_avg: rowsAverage,
  };
};

export const createElapsedTimer = () => {
  const startedAt = Date.now();

  return () => {
    return Date.now() - startedAt;
  };
};

export const trackDryRunMetrics = ({ rowsTotal = 0 } = {}) => {
  incrementMetric(METRIC_NAMES.dryRunTotal);
  observeRows(rowsTotal);
};

export const trackDryRunSemanticDriftMetrics = ({ driftDetected = false } = {}) => {
  if (!driftDetected) {
    return;
  }

  incrementMetric(METRIC_NAMES.dryRunSemanticDriftTotal);
};

export const trackDryRunUtilityGateDecisionMetrics = ({ decision = null } = {}) => {
  if (decision === "blocked") {
    incrementMetric(METRIC_NAMES.dryRunUtilityGateBlockedTotal);
    return;
  }

  if (decision === "supported") {
    incrementMetric(METRIC_NAMES.dryRunUtilityGateSupportedTotal);
  }
};

export const trackCommitAttemptMetrics = () => {
  incrementMetric(METRIC_NAMES.commitTotal);
};

export const trackCommitSuccessMetrics = ({ rowsImported = 0 } = {}) => {
  incrementMetric(METRIC_NAMES.commitSuccessTotal);
  observeRows(rowsImported);
};

export const trackCommitFailMetrics = () => {
  incrementMetric(METRIC_NAMES.commitFailTotal);
};

export const logImportEvent = (eventName, payload = {}) => {
  if (!shouldEmitImportLogs()) {
    return;
  }

  const structuredLogPayload = {
    scope: "import",
    event: String(eventName || "unknown"),
    timestamp: new Date().toISOString(),
    ...payload,
    metrics: getImportMetricsSnapshot(),
  };

  if (String(eventName || "").toLowerCase().includes("error")) {
    logError(structuredLogPayload);
    return;
  }

  logInfo(structuredLogPayload);
};

export const resetImportObservabilityForTests = () => {
  Object.keys(importMetricsState).forEach((metricName) => {
    importMetricsState[metricName] = 0;
  });
};
