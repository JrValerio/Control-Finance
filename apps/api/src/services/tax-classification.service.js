import path from "node:path";
import { classifyTaxDocument } from "../domain/tax/tax-document-classifier.js";
import { readStoredTaxDocumentBuffer } from "./tax-document-storage.service.js";
import { extractTextFromPdfBuffer } from "../domain/imports/statement-import.js";

const TEXT_PREVIEW_LINE_LIMIT = 6;

const getTextPreviewLines = (text) =>
  String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, TEXT_PREVIEW_LINE_LIMIT);

const extractTaxDocumentText = async ({ buffer, originalFileName }) => {
  const extension = path.extname(String(originalFileName || "")).toLowerCase();

  if (extension === ".csv") {
    return {
      text: buffer.toString("utf8"),
      textSource: "csv_text",
      warnings: [],
    };
  }

  if (extension === ".pdf") {
    try {
      const text = await extractTextFromPdfBuffer(buffer);
      return {
        text,
        textSource: "pdf_text",
        warnings: [],
      };
    } catch {
      return {
        text: "",
        textSource: "pdf_text_error",
        warnings: ["pdf_text_extraction_failed"],
      };
    }
  }

  if (extension === ".png" || extension === ".jpg" || extension === ".jpeg") {
    return {
      text: "",
      textSource: "image_text_pending",
      warnings: ["image_ocr_pending"],
    };
  }

  return {
    text: "",
    textSource: "unsupported_text_source",
    warnings: ["unsupported_text_source"],
  };
};

export const classifyStoredTaxDocument = async (documentRecord) => {
  const buffer = await readStoredTaxDocumentBuffer(documentRecord.storage_key);
  const textResult = await extractTaxDocumentText({
    buffer,
    originalFileName: documentRecord.original_file_name,
  });
  const classification = classifyTaxDocument({
    text: textResult.text,
    originalFileName: documentRecord.original_file_name,
  });

  return {
    ...classification,
    text: textResult.text,
    textSource: textResult.textSource,
    classificationPayload: {
      documentType: classification.documentType,
      confidenceScore: classification.confidenceScore,
      reasons: classification.reasons,
      sourceLabelSuggestion: classification.sourceLabelSuggestion,
      textSource: textResult.textSource,
      textLength: String(textResult.text || "").length,
      textPreviewLines: getTextPreviewLines(textResult.text),
    },
    warnings: [...classification.warnings, ...textResult.warnings],
  };
};
