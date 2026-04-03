import { z } from "zod";

export const TaxDocumentPreviewSourceTypeSchema = z.enum([
  "income",
  "deduction",
  "debt",
  "support",
  "unknown",
]);

export const TaxDocumentPreviewDocumentTypeSchema = z.enum([
  "unknown",
  "income_report_bank",
  "income_report_employer",
  "clt_payslip",
  "income_report_inss",
  "medical_statement",
  "education_receipt",
  "loan_statement",
  "bank_statement_support",
]);

export const TaxDocumentPreviewTextSourceSchema = z.enum([
  "csv_text",
  "pdf_text",
  "pdf_text_error",
  "image_text_pending",
  "unsupported_text_source",
]);

export const TaxDocumentPreviewSchema = z.object({
  sourceType: TaxDocumentPreviewSourceTypeSchema,
  documentType: TaxDocumentPreviewDocumentTypeSchema,
  confidenceScore: z.number().min(0).max(1),
  extractorAvailable: z.boolean(),
  sourceLabelSuggestion: z.string().nullable(),
  reasons: z.array(z.string()),
  warnings: z.array(z.string()),
  textSource: TaxDocumentPreviewTextSourceSchema,
  textPreviewLines: z.array(z.string()),
});

export const TaxDocumentPreviewResponseSchema = z.object({
  preview: TaxDocumentPreviewSchema,
});

export type TaxDocumentPreviewSourceType = z.infer<
  typeof TaxDocumentPreviewSourceTypeSchema
>;
export type TaxDocumentPreviewDocumentType = z.infer<
  typeof TaxDocumentPreviewDocumentTypeSchema
>;
export type TaxDocumentPreviewTextSource = z.infer<
  typeof TaxDocumentPreviewTextSourceSchema
>;
export type TaxDocumentPreview = z.infer<typeof TaxDocumentPreviewSchema>;
export type TaxDocumentPreviewResponse = z.infer<
  typeof TaxDocumentPreviewResponseSchema
>;