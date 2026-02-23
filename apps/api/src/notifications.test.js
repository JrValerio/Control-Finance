import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import {
  setupTestDb,
  registerAndLogin,
  getUserIdByEmail,
} from "./test-helpers.js";
import { resetLoginProtectionState } from "./middlewares/login-protection.middleware.js";
import {
  resetImportRateLimiterState,
  resetWriteRateLimiterState,
} from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";
import {
  maybeSendFlipNotification,
  maybeSendPaydayReminder,
  daysUntilNextPayday,
} from "./services/notifications.service.js";

// Mock email sending — tests must not hit real SMTP
vi.mock("./services/email.service.js", () => ({
  sendFlipNegEmail: vi.fn().mockResolvedValue(undefined),
  sendPaydayReminderEmail: vi.fn().mockResolvedValue(undefined),
  FLIP_NEG_COOLDOWN: 24 * 60 * 60 * 1000,
}));

import { sendFlipNegEmail, sendPaydayReminderEmail } from "./services/email.service.js";

const FIXED_NOW = new Date("2026-03-10T12:00:00.000Z");
const FIXED_MONTH = "2026-03";

const resetState = async () => {
  resetLoginProtectionState();
  resetImportRateLimiterState();
  resetWriteRateLimiterState();
  resetHttpMetricsForTests();
  await dbQuery("DELETE FROM email_notifications");
  await dbQuery("DELETE FROM user_profiles");
  await dbQuery("DELETE FROM transactions");
  await dbQuery("DELETE FROM user_identities");
  await dbQuery("DELETE FROM users");
};

describe("daysUntilNextPayday", () => {
  it("retorna 5 quando payday esta 5 dias adiante em UTC", () => {
    // UTC day = 10, payday = 15 → March 15 00:00 UTC - March 10 00:00 UTC = 5 days exactly
    const ref = new Date("2026-03-10T00:00:00.000Z");
    expect(daysUntilNextPayday(15, ref)).toBe(5);
  });

  it("retorna 26 quando payday de proximo mes esta 26 dias a frente", () => {
    // UTC day = 10, payday = 5 → next = April 5 00:00 UTC
    // March 10 00:00 → April 5 00:00 = 26 days
    const ref = new Date("2026-03-10T00:00:00.000Z");
    expect(daysUntilNextPayday(5, ref)).toBe(26);
  });

  it("payday igual ao dia de hoje vai para proximo mes (dias > 0)", () => {
    // UTC day = 10, payday = 10 → already at/past → next month April 10
    const ref = new Date("2026-03-10T00:00:00.000Z");
    expect(daysUntilNextPayday(10, ref)).toBeGreaterThan(20);
  });
});

describe("maybeSendFlipNotification", () => {
  beforeAll(async () => { await setupTestDb(); });
  afterAll(async () => { await clearDbClientForTests(); });
  beforeEach(async () => {
    await resetState();
    vi.clearAllMocks();
  });

  it("envia email flip_neg quando pos_to_neg detectado sem cooldown", async () => {
    await registerAndLogin("notif-flip@test.dev");
    const userId = await getUserIdByEmail("notif-flip@test.dev");

    await maybeSendFlipNotification(
      userId,
      { flipDirection: "pos_to_neg", projectedBalance: -500, month: FIXED_MONTH, daysRemaining: 21 },
      { now: FIXED_NOW },
    );

    expect(sendFlipNegEmail).toHaveBeenCalledOnce();
    expect(sendFlipNegEmail).toHaveBeenCalledWith(
      expect.objectContaining({ projectedBalance: -500, month: FIXED_MONTH }),
    );

    // Notification recorded in DB
    const rows = await dbQuery(
      `SELECT type FROM email_notifications WHERE user_id = $1`,
      [userId],
    );
    expect(rows.rows[0].type).toBe("flip_neg");
  });

  it("nao envia email flip_neg quando cooldown de 24h esta ativo", async () => {
    await registerAndLogin("notif-cooldown@test.dev");
    const userId = await getUserIdByEmail("notif-cooldown@test.dev");

    // Record a recent notification (2h ago)
    const recentlySent = new Date(FIXED_NOW.getTime() - 2 * 60 * 60 * 1000);
    await dbQuery(
      `INSERT INTO email_notifications (user_id, type, sent_at, metadata)
       VALUES ($1, 'flip_neg', $2, '{}')`,
      [userId, recentlySent.toISOString()],
    );

    await maybeSendFlipNotification(
      userId,
      { flipDirection: "pos_to_neg", projectedBalance: -300, month: FIXED_MONTH, daysRemaining: 21 },
      { now: FIXED_NOW },
    );

    expect(sendFlipNegEmail).not.toHaveBeenCalled();
  });

  it("envia email flip_neg apos cooldown expirar (25h depois)", async () => {
    await registerAndLogin("notif-after-cooldown@test.dev");
    const userId = await getUserIdByEmail("notif-after-cooldown@test.dev");

    // Record notification 25h ago (past cooldown)
    const oldSent = new Date(FIXED_NOW.getTime() - 25 * 60 * 60 * 1000);
    await dbQuery(
      `INSERT INTO email_notifications (user_id, type, sent_at, metadata)
       VALUES ($1, 'flip_neg', $2, '{}')`,
      [userId, oldSent.toISOString()],
    );

    await maybeSendFlipNotification(
      userId,
      { flipDirection: "pos_to_neg", projectedBalance: -100, month: FIXED_MONTH, daysRemaining: 21 },
      { now: FIXED_NOW },
    );

    expect(sendFlipNegEmail).toHaveBeenCalledOnce();
  });

  it("nao envia email para flip neg_to_pos (opcao A — silencioso)", async () => {
    await registerAndLogin("notif-no-pos@test.dev");
    const userId = await getUserIdByEmail("notif-no-pos@test.dev");

    await maybeSendFlipNotification(
      userId,
      { flipDirection: "neg_to_pos", projectedBalance: 200, month: FIXED_MONTH, daysRemaining: 21 },
      { now: FIXED_NOW },
    );

    expect(sendFlipNegEmail).not.toHaveBeenCalled();
  });

  it("nao envia email quando flipDirection e null", async () => {
    await registerAndLogin("notif-no-flip@test.dev");
    const userId = await getUserIdByEmail("notif-no-flip@test.dev");

    await maybeSendFlipNotification(
      userId,
      { flipDirection: null, projectedBalance: 500, month: FIXED_MONTH, daysRemaining: 21 },
      { now: FIXED_NOW },
    );

    expect(sendFlipNegEmail).not.toHaveBeenCalled();
  });
});

describe("maybeSendPaydayReminder", () => {
  beforeAll(async () => { await setupTestDb(); });
  afterAll(async () => { await clearDbClientForTests(); });
  beforeEach(async () => {
    await resetState();
    vi.clearAllMocks();
  });

  it("envia payday_reminder quando payday esta a 5 dias", async () => {
    await registerAndLogin("notif-payday-5@test.dev");
    const userId = await getUserIdByEmail("notif-payday-5@test.dev");

    // FIXED_NOW = March 10; payday = 15 → 5 days away ✓
    await maybeSendPaydayReminder(
      userId,
      { payday: 15, projectedBalance: 1000, month: FIXED_MONTH, incomeExpected: 3000 },
      { now: FIXED_NOW },
    );

    expect(sendPaydayReminderEmail).toHaveBeenCalledOnce();
    expect(sendPaydayReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({ daysUntilPayday: 5, month: FIXED_MONTH }),
    );
  });

  it("envia payday_reminder quando payday esta a 7 dias", async () => {
    await registerAndLogin("notif-payday-7@test.dev");
    const userId = await getUserIdByEmail("notif-payday-7@test.dev");

    // FIXED_NOW = March 10; payday = 17 → 7 days away ✓
    await maybeSendPaydayReminder(
      userId,
      { payday: 17, projectedBalance: 800, month: FIXED_MONTH, incomeExpected: 2500 },
      { now: FIXED_NOW },
    );

    expect(sendPaydayReminderEmail).toHaveBeenCalledOnce();
  });

  it("nao envia payday_reminder quando payday esta fora da janela (4 dias)", async () => {
    await registerAndLogin("notif-payday-4@test.dev");
    const userId = await getUserIdByEmail("notif-payday-4@test.dev");

    // payday = 14 → 4 days → below window
    await maybeSendPaydayReminder(
      userId,
      { payday: 14, projectedBalance: 500, month: FIXED_MONTH, incomeExpected: null },
      { now: FIXED_NOW },
    );

    expect(sendPaydayReminderEmail).not.toHaveBeenCalled();
  });

  it("nao envia payday_reminder quando payday esta fora da janela (8 dias)", async () => {
    await registerAndLogin("notif-payday-8@test.dev");
    const userId = await getUserIdByEmail("notif-payday-8@test.dev");

    // payday = 18 → 8 days → above window
    await maybeSendPaydayReminder(
      userId,
      { payday: 18, projectedBalance: 500, month: FIXED_MONTH, incomeExpected: null },
      { now: FIXED_NOW },
    );

    expect(sendPaydayReminderEmail).not.toHaveBeenCalled();
  });

  it("nao envia segundo payday_reminder no mesmo mes", async () => {
    await registerAndLogin("notif-payday-dup@test.dev");
    const userId = await getUserIdByEmail("notif-payday-dup@test.dev");

    // Record one sent this month
    await dbQuery(
      `INSERT INTO email_notifications (user_id, type, sent_at, metadata)
       VALUES ($1, 'payday_reminder', $2, $3)`,
      [userId, FIXED_NOW.toISOString(), JSON.stringify({ month: FIXED_MONTH })],
    );

    await maybeSendPaydayReminder(
      userId,
      { payday: 15, projectedBalance: 1000, month: FIXED_MONTH, incomeExpected: 3000 },
      { now: FIXED_NOW },
    );

    expect(sendPaydayReminderEmail).not.toHaveBeenCalled();
  });

  it("nao envia payday_reminder quando payday e null", async () => {
    await registerAndLogin("notif-payday-null@test.dev");
    const userId = await getUserIdByEmail("notif-payday-null@test.dev");

    await maybeSendPaydayReminder(
      userId,
      { payday: null, projectedBalance: 500, month: FIXED_MONTH, incomeExpected: null },
      { now: FIXED_NOW },
    );

    expect(sendPaydayReminderEmail).not.toHaveBeenCalled();
  });
});
