import { Counter } from "prom-client";
import { metricsRegistry } from "./http-metrics.js";

const domainFinancialFlowEventsCounter = new Counter({
  name: "domain_financial_flow_events_total",
  help: "Total de eventos de dominio nos fluxos financeiros por operacao e resultado.",
  labelNames: ["flow", "operation", "outcome"],
  registers: [metricsRegistry],
});

const domainFinancialFlowRecordsCounter = new Counter({
  name: "domain_financial_flow_records_total",
  help: "Total de registros afetados por operacoes de dominio nos fluxos financeiros.",
  labelNames: ["flow", "operation"],
  registers: [metricsRegistry],
});

const documentFinancialObservabilityEventsCounter = new Counter({
  name: "document_financial_observability_events_total",
  help: "Total de sinais de observabilidade documental/financeira por tipo de sinal e classificacao controlada.",
  labelNames: ["source", "signal", "reason_class"],
  registers: [metricsRegistry],
});

const DOCUMENT_OBSERVABILITY_SOURCES = new Set([
  "transactions_import",
  "tax_documents",
  "unknown",
]);

const DOCUMENT_OBSERVABILITY_SIGNALS = new Set([
  "parse_attempt",
  "parse_failure",
  "sensitive_mutation_success",
]);

const DOCUMENT_OBSERVABILITY_REASON_CLASSES = new Set([
  "none",
  "validation",
  "limit",
  "internal",
]);

const toSafeMetricValue = (value) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return parsed;
};

export const trackDomainFlowEvent = ({ flow, operation, outcome }) => {
  if (!flow || !operation || !outcome) {
    return;
  }

  domainFinancialFlowEventsCounter.inc({ flow, operation, outcome });
};

export const trackDomainFlowRecords = ({ flow, operation, records = 1 }) => {
  if (!flow || !operation) {
    return;
  }

  const safeRecords = toSafeMetricValue(records);

  if (safeRecords === 0) {
    return;
  }

  domainFinancialFlowRecordsCounter.inc({ flow, operation }, safeRecords);
};

export const trackDomainFlowSuccess = ({ flow, operation, records = 1 }) => {
  trackDomainFlowEvent({ flow, operation, outcome: "success" });
  trackDomainFlowRecords({ flow, operation, records });
};

export const trackDomainFlowError = ({ flow, operation }) => {
  trackDomainFlowEvent({ flow, operation, outcome: "error" });
};

const normalizeDocumentObservabilitySource = (source) => {
  if (typeof source !== "string") {
    return "unknown";
  }

  return DOCUMENT_OBSERVABILITY_SOURCES.has(source) ? source : "unknown";
};

const normalizeDocumentObservabilitySignal = (signal) => {
  if (typeof signal !== "string") {
    return null;
  }

  return DOCUMENT_OBSERVABILITY_SIGNALS.has(signal) ? signal : null;
};

const normalizeDocumentObservabilityReasonClass = (reasonClass) => {
  if (typeof reasonClass !== "string") {
    return "none";
  }

  return DOCUMENT_OBSERVABILITY_REASON_CLASSES.has(reasonClass) ? reasonClass : "internal";
};

export const classifyDocumentObservabilityReasonClass = (error) => {
  const status = Number(error?.status);

  if (status === 413) {
    return "limit";
  }

  if (status >= 400 && status < 500) {
    return "validation";
  }

  return "internal";
};

export const trackDocumentObservabilityEvent = ({
  source,
  signal,
  reasonClass = "none",
}) => {
  const normalizedSignal = normalizeDocumentObservabilitySignal(signal);

  if (!normalizedSignal) {
    return;
  }

  documentFinancialObservabilityEventsCounter.inc({
    source: normalizeDocumentObservabilitySource(source),
    signal: normalizedSignal,
    reason_class: normalizeDocumentObservabilityReasonClass(reasonClass),
  });
};
