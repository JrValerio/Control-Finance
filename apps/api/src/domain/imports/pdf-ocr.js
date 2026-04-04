import { PDFParse } from "pdf-parse";

const OCR_LANGUAGES = "por+eng";
const DEFAULT_OCR_TIMEOUT_MS = 20000;
const MIN_OCR_TIMEOUT_MS = 500;

const buildOcrRuntime = ({
  status,
  reasonCode,
  ocrEnabled,
  ocrAttempted,
  timeoutMs,
}) => ({
  status,
  reasonCode,
  ocrEnabled: ocrEnabled === true,
  ocrAttempted: ocrAttempted === true,
  timeoutMs,
});

const createOcrTimeoutError = (timeoutMs) => {
  const error = new Error(`OCR timeout after ${timeoutMs}ms`);
  error.code = "OCR_TIMEOUT";
  return error;
};

const isOcrTimeoutError = (error) => {
  const rawValue = `${error?.code || ""} ${error?.name || ""} ${error?.message || ""}`.toLowerCase();
  return rawValue.includes("timeout") || rawValue.includes("timed out") || rawValue.includes("etimedout");
};

const withTimeout = async (promise, timeoutMs) => {
  let timer = null;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(createOcrTimeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const loadCreateWorker = async () => {
  const tesseractModule = await import("tesseract.js");
  return tesseractModule.createWorker;
};

export const isImportOcrEnabled = (value = process.env.IMPORT_OCR_ENABLED) =>
  String(value || "").trim().toLowerCase() === "true";

export const resolveImportOcrTimeoutMs = (value = process.env.IMPORT_OCR_TIMEOUT_MS) => {
  const rawValue = String(value || "").trim();
  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(parsed) || parsed < MIN_OCR_TIMEOUT_MS) {
    return DEFAULT_OCR_TIMEOUT_MS;
  }

  return parsed;
};

export const shouldRunPdfOcrFallback = (text) => {
  const normalizedText = String(text || "").replace(/\s+/g, " ").trim();

  if (!normalizedText || normalizedText.length < 60) {
    return true;
  }

  const signalCount =
    (normalizedText.match(/\d{2}\/\d{2}\/\d{4}/g) || []).length +
    (normalizedText.match(/\d{2}\/\d{4}/g) || []).length +
    (normalizedText.match(/R\$\s*[\d.,]+/g) || []).length +
    (normalizedText.match(/\b\d[\d.]*,\d{2}\b/g) || []).length;

  return signalCount < 3;
};

export const extractTextFromPdfWithOcrRuntime = async (
  buffer,
  dependencies = {
    PDFParseCtor: PDFParse,
    loadCreateWorkerFn: loadCreateWorker,
    ocrEnabled: isImportOcrEnabled(),
    ocrTimeoutMs: resolveImportOcrTimeoutMs(),
  },
) => {
  const {
    PDFParseCtor,
    createWorkerFn,
    loadCreateWorkerFn,
    ocrEnabled = isImportOcrEnabled(),
    ocrTimeoutMs = resolveImportOcrTimeoutMs(),
  } = dependencies;
  const parser = new PDFParseCtor({ data: buffer });

  try {
    const textResult = await parser.getText();
    const directText = String(textResult?.text || "");

    if (!shouldRunPdfOcrFallback(directText)) {
      return {
        text: directText,
        ocrRuntime: buildOcrRuntime({
          status: "success",
          reasonCode: "direct_text_sufficient",
          ocrEnabled,
          ocrAttempted: false,
          timeoutMs: null,
        }),
      };
    }

    if (!ocrEnabled) {
      return {
        text: directText,
        ocrRuntime: buildOcrRuntime({
          status: "failed",
          reasonCode: "ocr_disabled",
          ocrEnabled,
          ocrAttempted: false,
          timeoutMs: ocrTimeoutMs,
        }),
      };
    }

    const screenshots = await parser.getScreenshot({
      first: 3,
      scale: 2,
      imageDataUrl: false,
      imageBuffer: true,
    });
    const pages = Array.isArray(screenshots?.pages) ? screenshots.pages : [];

    if (pages.length === 0) {
      return {
        text: directText,
        ocrRuntime: buildOcrRuntime({
          status: "failed",
          reasonCode: "ocr_pages_unavailable",
          ocrEnabled,
          ocrAttempted: true,
          timeoutMs: ocrTimeoutMs,
        }),
      };
    }

    const resolvedCreateWorkerFn =
      typeof createWorkerFn === "function"
        ? createWorkerFn
        : await loadCreateWorkerFn();
    const worker = await resolvedCreateWorkerFn(OCR_LANGUAGES);

    try {
      const ocrTexts = [];

      for (const page of pages) {
        const result = await withTimeout(worker.recognize(page.data), ocrTimeoutMs);
        ocrTexts.push(String(result?.data?.text || ""));
      }

      const combinedOcrText = ocrTexts.join("\n").trim();
      if (combinedOcrText) {
        return {
          text: combinedOcrText,
          ocrRuntime: buildOcrRuntime({
            status: "success",
            reasonCode: "ocr_fallback_applied",
            ocrEnabled,
            ocrAttempted: true,
            timeoutMs: ocrTimeoutMs,
          }),
        };
      }

      return {
        text: directText,
        ocrRuntime: buildOcrRuntime({
          status: "failed",
          reasonCode: "ocr_empty_result",
          ocrEnabled,
          ocrAttempted: true,
          timeoutMs: ocrTimeoutMs,
        }),
      };
    } catch (error) {
      if (isOcrTimeoutError(error)) {
        return {
          text: directText,
          ocrRuntime: buildOcrRuntime({
            status: "timeout",
            reasonCode: "ocr_timeout",
            ocrEnabled,
            ocrAttempted: true,
            timeoutMs: ocrTimeoutMs,
          }),
        };
      }

      return {
        text: directText,
        ocrRuntime: buildOcrRuntime({
          status: "failed",
          reasonCode: "ocr_worker_error",
          ocrEnabled,
          ocrAttempted: true,
          timeoutMs: ocrTimeoutMs,
        }),
      };
    } finally {
      await worker.terminate();
    }
  } finally {
    await parser.destroy();
  }
};

export const extractTextFromPdfWithOcr = async (buffer, dependencies) => {
  const result = await extractTextFromPdfWithOcrRuntime(buffer, dependencies);
  return result.text;
};
