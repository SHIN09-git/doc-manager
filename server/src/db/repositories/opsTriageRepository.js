import { createId } from "../../utils/crypto.js";

const OPS_TRIAGE_COLUMNS = [
  "id",
  "organization_id",
  "source_type",
  "source_id",
  "metadata",
  "updated_by",
  "created_at",
  "updated_at",
];

export async function getOpsTriage(pool, { organizationId, sourceType, sourceId } = {}) {
  const query = buildOpsTriageGetQuery({ organizationId, sourceType, sourceId });
  const result = await pool.query(query.text, query.values);
  return result.rows[0] ? normalizeOpsTriageRow(result.rows[0]) : null;
}

export async function upsertOpsTriage(pool, {
  organizationId,
  sourceType,
  sourceId,
  metadata = {},
  userId = "",
  now = new Date().toISOString(),
} = {}) {
  const existing = await getOpsTriage(pool, { organizationId, sourceType, sourceId });
  if (existing) {
    const result = await pool.query(
      `
        update ops_triage
        set metadata = $2, updated_by = $3, updated_at = $4
        where id = $1
        returning ${OPS_TRIAGE_COLUMNS.join(", ")}
      `,
      [existing.id, normalizeMetadata(metadata), userId || null, now],
    );
    return normalizeOpsTriageRow(result.rows[0]);
  }

  const id = createId("tri");
  const result = await pool.query(
    `
      insert into ops_triage (${OPS_TRIAGE_COLUMNS.join(", ")})
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      returning ${OPS_TRIAGE_COLUMNS.join(", ")}
    `,
    [id, organizationId, sourceType, sourceId, normalizeMetadata(metadata), userId || null, now, now],
  );
  return normalizeOpsTriageRow(result.rows[0]);
}

export function buildOpsTriageGetQuery({ organizationId, sourceType, sourceId } = {}) {
  if (!organizationId) throw new Error("organizationId is required");
  if (!sourceType) throw new Error("sourceType is required");
  if (!sourceId) throw new Error("sourceId is required");
  return {
    text: `
      select ${OPS_TRIAGE_COLUMNS.join(", ")}
      from ops_triage
      where organization_id = $1 and source_type = $2 and source_id = $3
      limit 1
    `,
    values: [organizationId, sourceType, sourceId],
  };
}

function normalizeOpsTriageRow(row) {
  return {
    ...row,
    metadata: normalizeMetadata(row.metadata),
    created_at: normalizeDateValue(row.created_at),
    updated_at: normalizeDateValue(row.updated_at),
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
