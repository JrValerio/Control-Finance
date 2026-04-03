import { resolveApiVersion } from "../config/version.js";
import {
  TAX_DOCUMENT_PROCESSING_STATUSES,
  TAX_DOCUMENT_TYPES,
  TAX_FACT_REVIEW_STATUSES,
  TAX_FACT_TYPES,
  TAX_RULE_FAMILIES,
} from "../domain/tax/tax.constants.js";
import {
  listTaxDocumentSupportMatrix,
  TAX_DOCUMENT_SUPPORT_MATRIX_VERSION,
} from "../domain/tax/tax-document-support-matrix.js";
import { listTaxRuleSeedYears } from "../domain/tax/tax-rules.engine.js";
import { normalizeTaxUserId } from "../domain/tax/tax.validation.js";

export const getTaxBootstrapByUser = async (userId) => {
  normalizeTaxUserId(userId);
  const supportedTaxYears = listTaxRuleSeedYears();
  const documentSupportMatrix = listTaxDocumentSupportMatrix();

  return {
    module: "tax",
    scope: "irpf_mvp",
    apiVersion: resolveApiVersion(),
    documentSupportMatrixVersion: TAX_DOCUMENT_SUPPORT_MATRIX_VERSION,
    supportedTaxYears,
    documentTypes: [...TAX_DOCUMENT_TYPES],
    documentSupportMatrix,
    documentProcessingStatuses: [...TAX_DOCUMENT_PROCESSING_STATUSES],
    factTypes: [...TAX_FACT_TYPES],
    reviewStatuses: [...TAX_FACT_REVIEW_STATUSES],
    ruleFamilies: [...TAX_RULE_FAMILIES],
  };
};
