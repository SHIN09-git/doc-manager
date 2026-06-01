import { createId } from "../../utils/crypto.js";

const CREDIT_ACCOUNT_COLUMNS = [
  "id",
  "organization_id",
  "user_id",
  "balance",
  "updated_at",
];

const CREDIT_LEDGER_COLUMNS = [
  "id",
  "organization_id",
  "user_id",
  "order_id",
  "usage_id",
  "direction",
  "amount",
  "balance_after",
  "reason",
  "created_at",
];

export async function spendCreditsForUsage(pool, {
  organizationId,
  userId,
  usageId,
  amount = 1,
  now = new Date().toISOString(),
} = {}) {
  if (!organizationId) throw new Error("organizationId is required");
  if (!userId) throw new Error("userId is required");
  if (!usageId) throw new Error("usageId is required");
  const creditAmount = Math.max(1, Math.floor(Number(amount || 1)));
  const existing = await ensureCreditAccount(pool, { organizationId, userId, now });
  const updated = await pool.query(
    `
      update credit_accounts
      set balance = balance - $3,
          updated_at = $4
      where organization_id = $1 and user_id = $2 and balance >= $3
      returning ${CREDIT_ACCOUNT_COLUMNS.join(", ")}
    `,
    [organizationId, userId, creditAmount, now],
  );
  const account = updated.rows[0] ? normalizeCreditAccountRow(updated.rows[0]) : existing;
  if (!updated.rows[0]) {
    return {
      account,
      ledger: null,
      skipped: true,
      amount: creditAmount,
    };
  }
  const ledger = await insertCreditLedger(pool, {
    organizationId,
    userId,
    usageId,
    amount: creditAmount,
    balanceAfter: account.balance,
    reason: "ai_quota_overage",
    now,
  });
  return {
    account,
    ledger,
    skipped: false,
    amount: creditAmount,
  };
}

async function ensureCreditAccount(pool, { organizationId, userId, now }) {
  const result = await pool.query(
    `
      insert into credit_accounts (${CREDIT_ACCOUNT_COLUMNS.join(", ")})
      values ($1, $2, $3, $4, $5)
      on conflict (organization_id, user_id)
      do update set updated_at = credit_accounts.updated_at
      returning ${CREDIT_ACCOUNT_COLUMNS.join(", ")}
    `,
    [createId("crd"), organizationId, userId, 0, now],
  );
  return normalizeCreditAccountRow(result.rows[0]);
}

async function insertCreditLedger(pool, {
  organizationId,
  userId,
  usageId,
  amount,
  balanceAfter,
  reason,
  now,
}) {
  const result = await pool.query(
    `
      insert into credit_ledger (${CREDIT_LEDGER_COLUMNS.join(", ")})
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      returning ${CREDIT_LEDGER_COLUMNS.join(", ")}
    `,
    [
      createId("led"),
      organizationId,
      userId,
      null,
      usageId,
      "out",
      amount,
      balanceAfter,
      reason,
      now,
    ],
  );
  return normalizeCreditLedgerRow(result.rows[0]);
}

function normalizeCreditAccountRow(row) {
  return {
    ...row,
    balance: Number(row.balance || 0),
    updated_at: normalizeDateValue(row.updated_at),
  };
}

function normalizeCreditLedgerRow(row) {
  return {
    ...row,
    order_id: row.order_id || null,
    usage_id: row.usage_id || null,
    amount: Number(row.amount || 0),
    balance_after: Number(row.balance_after || 0),
    created_at: normalizeDateValue(row.created_at),
  };
}

function normalizeDateValue(value) {
  if (value instanceof Date) return value.toISOString();
  return String(value || "");
}
