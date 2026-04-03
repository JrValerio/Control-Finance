import { z } from "zod";
import {
  TaxDocumentPreviewBlockingRuleSchema,
  TaxDocumentPreviewSchema,
} from "./tax-document-preview-response.schema";

export const TaxDocumentIngestionStatusSchema = z.enum([
  "ingested",
  "blocked",
]);

export const TaxDocumentExecutionStatusSchema = z.enum([
  "executed",
  "not_requested",
  "not_allowed",
]);

export const TaxDocumentIngestionDecisionSchema = z.object({
  allowed: z.boolean(),
  status: TaxDocumentIngestionStatusSchema,
  documentId: z.number().int().positive().nullable(),
  blockingRules: z.array(TaxDocumentPreviewBlockingRuleSchema),
});

export const TaxDocumentSuggestionDecisionSchema = z.object({
  allowed: z.boolean(),
  sourceLabelSuggestion: z.string().nullable(),
});

export const TaxDocumentExecutionDecisionSchema = z.object({
  requested: z.boolean(),
  allowed: z.boolean(),
  status: TaxDocumentExecutionStatusSchema,
  documentId: z.number().int().positive().nullable(),
  blockingRules: z.array(TaxDocumentPreviewBlockingRuleSchema),
});

export const TaxDocumentIngestionExecutionResponseSchema = z.object({
  preview: TaxDocumentPreviewSchema,
  ingestion: TaxDocumentIngestionDecisionSchema,
  suggestion: TaxDocumentSuggestionDecisionSchema,
  execution: TaxDocumentExecutionDecisionSchema,
});

export type TaxDocumentIngestionStatus = z.infer<
  typeof TaxDocumentIngestionStatusSchema
>;
export type TaxDocumentExecutionStatus = z.infer<
  typeof TaxDocumentExecutionStatusSchema
>;
export type TaxDocumentIngestionDecision = z.infer<
  typeof TaxDocumentIngestionDecisionSchema
>;
export type TaxDocumentSuggestionDecision = z.infer<
  typeof TaxDocumentSuggestionDecisionSchema
>;
export type TaxDocumentExecutionDecision = z.infer<
  typeof TaxDocumentExecutionDecisionSchema
>;
export type TaxDocumentIngestionExecutionResponse = z.infer<
  typeof TaxDocumentIngestionExecutionResponseSchema
>;
