import { createId } from "../../utils/crypto.js";

const SYSTEM_EVENT_COLUMNS = [
  "id",
  "organization_id",
  "user_id",
  "level",
  "type",
  "message",
  "metadata",
  "created_at",
];

export async function createFeedbackEvent(pool, {
  organizationId,
  userId,
  message = "",
  source = "cloud_panel",
  now = new Date().toISOString(),
} = {}) {
  if (!organizationId) throw new Error("organizationId is required");
  if (!userId) throw new Error("userId is required");
  const event = {
    id: createId("evt"),
    organization_id: organizationId,
    user_id: userId,
    level: "info",
    type: "user.feedback",
    message: String(message || "").slice(0, 4000),
    metadata: { source: String(source || "cloud_panel").slice(0, 80) },
    created_at: now,
  };
  const result = await pool.query(
    `
      insert into system_events (${SYSTEM_EVENT_COLUMNS.join(", ")})
      values (${SYSTEM_EVENT_COLUMNS.map((_, index) => `$${index + 1}`).join(", ")})
      returning ${SYSTEM_EVENT_COLUMNS.join(", ")}
    `,
    SYSTEM_EVENT_COLUMNS.map((column) => event[column]),
  );
  return normalizeSystemEventRow(result.rows[0]);
}

export async function updateFeedbackStatus(pool, {
  organizationId,
  feedbackId,
  status = "pending",
  metadataPatch = {},
  userId = "",
  now = new Date().toISOString(),
} = {}) {
  const existing = await getFeedbackEvent(pool, { organizationId, feedbackId });
  if (!existing) throw feedbackRepositoryError("feedback_not_found", "feedback not found");
  const metadata = buildFeedbackMetadata(existing.metadata, { status, metadataPatch, userId, now });
  const result = await pool.query(
    `
      update system_events
      set metadata = $3
      where organization_id = $1 and id = $2 and type = 'user.feedback'
      returning ${SYSTEM_EVENT_COLUMNS.join(", ")}
    `,
    [organizationId, feedbackId, metadata],
  );
  const event = result.rows[0] ? normalizeSystemEventRow(result.rows[0]) : null;
  if (!event) throw feedbackRepositoryError("feedback_not_found", "feedback not found");
  return event;
}

export async function updateFeedbackBatchStatus(pool, {
  organizationId,
  feedbackIds = [],
  status = "pending",
  metadataPatch = {},
  userId = "",
  now = new Date().toISOString(),
} = {}) {
  if (!organizationId) throw new Error("organizationId is required");
  const ids = Array.from(new Set((Array.isArray(feedbackIds) ? feedbackIds : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean)));
  if (ids.length === 0) return [];
  const result = await pool.query(
    `
      select ${SYSTEM_EVENT_COLUMNS.join(", ")}
      from system_events
      where organization_id = $1 and type = 'user.feedback' and id = any($2::text[])
      order by created_at asc
    `,
    [organizationId, ids],
  );
  const existing = result.rows.map((row) => normalizeSystemEventRow(row));
  const updated = [];
  for (const event of existing) {
    const metadata = buildFeedbackMetadata(event.metadata, { status, metadataPatch, userId, now });
    const updateResult = await pool.query(
      `
        update system_events
        set metadata = $3
        where organization_id = $1 and id = $2 and type = 'user.feedback'
        returning ${SYSTEM_EVENT_COLUMNS.join(", ")}
      `,
      [organizationId, event.id, metadata],
    );
    if (updateResult.rows[0]) updated.push(normalizeSystemEventRow(updateResult.rows[0]));
  }
  if (updated.length === 0) throw feedbackRepositoryError("feedback_not_found", "feedback not found");
  return updated;
}

async function getFeedbackEvent(pool, { organizationId, feedbackId } = {}) {
  if (!organizationId) throw new Error("organizationId is required");
  if (!feedbackId) throw new Error("feedbackId is required");
  const result = await pool.query(
    `
      select ${SYSTEM_EVENT_COLUMNS.join(", ")}
      from system_events
      where organization_id = $1 and id = $2 and type = 'user.feedback'
      limit 1
    `,
    [organizationId, feedbackId],
  );
  return result.rows[0] ? normalizeSystemEventRow(result.rows[0]) : null;
}

function buildFeedbackMetadata(metadata, { status, metadataPatch, userId, now }) {
  return {
    ...(normalizeMetadata(metadata)),
    status,
    ...(normalizeMetadata(metadataPatch)),
    handled_by: userId || null,
    handled_at: now,
  };
}

function normalizeSystemEventRow(row) {
  return {
    ...row,
    metadata: normalizeMetadata(row.metadata),
    created_at: normalizeDateValue(row.created_at),
  };
}

function normalizeMetadata(value) {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return { raw: value };
    }
  }
  return value && typeof value === "object" ? value : {};
}

function normalizeDateValue(value) {
  if (value instanceof Date) return value.toISOString();
  return String(value || "");
}

function feedbackRepositoryError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}
