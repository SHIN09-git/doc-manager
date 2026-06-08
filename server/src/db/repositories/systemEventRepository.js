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

export async function createSystemEvent(pool, {
  organizationId = null,
  userId = null,
  level = "info",
  type = "",
  message = "",
  metadata = {},
  now = new Date().toISOString(),
} = {}) {
  const normalizedType = String(type || "").trim();
  if (!normalizedType) throw new Error("type is required");
  const event = {
    id: createId("evt"),
    organization_id: organizationId || null,
    user_id: userId || null,
    level: normalizeLevel(level),
    type: normalizedType.slice(0, 160),
    message: String(message || "").slice(0, 4000),
    metadata: normalizeMetadata(metadata),
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

export async function updateSystemEventMetadata(pool, {
  organizationId,
  eventId,
  metadata = {},
  levels = ["warn", "error"],
} = {}) {
  if (!organizationId) throw new Error("organizationId is required");
  if (!eventId) throw new Error("eventId is required");
  const allowedLevels = normalizeLevels(levels);
  const result = await pool.query(
    `
      update system_events
      set metadata = $3
      where organization_id = $1 and id = $2 and level = any($4::text[])
      returning ${SYSTEM_EVENT_COLUMNS.join(", ")}
    `,
    [organizationId, eventId, normalizeMetadata(metadata), allowedLevels],
  );
  const event = result.rows[0] ? normalizeSystemEventRow(result.rows[0]) : null;
  if (!event) throw systemEventRepositoryError("system_event_not_found", "system event not found");
  return event;
}

function normalizeLevel(level) {
  const normalized = String(level || "").trim().toLowerCase();
  return ["info", "warn", "error"].includes(normalized) ? normalized : "info";
}

function normalizeLevels(levels) {
  const normalized = Array.from(new Set((Array.isArray(levels) ? levels : [])
    .map((level) => String(level || "").trim())
    .filter((level) => ["warn", "error"].includes(level))));
  return normalized.length ? normalized : ["warn", "error"];
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

function systemEventRepositoryError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}
