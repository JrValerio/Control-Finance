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

export const TaxDocumentAuditStepSchema = z.enum([
  "detected",
  "blocked",
  "suggested",
  "executed",
]);

export const TaxDocumentAuditOutcomeSchema = z.enum([
  "allowed",
  "blocked",
  "skipped",
  "executed",
]);

export const TaxDocumentAuditEntrySchema = z.object({
  step: TaxDocumentAuditStepSchema,
  outcome: TaxDocumentAuditOutcomeSchema,
  sourceType: TaxDocumentPreviewSchema.shape.sourceType,
  documentId: z.number().int().positive().nullable(),
  reasonCodes: z.array(z.string()),
  reasonMessage: z.string().min(1),
});

export const TaxDocumentTransparencyDetectedSchema = z.object({
  sourceType: TaxDocumentPreviewSchema.shape.sourceType,
  documentType: TaxDocumentPreviewSchema.shape.documentType,
  detectedState: TaxDocumentPreviewSchema.shape.detectedState,
  reasonCodes: z.array(z.string()),
});

export const TaxDocumentTransparencyBlockedSchema = z.object({
  hasBlockingRules: z.boolean(),
  rules: z.array(TaxDocumentPreviewBlockingRuleSchema),
});

export const TaxDocumentTransparencySuggestedSchema = z.object({
  allowed: z.boolean(),
  sourceLabelSuggestion: z.string().nullable(),
  reasonCodes: z.array(z.string()),
});

export const TaxDocumentTransparencyExecutedSchema = z.object({
  requested: z.boolean(),
  allowed: z.boolean(),
  status: TaxDocumentExecutionStatusSchema,
  reasonCodes: z.array(z.string()),
});

export const TaxDocumentTransparencySchema = z.object({
  detected: TaxDocumentTransparencyDetectedSchema,
  blocked: TaxDocumentTransparencyBlockedSchema,
  suggested: TaxDocumentTransparencySuggestedSchema,
  executed: TaxDocumentTransparencyExecutedSchema,
});

export const TaxDocumentIngestionExecutionResponseSchema = z.object({
  preview: TaxDocumentPreviewSchema,
  ingestion: TaxDocumentIngestionDecisionSchema,
  suggestion: TaxDocumentSuggestionDecisionSchema,
  execution: TaxDocumentExecutionDecisionSchema,
  transparency: TaxDocumentTransparencySchema,
  auditTrail: z.array(TaxDocumentAuditEntrySchema),
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
export type TaxDocumentAuditStep = z.infer<typeof TaxDocumentAuditStepSchema>;
export type TaxDocumentAuditOutcome = z.infer<
  typeof TaxDocumentAuditOutcomeSchema
>;
export type TaxDocumentAuditEntry = z.infer<typeof TaxDocumentAuditEntrySchema>;
export type TaxDocumentTransparencyDetected = z.infer<
  typeof TaxDocumentTransparencyDetectedSchema
>;
export type TaxDocumentTransparencyBlocked = z.infer<
  typeof TaxDocumentTransparencyBlockedSchema
>;
export type TaxDocumentTransparencySuggested = z.infer<
  typeof TaxDocumentTransparencySuggestedSchema
>;
export type TaxDocumentTransparencyExecuted = z.infer<
  typeof TaxDocumentTransparencyExecutedSchema
>;
export type TaxDocumentTransparency = z.infer<
  typeof TaxDocumentTransparencySchema
>;
export type TaxDocumentIngestionExecutionResponse = z.infer<
  typeof TaxDocumentIngestionExecutionResponseSchema
>;
