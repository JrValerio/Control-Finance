import { randomUUID } from "node:crypto";
import { dbQuery } from "../db/index.js";
import { parseCreditCardInvoicePdfForUser } from "./credit-card-invoices.service.js";

const JOB_STATUS_QUEUED = "queued";
const JOB_STATUS_PROCESSING = "processing";
const JOB_STATUS_SUCCEEDED = "succeeded";
const JOB_STATUS_FAILED = "failed";
const DEFAULT_MAX_ATTEMPTS =
  Number.isInteger(Number(process.env.CREDIT_CARD_INVOICE_IMPORT_JOB_MAX_ATTEMPTS)) &&
  Number(process.env.CREDIT_CARD_INVOICE_IMPORT_JOB_MAX_ATTEMPTS) > 0
    ? Number(process.env.CREDIT_CARD_INVOICE_IMPORT_JOB_MAX_ATTEMPTS)
    : 2;

const JOB_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const importJobs = new Map();

const createError = (status, message, extra = {}) => {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
};

const normalizeUserId = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(401, "Usuario nao autenticado.");
  }
  return parsed;
};

const normalizeCardId = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(400, "ID de cartao invalido.");
  }
  return parsed;
};

const normalizeJobId = (value) => {
  const normalized = String(value || "").trim();
  if (!JOB_ID_REGEX.test(normalized)) {
    throw createError(400, "ID de job invalido.");
  }
  return normalized;
};

const assertCreditCardOwnership = async (userId, cardId) => {
  const { rows } = await dbQuery(
    `SELECT id FROM credit_cards WHERE id = $1 AND user_id = $2 AND is_active = true`,
    [cardId, userId],
  );

  if (!rows.length) {
    throw createError(404, "Cartao nao encontrado.");
  }
};

const formatImportJob = (job) => ({
  jobId: job.id,
  creditCardId: job.cardId,
  status: job.status,
  attempts: job.attempts,
  maxAttempts: job.maxAttempts,
  retryAvailable: job.status === JOB_STATUS_FAILED && job.attempts < job.maxAttempts,
  queuedAt: job.queuedAt,
  startedAt: job.startedAt,
  finishedAt: job.finishedAt,
  invoice: job.status === JOB_STATUS_SUCCEEDED ? job.invoice : null,
  error: job.status === JOB_STATUS_FAILED ? job.error : null,
});

const runJobAsync = (jobId) => {
  setTimeout(() => {
    void processImportJob(jobId);
  }, 0);
};

const processImportJob = async (jobId) => {
  const job = importJobs.get(jobId);

  if (!job || job.status !== JOB_STATUS_QUEUED) {
    return;
  }

  job.status = JOB_STATUS_PROCESSING;
  job.startedAt = new Date().toISOString();
  job.finishedAt = null;
  job.attempts += 1;

  try {
    const invoice = await parseCreditCardInvoicePdfForUser(job.userId, job.cardId, job.fileBuffer);
    job.status = JOB_STATUS_SUCCEEDED;
    job.finishedAt = new Date().toISOString();
    job.invoice = invoice;
    job.error = null;
  } catch (error) {
    job.status = JOB_STATUS_FAILED;
    job.finishedAt = new Date().toISOString();
    job.invoice = null;
    job.error = {
      code: String(error?.publicCode || error?.code || "INVOICE_IMPORT_ASYNC_FAILED"),
      message: String(error?.message || "Falha ao processar importacao assincrona de fatura."),
    };
  }
};

const loadJobForUserCard = (userId, cardId, jobId) => {
  const job = importJobs.get(jobId);

  if (!job || job.userId !== userId || job.cardId !== cardId) {
    throw createError(404, "Job de importacao nao encontrado.");
  }

  return job;
};

export const enqueueCreditCardInvoiceImportJobForUser = async (rawUserId, rawCardId, fileBuffer) => {
  const userId = normalizeUserId(rawUserId);
  const cardId = normalizeCardId(rawCardId);

  if (!fileBuffer || fileBuffer.length === 0) {
    throw createError(400, "Arquivo PDF (file) e obrigatorio.");
  }

  await assertCreditCardOwnership(userId, cardId);

  const job = {
    id: randomUUID(),
    userId,
    cardId,
    fileBuffer,
    status: JOB_STATUS_QUEUED,
    attempts: 0,
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
    queuedAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    invoice: null,
    error: null,
  };

  importJobs.set(job.id, job);
  runJobAsync(job.id);

  return formatImportJob(job);
};

export const getCreditCardInvoiceImportJobForUser = async (rawUserId, rawCardId, rawJobId) => {
  const userId = normalizeUserId(rawUserId);
  const cardId = normalizeCardId(rawCardId);
  const jobId = normalizeJobId(rawJobId);

  const job = loadJobForUserCard(userId, cardId, jobId);
  return formatImportJob(job);
};

export const retryCreditCardInvoiceImportJobForUser = async (rawUserId, rawCardId, rawJobId) => {
  const userId = normalizeUserId(rawUserId);
  const cardId = normalizeCardId(rawCardId);
  const jobId = normalizeJobId(rawJobId);

  const job = loadJobForUserCard(userId, cardId, jobId);

  if (job.status !== JOB_STATUS_FAILED) {
    throw createError(409, "Somente jobs com status failed podem ser reenfileirados.");
  }

  if (job.attempts >= job.maxAttempts) {
    throw createError(409, "Limite de tentativas de retry atingido para este job.");
  }

  job.status = JOB_STATUS_QUEUED;
  job.startedAt = null;
  job.finishedAt = null;
  job.error = null;
  runJobAsync(job.id);

  return formatImportJob(job);
};

export const resetCreditCardInvoiceImportJobsForTests = () => {
  importJobs.clear();
};