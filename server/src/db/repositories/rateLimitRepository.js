import { createId } from "../../utils/crypto.js";
import { reserveCreditsForAi } from "./creditRepository.js";

export async function reserveAiQuota(pool, {
  organizationId,
  userId,
  date,
  scope = "ai.chat",
  limits = {},
  plan = "free",
  now = new Date().toISOString(),
} = {}) {
  if (!organizationId) throw new Error("organizationId is required");
  if (!userId) throw new Error("userId is required");
  const normalizedDate = normalizeDateKey(date);
  const userDaily = normalizeLimit(limits.userDaily);
  const orgDaily = normalizeLimit(limits.orgDaily);
  const [startDate, endDate] = dayRange(normalizedDate);
  const userUsageCount = await countUsage(pool, "user_id", userId, startDate, endDate);
  const orgUsageCount = await countUsage(pool, "organization_id", organizationId, startDate, endDate);
  const userReservationCount = await countReservations(pool, { scope, date: normalizedDate, userId });
  const orgReservationCount = await countReservations(pool, { scope, date: normalizedDate, organizationId });
  const userCount = Math.max(userUsageCount, userReservationCount);
  const orgCount = Math.max(orgUsageCount, orgReservationCount);
  const userLimited = userDaily > 0 && userCount >= userDaily;
  const orgLimited = orgDaily > 0 && orgCount >= orgDaily;
  const requiresCredit = userLimited || orgLimited;
  let creditReservation = null;
  let creditAllowed = false;
  if (requiresCredit) {
    const credit = await reserveCreditsForAi(pool, {
      organizationId,
      userId,
      amount: 1,
      now,
    });
    creditAllowed = !credit.skipped;
    creditReservation = credit.reservation;
    if (!creditAllowed) {
      return {
        reserved: false,
        source: "credit",
        plan,
        user_limited: userLimited,
        org_limited: orgLimited,
        credit_allowed: false,
        credit_reservation: null,
      };
    }
  }
  const source = requiresCredit ? "credit" : "plan";
  const reservation = await insertReservation(pool, {
    organizationId,
    userId,
    scope,
    date: normalizedDate,
    count: 1,
    now,
  });
  return {
    reserved: true,
    source,
    plan,
    user_limited: userLimited,
    org_limited: orgLimited,
    credit_allowed: creditAllowed,
    credit_reservation: creditReservation,
    reservation,
  };
}

async function countUsage(pool, column, value, startDate, endDate) {
  const result = await pool.query(
    `
      select count(*)::int as count
      from ai_usage
      where ${column} = $1
        and created_at >= $2::timestamptz
        and created_at < $3::timestamptz
    `,
    [value, startDate, endDate],
  );
  return Number(result.rows?.[0]?.count || 0);
}

async function countReservations(pool, {
  scope,
  date,
  organizationId = "",
  userId = "",
}) {
  const column = userId ? "user_id" : "organization_id";
  const value = userId || organizationId;
  const result = await pool.query(
    `
      select coalesce(sum(greatest(count, 1)), 0)::int as count
      from rate_limits
      where scope = $1
        and date = $2
        and ${column} = $3
    `,
    [scope, date, value],
  );
  return Number(result.rows?.[0]?.count || 0);
}

async function insertReservation(pool, {
  organizationId,
  userId,
  scope,
  date,
  count,
  now,
}) {
  const result = await pool.query(
    `
      insert into rate_limits (id, organization_id, user_id, scope, date, count, updated_at)
      values ($1, $2, $3, $4, $5, $6, $7)
      returning id, organization_id, user_id, scope, date, count, updated_at
    `,
    [createId("lim"), organizationId, userId, scope, date, count, now],
  );
  const row = result.rows?.[0] || {};
  return {
    ...row,
    count: Number(row.count || count || 1),
    updated_at: normalizeDateValue(row.updated_at || now),
  };
}

function normalizeDateKey(date) {
  const value = String(date || new Date().toISOString().slice(0, 10)).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 10);
}

function dayRange(date) {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return [start.toISOString(), end.toISOString()];
}

function normalizeLimit(value) {
  const next = Number(value || 0);
  if (!Number.isFinite(next) || next <= 0) return 0;
  return Math.floor(next);
}

function normalizeDateValue(value) {
  if (value instanceof Date) return value.toISOString();
  return String(value || "");
}
