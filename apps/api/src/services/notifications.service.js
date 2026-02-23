/**
 * Notification orchestration service.
 *
 * Decides when to send emails based on:
 *  - Flip detection (pos_to_neg only)
 *  - 24-hour cooldown between flip_neg emails
 *  - Payday window (5-7 days before payday)
 *  - One payday_reminder per calendar month
 */

import { dbQuery } from "../db/index.js";
import { sendFlipNegEmail, sendPaydayReminderEmail } from "./email.service.js";

const FLIP_NEG_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 h
const PAYDAY_REMINDER_WINDOW_MIN = 5; // days before payday
const PAYDAY_REMINDER_WINDOW_MAX = 7; // days before payday

const recordNotification = async (userId, type, metadata = {}) => {
  await dbQuery(
    `INSERT INTO email_notifications (user_id, type, metadata)
     VALUES ($1, $2, $3)`,
    [userId, type, JSON.stringify(metadata)],
  );
};

const getLastNotificationAt = async (userId, type) => {
  const result = await dbQuery(
    `SELECT sent_at FROM email_notifications
     WHERE user_id = $1 AND type = $2
     ORDER BY sent_at DESC LIMIT 1`,
    [userId, type],
  );
  return result.rows.length > 0 ? new Date(result.rows[0].sent_at) : null;
};

const hasNotificationThisMonth = async (userId, type, monthStr) => {
  const [yearPart, monthPart] = monthStr.split("-");
  const monthStart = new Date(Date.UTC(Number(yearPart), Number(monthPart) - 1, 1));
  const nextMonthStart = new Date(Date.UTC(Number(yearPart), Number(monthPart), 1));

  const result = await dbQuery(
    `SELECT 1 FROM email_notifications
     WHERE user_id = $1
       AND type = $2
       AND sent_at >= $3
       AND sent_at < $4
     LIMIT 1`,
    [userId, type, monthStart.toISOString(), nextMonthStart.toISOString()],
  );
  return result.rows.length > 0;
};

const getUserEmail = async (userId) => {
  const userResult = await dbQuery(
    `SELECT email FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  if (userResult.rows.length === 0) return null;
  return userResult.rows[0].email;
};

const getUserPayday = async (userId) => {
  const profileResult = await dbQuery(
    `SELECT payday FROM user_profiles WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  if (profileResult.rows.length === 0) return null;

  const payday = profileResult.rows[0].payday;
  return payday != null ? Number(payday) : null;
};

// Calculates how many days until the next occurrence of payday from referenceDate.
// All arithmetic is in UTC to remain timezone-agnostic.
const daysUntilNextPayday = (payday, referenceDate = new Date()) => {
  const todayDayUTC = referenceDate.getUTCDate();
  const yearUTC = referenceDate.getUTCFullYear();
  const monthUTC = referenceDate.getUTCMonth();
  let nextPaydayDate;

  if (payday > todayDayUTC) {
    nextPaydayDate = new Date(Date.UTC(yearUTC, monthUTC, payday));
  } else {
    nextPaydayDate = new Date(Date.UTC(yearUTC, monthUTC + 1, payday));
  }

  const diffMs = nextPaydayDate.getTime() - referenceDate.getTime();
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
};

/**
 * Called after every forecast recompute.
 * Sends a flip_neg email if:
 *  1. flipDirection === 'pos_to_neg'
 *  2. No flip_neg email sent in the last 24 h for this user
 */
export const maybeSendFlipNotification = async (
  userId,
  { flipDirection, projectedBalance, month, daysRemaining },
  { now = new Date() } = {},
) => {
  if (flipDirection !== "pos_to_neg") return;

  const lastSent = await getLastNotificationAt(userId, "flip_neg");
  if (lastSent && now.getTime() - lastSent.getTime() < FLIP_NEG_COOLDOWN_MS) {
    return;
  }

  const email = await getUserEmail(userId);
  if (!email) return;

  await sendFlipNegEmail({ email, projectedBalance, month, daysRemaining });
  await recordNotification(userId, "flip_neg", { month, projectedBalance });
};

/**
 * Called by a daily scheduler or at recompute time as a side-effect.
 * Sends a payday_reminder email if:
 *  1. User has a payday configured
 *  2. Payday is 5-7 days away
 *  3. No payday_reminder sent this calendar month yet
 */
export const maybeSendPaydayReminder = async (
  userId,
  { payday, projectedBalance, month, incomeExpected },
  { now = new Date() } = {},
) => {
  const resolvedPayday = payday ?? (await getUserPayday(userId));
  if (!resolvedPayday) return;

  const days = daysUntilNextPayday(resolvedPayday, now);
  if (days < PAYDAY_REMINDER_WINDOW_MIN || days > PAYDAY_REMINDER_WINDOW_MAX) return;

  const alreadySentThisMonth = await hasNotificationThisMonth(
    userId,
    "payday_reminder",
    month,
  );
  if (alreadySentThisMonth) return;

  const email = await getUserEmail(userId);
  if (!email) return;

  await sendPaydayReminderEmail({
    email,
    projectedBalance,
    month,
    incomeExpected,
    daysUntilPayday: days,
  });
  await recordNotification(userId, "payday_reminder", {
    month,
    payday: resolvedPayday,
    projectedBalance,
  });
};

export { daysUntilNextPayday };
