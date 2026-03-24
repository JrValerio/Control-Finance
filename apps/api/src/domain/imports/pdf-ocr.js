import { PDFParse } from "pdf-parse";

const OCR_LANGUAGES = "por+eng";

const loadCreateWorker = async () => {
  const tesseractModule = await import("tesseract.js");
  return tesseractModule.createWorker;
};

export const isImportOcrEnabled = (value = process.env.IMPORT_OCR_ENABLED) =>
  String(value || "").trim().toLowerCase() === "true";

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

export const extractTextFromPdfWithOcr = async (
  buffer,
  dependencies = {
    PDFParseCtor: PDFParse,
    loadCreateWorkerFn: loadCreateWorker,
    ocrEnabled: isImportOcrEnabled(),
  },
) => {
  const {
    PDFParseCtor,
    createWorkerFn,
    loadCreateWorkerFn,
    ocrEnabled = isImportOcrEnabled(),
  } = dependencies;
  const parser = new PDFParseCtor({ data: buffer });

  try {
    const textResult = await parser.getText();
    const directText = String(textResult?.text || "");

    if (!shouldRunPdfOcrFallback(directText) || !ocrEnabled) {
      return directText;
    }

    const screenshots = await parser.getScreenshot({
      first: 3,
      scale: 2,
      imageDataUrl: false,
      imageBuffer: true,
    });
    const pages = Array.isArray(screenshots?.pages) ? screenshots.pages : [];

    if (pages.length === 0) {
      return directText;
    }

    const resolvedCreateWorkerFn =
      typeof createWorkerFn === "function"
        ? createWorkerFn
        : await loadCreateWorkerFn();
    const worker = await resolvedCreateWorkerFn(OCR_LANGUAGES);

    try {
      const ocrTexts = [];

      for (const page of pages) {
        const result = await worker.recognize(page.data);
        ocrTexts.push(String(result?.data?.text || ""));
      }

      const combinedOcrText = ocrTexts.join("\n").trim();
      return combinedOcrText || directText;
    } finally {
      await worker.terminate();
    }
  } finally {
    await parser.destroy();
  }
};
