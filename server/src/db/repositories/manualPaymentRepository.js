import { createId } from "../../utils/crypto.js";

const MANUAL_PAYMENT_COLUMNS = [
  "id",
  "organization_id",
  "user_id",
  "package_id",
  "package_type",
  "title",
  "amount_cny",
  "credits",
  "plan",
  "duration_days",
  "payment_channel",
  "payer_note",
  "proof_text",
  "status",
  "reviewed_by",
  "reviewed_at",
  "review_note",
  "created_at",
  "updated_at",
];

const ORGANIZATION_PLAN_COLUMNS = [
  "id",
  "name",
  "slug",
  "plan",
  "plan_expires_at",
  "created_by",
  "created_at",
  "updated_at",
];

export async function createManualPaymentOrder(pool, {
  organizationId,
  userId,
  paymentPackage = {},
  paymentChannel = "",
  payerNote = "",
  proofText = "",
  now = new Date().toISOString(),
} = {}) {
  if (!organizationId) throw new Error("organizationId is required");
  if (!userId) throw new Error("userId is required");
  const order = {
    id: createId("mop"),
    organization_id: organizationId,
    user_id: userId,
    package_id: paymentPackage.id,
    package_type: paymentPackage.type,
    title: paymentPackage.title,
    amount_cny: Number(paymentPackage.amount_cny || 0),
    credits: Number(paymentPackage.credits || 0),
    plan: paymentPackage.plan || "",
    duration_days: Number(paymentPackage.duration_days || 0),
    payment_channel: paymentChannel,
    payer_note: payerNote,
    proof_text: proofText,
    status: "pending",
    reviewed_by: null,
    reviewed_at: null,
    review_note: "",
    created_at: now,
    updated_at: now,
  };
  const result = await pool.query(
    `
      insert into manual_payment_orders (${MANUAL_PAYMENT_COLUMNS.join(", ")})
      values (${MANUAL_PAYMENT_COLUMNS.map((_, index) => `$${index + 1}`).join(", ")})
      returning ${MANUAL_PAYMENT_COLUMNS.join(", ")}
    `,
    MANUAL_PAYMENT_COLUMNS.map((column) => order[column]),
  );
  return normalizeManualPaymentOrder(result.rows[0]);
}

export async function reviewManualPaymentOrder(pool, {
  organizationId,
  orderId,
  reviewerId,
  approved,
  reviewNote = "",
  now = new Date().toISOString(),
} = {}) {
  const existing = await getManualPaymentOrder(pool, { organizationId, orderId });
  if (!existing) throw manualPaymentRepositoryError("manual_payment_order_not_found", "manual payment order not found");
  if (existing.status !== "pending") throw manualPaymentRepositoryError("manual_payment_order_reviewed", "manual payment order already reviewed");
  const nextStatus = approved ? "approved" : "rejected";
  const result = await pool.query(
    `
      update manual_payment_orders
      set status = $3,
          reviewed_by = $4,
          reviewed_at = $5,
          review_note = $6,
          updated_at = $5
      where organization_id = $1 and id = $2 and status = 'pending'
      returning ${MANUAL_PAYMENT_COLUMNS.join(", ")}
    `,
    [organizationId, orderId, nextStatus, reviewerId, now, reviewNote],
  );
  const order = result.rows[0] ? normalizeManualPaymentOrder(result.rows[0]) : null;
  if (!order) throw manualPaymentRepositoryError("manual_payment_order_reviewed", "manual payment order already reviewed");
  return order;
}

export async function activatePlanForManualPaymentOrder(pool, {
  organizationId,
  order,
  now = new Date().toISOString(),
} = {}) {
  if (!organizationId) throw new Error("organizationId is required");
  if (!order?.plan) return null;
  const current = await pool.query(
    `
      select ${ORGANIZATION_PLAN_COLUMNS.join(", ")}
      from organizations
      where id = $1
      limit 1
    `,
    [organizationId],
  );
  const organization = current.rows[0] || null;
  if (!organization) return null;
  const currentExpiry = organization.plan === order.plan && organization.plan_expires_at
    ? Date.parse(organization.plan_expires_at)
    : 0;
  const start = currentExpiry && currentExpiry > Date.parse(now) ? new Date(currentExpiry) : new Date(now);
  const planExpiresAt = Number(order.duration_days || 0) > 0
    ? addDays(start, Number(order.duration_days || 0)).toISOString()
    : null;
  const result = await pool.query(
    `
      update organizations
      set plan = $2,
          plan_expires_at = $3,
          updated_at = $4
      where id = $1
      returning ${ORGANIZATION_PLAN_COLUMNS.join(", ")}
    `,
    [organizationId, order.plan, planExpiresAt, now],
  );
  return normalizeOrganizationRow(result.rows[0]);
}

async function getManualPaymentOrder(pool, { organizationId, orderId } = {}) {
  if (!organizationId) throw new Error("organizationId is required");
  if (!orderId) throw new Error("orderId is required");
  const result = await pool.query(
    `
      select ${MANUAL_PAYMENT_COLUMNS.join(", ")}
      from manual_payment_orders
      where organization_id = $1 and id = $2
      limit 1
    `,
    [organizationId, orderId],
  );
  return result.rows[0] ? normalizeManualPaymentOrder(result.rows[0]) : null;
}

function normalizeManualPaymentOrder(row) {
  return {
    ...row,
    amount_cny: Number(row.amount_cny || 0),
    credits: Number(row.credits || 0),
    duration_days: Number(row.duration_days || 0),
    reviewed_by: row.reviewed_by || null,
    reviewed_at: normalizeNullableDateValue(row.reviewed_at),
    created_at: normalizeDateValue(row.created_at),
    updated_at: normalizeDateValue(row.updated_at),
  };
}

function normalizeOrganizationRow(row) {
  return {
    ...row,
    plan_expires_at: row.plan_expires_at ? normalizeDateValue(row.plan_expires_at) : null,
    created_at: normalizeDateValue(row.created_at),
    updated_at: normalizeDateValue(row.updated_at),
  };
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function normalizeNullableDateValue(value) {
  if (!value) return null;
  return normalizeDateValue(value);
}

function normalizeDateValue(value) {
  if (value instanceof Date) return value.toISOString();
  return String(value || "");
}

function manualPaymentRepositoryError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}
