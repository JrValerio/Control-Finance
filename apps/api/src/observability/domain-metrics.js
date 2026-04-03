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
