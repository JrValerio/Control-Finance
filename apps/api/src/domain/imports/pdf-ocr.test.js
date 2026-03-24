import { describe, expect, it, vi } from "vitest";
import {
  extractTextFromPdfWithOcr,
  isImportOcrEnabled,
  shouldRunPdfOcrFallback,
} from "./pdf-ocr.js";

describe("pdf OCR fallback", () => {
  it("IMPORT_OCR_ENABLED vem desligado por padrao", () => {
    expect(isImportOcrEnabled(undefined)).toBe(false);
    expect(isImportOcrEnabled("false")).toBe(false);
    expect(isImportOcrEnabled("true")).toBe(true);
  });

  it("nao roda OCR quando texto nativo do PDF ja parece utilizavel", () => {
    const shouldRun = shouldRunPdfOcrFallback(
      "05/02/2026 PGTO INSS 01776829899 2.812,99 06/02/2026 PIX QRS UBER DO BRA -15,98 R$ 2.812,99",
    );

    expect(shouldRun).toBe(false);
  });

  it("roda OCR quando a extracao de texto vem pobre ou ilegivel", () => {
    const shouldRun = shouldRunPdfOcrFallback("abc 123");

    expect(shouldRun).toBe(true);
  });

  it("nao carrega o worker de OCR quando o texto direto ja resolve", async () => {
    const fakeParser = {
      getText: vi.fn().mockResolvedValue({
        text: "05/02/2026 PGTO INSS 01776829899 2.812,99 06/02/2026 PIX QRS UBER DO BRA -15,98",
      }),
      getScreenshot: vi.fn(),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    const PDFParseCtor = vi.fn(() => fakeParser);
    const loadCreateWorkerFn = vi.fn();

    const text = await extractTextFromPdfWithOcr(Buffer.from("fake-pdf"), {
      PDFParseCtor,
      loadCreateWorkerFn,
    });

    expect(text).toContain("PGTO INSS");
    expect(fakeParser.getScreenshot).not.toHaveBeenCalled();
    expect(loadCreateWorkerFn).not.toHaveBeenCalled();
  });

  it("retorna texto direto sem tentar OCR quando a flag esta desligada", async () => {
    const fakeParser = {
      getText: vi.fn().mockResolvedValue({ text: "abc 123" }),
      getScreenshot: vi.fn(),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    const PDFParseCtor = vi.fn(() => fakeParser);
    const loadCreateWorkerFn = vi.fn();

    const text = await extractTextFromPdfWithOcr(Buffer.from("fake-pdf"), {
      PDFParseCtor,
      loadCreateWorkerFn,
      ocrEnabled: false,
    });

    expect(text).toBe("abc 123");
    expect(fakeParser.getScreenshot).not.toHaveBeenCalled();
    expect(loadCreateWorkerFn).not.toHaveBeenCalled();
  });

  it("propaga erro quando getText lanca e ainda destroi o parser", async () => {
    const fakeParser = {
      getText: vi.fn().mockRejectedValue(new Error("PDF corrompido")),
      getScreenshot: vi.fn(),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    const PDFParseCtor = vi.fn(() => fakeParser);

    await expect(
      extractTextFromPdfWithOcr(Buffer.from("fake-pdf"), { PDFParseCtor }),
    ).rejects.toThrow("PDF corrompido");

    expect(fakeParser.destroy).toHaveBeenCalled();
    expect(fakeParser.getScreenshot).not.toHaveBeenCalled();
  });

  it("retorna texto direto quando getScreenshot retorna pages vazias", async () => {
    const fakeParser = {
      getText: vi.fn().mockResolvedValue({ text: "abc 123" }),
      getScreenshot: vi.fn().mockResolvedValue({ pages: [] }),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    const PDFParseCtor = vi.fn(() => fakeParser);

    const text = await extractTextFromPdfWithOcr(Buffer.from("fake-pdf"), {
      PDFParseCtor,
      ocrEnabled: true,
    });

    expect(text).toBe("abc 123");
    expect(fakeParser.getScreenshot).toHaveBeenCalled();
  });

  it("usa texto direto como fallback quando OCR retorna texto vazio", async () => {
    const fakeParser = {
      getText: vi.fn().mockResolvedValue({ text: "abc 123" }),
      getScreenshot: vi.fn().mockResolvedValue({
        pages: [{ data: Buffer.from("fake-page") }],
      }),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    const fakeWorker = {
      recognize: vi.fn().mockResolvedValue({ data: { text: "" } }),
      terminate: vi.fn().mockResolvedValue(undefined),
    };
    const PDFParseCtor = vi.fn(() => fakeParser);
    const createWorkerFn = vi.fn().mockResolvedValue(fakeWorker);

    const text = await extractTextFromPdfWithOcr(Buffer.from("fake-pdf"), {
      PDFParseCtor,
      createWorkerFn,
      ocrEnabled: true,
    });

    expect(text).toBe("abc 123");
    expect(fakeWorker.terminate).toHaveBeenCalled();
  });

  it("usa OCR como fallback quando texto direto nao e suficiente", async () => {
    const fakeParser = {
      getText: vi.fn().mockResolvedValue({ text: "abc 123" }),
      getScreenshot: vi.fn().mockResolvedValue({
        pages: [{ data: Buffer.from("fake-image") }],
      }),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    const fakeWorker = {
      recognize: vi.fn().mockResolvedValue({
        data: { text: "05/02/2026 PGTO INSS 01776829899 2.812,99" },
      }),
      terminate: vi.fn().mockResolvedValue(undefined),
    };
    const PDFParseCtor = vi.fn(() => fakeParser);
    const createWorkerFn = vi.fn().mockResolvedValue(fakeWorker);

    const text = await extractTextFromPdfWithOcr(Buffer.from("fake-pdf"), {
      PDFParseCtor,
      createWorkerFn,
      ocrEnabled: true,
    });

    expect(text).toContain("PGTO INSS");
    expect(fakeParser.getScreenshot).toHaveBeenCalled();
    expect(createWorkerFn).toHaveBeenCalled();
    expect(fakeWorker.terminate).toHaveBeenCalled();
  });
});
