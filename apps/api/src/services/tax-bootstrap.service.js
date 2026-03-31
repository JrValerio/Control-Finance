import { resolveApiVersion } from "../config/version.js";
import {
  TAX_DOCUMENT_PROCESSING_STATUSES,
  TAX_DOCUMENT_TYPES,
  TAX_FACT_REVIEW_STATUSES,
  TAX_FACT_TYPES,
  TAX_RULE_FAMILIES,
} from "../domain/tax/tax.constants.js";
import { listTaxRuleSeedYears } from "../domain/tax/tax-rules.engine.js";
import { normalizeTaxUserId } from "../domain/tax/tax.validation.js";

export const getTaxBootstrapByUser = async (userId) => {
  normalizeTaxUserId(userId);
  const supportedTaxYears = listTaxRuleSeedYears();

  return {
    module: "tax",
    scope: "irpf_mvp",
    apiVersion: resolveApiVersion(),
    supportedTaxYears,
    documentTypes: [...TAX_DOCUMENT_TYPES],
    documentProcessingStatuses: [...TAX_DOCUMENT_PROCESSING_STATUSES],
    factTypes: [...TAX_FACT_TYPES],
    reviewStatuses: [...TAX_FACT_REVIEW_STATUSES],
    ruleFamilies: [...TAX_RULE_FAMILIES],
  };
};
