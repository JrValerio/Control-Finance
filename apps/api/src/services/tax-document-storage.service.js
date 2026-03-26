import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_STORAGE_DIR = path.join(os.tmpdir(), "control-finance", "tax-documents");

const sanitizeFileExtension = (originalFileName) => {
  const extension = path.extname(String(originalFileName || "")).toLowerCase();

  if (!extension) {
    return ".bin";
  }

  return /^[.][a-z0-9]{1,10}$/.test(extension) ? extension : ".bin";
};

const normalizeStorageSegments = (storageKey) => {
  const normalizedKey = String(storageKey || "").replaceAll("\\", "/");
  const segments = normalizedKey.split("/").filter(Boolean);

  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("storageKey invalido.");
  }

  return segments;
};

export const resolveTaxDocumentsStorageDir = () => {
  const configuredDirectory = String(process.env.TAX_DOCUMENTS_STORAGE_DIR || "").trim();

  if (!configuredDirectory) {
    return DEFAULT_STORAGE_DIR;
  }

  return path.resolve(configuredDirectory);
};

export const buildTaxDocumentStorageDescriptor = ({
  userId,
  sha256,
  originalFileName,
}) => {
  const storedFileName = `${sha256}${sanitizeFileExtension(originalFileName)}`;
  const storageKey = path.posix.join(String(userId), storedFileName);

  return {
    storedFileName,
    storageKey,
  };
};

export const resolveTaxDocumentAbsolutePath = (storageKey) => {
  const storageRoot = resolveTaxDocumentsStorageDir();
  const segments = normalizeStorageSegments(storageKey);

  return path.join(storageRoot, ...segments);
};

export const saveTaxDocumentBuffer = async ({
  userId,
  sha256,
  originalFileName,
  buffer,
}) => {
  const descriptor = buildTaxDocumentStorageDescriptor({
    userId,
    sha256,
    originalFileName,
  });
  const absolutePath = resolveTaxDocumentAbsolutePath(descriptor.storageKey);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);

  return {
    ...descriptor,
    absolutePath,
  };
};

export const deleteStoredTaxDocument = async (storageKey) => {
  const absolutePath = resolveTaxDocumentAbsolutePath(storageKey);

  try {
    await fs.unlink(absolutePath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
};
