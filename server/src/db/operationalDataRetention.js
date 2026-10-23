const DAY_MS = 24 * 60 * 60 * 1000;

export const OPERATIONAL_RETENTION = Object.freeze({
  expiredTokenGraceMs: 7 * DAY_MS,
  loginAttemptMs: 30 * DAY_MS,
  rateLimitMs: 35 * DAY_MS,
  creditReservationMs: 60 * 60 * 1000,
  creditReservationHistoryMs: 90 * DAY_MS,
});

export function pruneOperationalData(data, {
  now = new Date(),
  retention = OPERATIONAL_RETENTION,
} = {}) {
  const nowMs = normalizeNow(now);
  const removed = {};

  pruneArray(data, "sessions", (item) => isBefore(item?.expires_at, nowMs), removed);
  pruneArray(data, "email_verifications", (item) => (
    isBefore(item?.expires_at, nowMs - retention.expiredTokenGraceMs)
  ), removed);
  pruneArray(data, "password_resets", (item) => (
    isBefore(item?.expires_at, nowMs - retention.expiredTokenGraceMs)
  ), removed);
  pruneArray(data, "login_attempts", (item) => (
    isBefore(item?.created_at, nowMs - retention.loginAttemptMs)
  ), removed);
  pruneArray(data, "rate_limits", (item) => (
    isBefore(item?.updated_at || normalizeDateKey(item?.date), nowMs - retention.rateLimitMs)
  ), removed);
  const recovered = {
    ai_credit_reservations: recoverStaleCreditReservations(
      data,
      nowMs - retention.creditReservationMs,
      new Date(nowMs).toISOString(),
    ),
  };
  pruneArray(data, "ai_credit_reservations", (item) => (
    item?.status !== "reserved" &&
    isBefore(item?.updated_at || item?.created_at, nowMs - retention.creditReservationHistoryMs)
  ), removed);

  return {
    changed: Object.values(removed).some((count) => count > 0) ||
      Object.values(recovered).some((count) => count > 0),
    removed,
    recovered,
  };
}

export async function prunePostgresOperationalData(pool, {
  now = new Date(),
  retention = OPERATIONAL_RETENTION,
} = {}) {
  const client = typeof pool.connect === "function" ? await pool.connect() : pool;
  const shouldRelease = client !== pool && typeof client.release === "function";
  const nowIso = new Date(normalizeNow(now)).toISOString();
  const tokenCutoff = new Date(Date.parse(nowIso) - retention.expiredTokenGraceMs).toISOString();
  const loginCutoff = new Date(Date.parse(nowIso) - retention.loginAttemptMs).toISOString();
  const rateLimitCutoff = new Date(Date.parse(nowIso) - retention.rateLimitMs).toISOString();
  const creditReservationCutoff = new Date(Date.parse(nowIso) - retention.creditReservationMs).toISOString();
  const creditReservationHistoryCutoff = new Date(Date.parse(nowIso) - retention.creditReservationHistoryMs).toISOString();

  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('mowen_store_write'))");
    const recoveryResult = await client.query(
      `
        with stale as (
          select id, organization_id, user_id, amount
          from ai_credit_reservations
          where status = 'reserved' and created_at < $1::timestamptz
          for update
        ), totals as (
          select organization_id, user_id, sum(amount)::int as amount
          from stale
          group by organization_id, user_id
        ), restored as (
          update credit_accounts account
          set balance = account.balance + totals.amount,
              updated_at = $2::timestamptz
          from totals
          where account.organization_id = totals.organization_id
            and account.user_id = totals.user_id
          returning account.organization_id, account.user_id
        ), marked as (
          update ai_credit_reservations reservation
          set status = 'refunded',
              updated_at = $2::timestamptz
          from stale
          where reservation.id = stale.id
            and exists (
              select 1
              from restored
              where restored.organization_id = stale.organization_id
                and restored.user_id = stale.user_id
            )
          returning reservation.id
        )
        select count(*)::int as count from marked
      `,
      [creditReservationCutoff, nowIso],
    );
    const statements = [
      ["sessions", "delete from sessions where expires_at < $1::timestamptz", nowIso],
      ["email_verifications", "delete from email_verifications where expires_at < $1::timestamptz", tokenCutoff],
      ["password_resets", "delete from password_resets where expires_at < $1::timestamptz", tokenCutoff],
      ["login_attempts", "delete from login_attempts where created_at < $1::timestamptz", loginCutoff],
      ["rate_limits", "delete from rate_limits where updated_at < $1::timestamptz", rateLimitCutoff],
      ["ai_credit_reservations", "delete from ai_credit_reservations where status <> 'reserved' and updated_at < $1::timestamptz", creditReservationHistoryCutoff],
    ];
    const removed = {};
    for (const [name, sql, cutoff] of statements) {
      const result = await client.query(sql, [cutoff]);
      removed[name] = Number(result.rowCount || 0);
    }
    await client.query("commit");
    const recovered = {
      ai_credit_reservations: Number(recoveryResult.rows?.[0]?.count || 0),
    };
    return {
      changed: Object.values(removed).some((count) => count > 0) ||
        Object.values(recovered).some((count) => count > 0),
      removed,
      recovered,
    };
  } catch (error) {
    await client.query("rollback").catch(() => null);
    throw error;
  } finally {
    if (shouldRelease) client.release();
  }
}

function recoverStaleCreditReservations(data, cutoff, nowIso) {
  const reservations = Array.isArray(data?.ai_credit_reservations)
    ? data.ai_credit_reservations
    : [];
  const accounts = Array.isArray(data?.credit_accounts) ? data.credit_accounts : [];
  let recovered = 0;
  for (const reservation of reservations) {
    if (reservation?.status !== "reserved" || !isBefore(reservation.created_at, cutoff)) continue;
    const account = accounts.find((item) =>
      item.organization_id === reservation.organization_id &&
      item.user_id === reservation.user_id);
    if (!account) continue;
    account.balance = Number(account.balance || 0) + Math.max(1, Math.floor(Number(reservation.amount || 1)));
    account.updated_at = nowIso;
    reservation.status = "refunded";
    reservation.updated_at = nowIso;
    recovered += 1;
  }
  return recovered;
}

function pruneArray(data, key, shouldRemove, removed) {
  const rows = Array.isArray(data?.[key]) ? data[key] : [];
  const next = rows.filter((item) => !shouldRemove(item));
  data[key] = next;
  removed[key] = rows.length - next.length;
}

function normalizeNow(value) {
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(time)) throw new TypeError("Invalid retention clock");
  return time;
}

function isBefore(value, cutoff) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) && time < cutoff;
}

function normalizeDateKey(value) {
  const date = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00.000Z` : "";
}
