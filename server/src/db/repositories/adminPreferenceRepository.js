import { createId } from "../../utils/crypto.js";

const ADMIN_PREFERENCE_COLUMNS = [
  "id",
  "organization_id",
  "user_id",
  "preferences",
  "created_at",
  "updated_at",
];

export async function getAdminPreferences(pool, { organizationId, userId } = {}) {
  const query = buildAdminPreferencesGetQuery({ organizationId, userId });
  const result = await pool.query(query.text, query.values);
  return result.rows[0] ? normalizeAdminPreferencesRow(result.rows[0]) : null;
}

export async function upsertAdminPreferences(pool, { organizationId, userId, preferences = {}, now = new Date().toISOString() } = {}) {
  const existing = await getAdminPreferences(pool, { organizationId, userId });
  if (existing) {
    const result = await pool.query(
      `
        update admin_preferences
        set preferences = $2, updated_at = $3
        where id = $1
        returning ${ADMIN_PREFERENCE_COLUMNS.join(", ")}
      `,
      [existing.id, normalizePreferences(preferences), now],
    );
    return normalizeAdminPreferencesRow(result.rows[0]);
  }

  const id = createId("pref");
  const result = await pool.query(
    `
      insert into admin_preferences (${ADMIN_PREFERENCE_COLUMNS.join(", ")})
      values ($1, $2, $3, $4, $5, $6)
      returning ${ADMIN_PREFERENCE_COLUMNS.join(", ")}
    `,
    [id, organizationId, userId, normalizePreferences(preferences), now, now],
  );
  return normalizeAdminPreferencesRow(result.rows[0]);
}

export async function deleteAdminPreferences(pool, { organizationId, userId } = {}) {
  if (!organizationId) throw new Error("organizationId is required");
  if (!userId) throw new Error("userId is required");
  const result = await pool.query(
    `
      delete from admin_preferences
      where organization_id = $1 and user_id = $2
    `,
    [organizationId, userId],
  );
  return { deleted_count: Number(result.rowCount || 0) };
}

export function buildAdminPreferencesGetQuery({ organizationId, userId } = {}) {
  if (!organizationId) throw new Error("organizationId is required");
  if (!userId) throw new Error("userId is required");
  return {
    text: `
      select ${ADMIN_PREFERENCE_COLUMNS.join(", ")}
      from admin_preferences
      where organization_id = $1 and user_id = $2
      order by updated_at desc, id desc
      limit 1
    `,
    values: [organizationId, userId],
  };
}

function normalizeAdminPreferencesRow(row) {
  return {
    ...row,
    preferences: normalizePreferences(row.preferences),
    created_at: normalizeDateValue(row.created_at),
    updated_at: normalizeDateValue(row.updated_at),
  };
}

function normalizePreferences(value) {
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
