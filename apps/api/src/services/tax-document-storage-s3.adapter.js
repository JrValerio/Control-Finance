import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { normalizeTaxDocumentStorageSegments } from "./tax-document-storage.policy.js";
import { resolveRemoteTaxDocumentsStorageConfig } from "./tax-document-storage-remote.config.js";

const bufferFromStreamBody = async (body) => {
  if (!body) {
    return Buffer.alloc(0);
  }

  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  if (typeof body?.transformToByteArray === "function") {
    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes);
  }

  if (typeof body[Symbol.asyncIterator] === "function") {
    const chunks = [];

    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  throw new Error("Unsupported S3 body stream format.");
};

export const createS3TaxDocumentStorageAdapter = (
  env = process.env,
  dependencies = {},
) => {
  const remoteConfig = resolveRemoteTaxDocumentsStorageConfig(env);
  const createS3ClientFn =
    dependencies.createS3ClientFn ||
    ((config) =>
      new S3Client({
        region: config.region,
        endpoint: config.endpoint || undefined,
        forcePathStyle: config.forcePathStyle,
        credentials: config.credentials || undefined,
      }));

  const PutObjectCommandCtor =
    dependencies.PutObjectCommandCtor || PutObjectCommand;
  const GetObjectCommandCtor =
    dependencies.GetObjectCommandCtor || GetObjectCommand;
  const DeleteObjectCommandCtor =
    dependencies.DeleteObjectCommandCtor || DeleteObjectCommand;

  const s3Client = dependencies.s3Client || createS3ClientFn(remoteConfig);

  const resolveAbsolutePath = (storageKey) => {
    const segments = normalizeTaxDocumentStorageSegments(storageKey);
    return `s3://${remoteConfig.bucket}/${segments.join("/")}`;
  };

  return {
    name: "s3",
    resolveAbsolutePath,
    async saveDocument({ storageKey, buffer }) {
      normalizeTaxDocumentStorageSegments(storageKey);

      await s3Client.send(
        new PutObjectCommandCtor({
          Bucket: remoteConfig.bucket,
          Key: storageKey,
          Body: buffer,
        }),
      );

      return {
        absolutePath: resolveAbsolutePath(storageKey),
      };
    },
    async readDocument({ storageKey }) {
      normalizeTaxDocumentStorageSegments(storageKey);

      const response = await s3Client.send(
        new GetObjectCommandCtor({
          Bucket: remoteConfig.bucket,
          Key: storageKey,
        }),
      );

      return bufferFromStreamBody(response?.Body);
    },
    async deleteDocument({ storageKey }) {
      normalizeTaxDocumentStorageSegments(storageKey);

      await s3Client.send(
        new DeleteObjectCommandCtor({
          Bucket: remoteConfig.bucket,
          Key: storageKey,
        }),
      );
    },
  };
};
