import { describe, expect, it, vi } from "vitest";
import { createS3TaxDocumentStorageAdapter } from "./tax-document-storage-s3.adapter.js";

class FakePutObjectCommand {
  constructor(input) {
    this.input = input;
  }
}

class FakeGetObjectCommand {
  constructor(input) {
    this.input = input;
  }
}

class FakeDeleteObjectCommand {
  constructor(input) {
    this.input = input;
  }
}

describe("tax-document-storage-s3.adapter", () => {
  it("falha quando bucket remoto nao foi configurado", () => {
    expect(() =>
      createS3TaxDocumentStorageAdapter({
        TAX_DOCUMENTS_STORAGE_ADAPTER: "s3",
        TAX_DOCUMENTS_REMOTE_REGION: "us-east-1",
      }),
    ).toThrow("TAX_DOCUMENTS_REMOTE_BUCKET is required");
  });

  it("salva, le e remove documento no backend s3 configurado", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Body: {
          transformToByteArray: async () =>
            Uint8Array.from(Buffer.from("conteudo-remoto", "utf8")),
        },
      })
      .mockResolvedValueOnce({});

    const adapter = createS3TaxDocumentStorageAdapter(
      {
        TAX_DOCUMENTS_STORAGE_ADAPTER: "s3",
        TAX_DOCUMENTS_REMOTE_BUCKET: "control-finance-tax",
        TAX_DOCUMENTS_REMOTE_REGION: "us-east-1",
      },
      {
        s3Client: { send },
        PutObjectCommandCtor: FakePutObjectCommand,
        GetObjectCommandCtor: FakeGetObjectCommand,
        DeleteObjectCommandCtor: FakeDeleteObjectCommand,
      },
    );

    const absolutePath = adapter.resolveAbsolutePath("42/abc.pdf");
    expect(absolutePath).toBe("s3://control-finance-tax/42/abc.pdf");

    await adapter.saveDocument({
      storageKey: "42/abc.pdf",
      buffer: Buffer.from("conteudo-remoto", "utf8"),
    });

    const loaded = await adapter.readDocument({ storageKey: "42/abc.pdf" });
    expect(loaded.toString("utf8")).toBe("conteudo-remoto");

    await adapter.deleteDocument({ storageKey: "42/abc.pdf" });

    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[0][0].input).toMatchObject({
      Bucket: "control-finance-tax",
      Key: "42/abc.pdf",
    });
    expect(send.mock.calls[1][0].input).toMatchObject({
      Bucket: "control-finance-tax",
      Key: "42/abc.pdf",
    });
    expect(send.mock.calls[2][0].input).toMatchObject({
      Bucket: "control-finance-tax",
      Key: "42/abc.pdf",
    });
  });
});
