import { describe, expect, it, vi } from "vitest";
import { extractTextFromPdfWithOcr, shouldRunPdfOcrFallback } from "./pdf-ocr.js";

describe("pdf OCR fallback", () => {
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
    });

    expect(text).toContain("PGTO INSS");
    expect(fakeParser.getScreenshot).toHaveBeenCalled();
    expect(createWorkerFn).toHaveBeenCalled();
    expect(fakeWorker.terminate).toHaveBeenCalled();
  });
});
