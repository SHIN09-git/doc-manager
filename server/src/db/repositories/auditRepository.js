const AUDIT_COLUMNS = [
  "id",
  "organization_id",
  "user_id",
  "action",
  "target_type",
  "target_id",
  "metadata",
  "created_at",
];

export async function listAuditByOrganization(pool, { organizationId, filters = {}, limit = 200 } = {}) {
  const query = buildAuditHistoryQuery({ organizationId, filters, limit });
  const result = await pool.query(query.text, query.values);
  return result.rows.map(normalizeAuditRow);
}

export async function insertAuditLog(pool, entry = {}) {
  const result = await pool.query(
    `
      insert into audit_logs (${AUDIT_COLUMNS.join(", ")})
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      returning ${AUDIT_COLUMNS.join(", ")}
    `,
    [
      entry.id,
      entry.organization_id,
      entry.user_id,
      entry.action,
      entry.target_type,
      entry.target_id,
      normalizeJson(entry.metadata),
      entry.created_at,
    ],
  );
  return normalizeAuditRow(result.rows[0]);
}

export function buildAuditHistoryQuery({ organizationId, filters = {}, limit = 200 } = {}) {
  if (!organizationId) throw new Error("organizationId is required");
  const values = [organizationId];
  const where = ["organization_id = $1"];
  const from = normalizeText(filters.from);
  const to = normalizeText(filters.to);
  const action = normalizeText(filters.action);
  const targetType = normalizeText(filters.target_type || filters.targetType);

  if (from) {
    values.push(from);
    where.push(`created_at >= $${values.length}`);
  }
  if (to) {
    values.push(normalizeToDateFilter(to));
    where.push(`created_at <${isDateOnly(to) ? "" : "="} $${values.length}`);
  }
  if (action) {
    values.push(action);
    where.push(`action = $${values.length}`);
  }
  if (targetType) {
    values.push(targetType);
    where.push(`target_type = $${values.length}`);
  }

  values.push(normalizeLimit(limit, 200, 1000));
  const limitPlaceholder = `$${values.length}`;
  const columns = AUDIT_COLUMNS.join(", ");
  return {
    text: `
      select ${columns}
      from (
        select ${columns}
        from audit_logs
        where ${where.join(" and ")}
        order by created_at desc, id desc
        limit ${limitPlaceholder}
      ) audit_rows
      order by created_at asc, id asc
    `,
    values,
  };
}

export function normalizeAuditFiltersFromUrl(url) {
  return {
    from: url.searchParams.get("from") || "",
    to: url.searchParams.get("to") || "",
    action: url.searchParams.get("action") || "",
    target_type: url.searchParams.get("target_type") || "",
  };
}

function normalizeAuditRow(row) {
  return {
    ...row,
    metadata: normalizeJson(row.metadata),
    created_at: normalizeDateValue(row.created_at),
  };
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLimit(value, fallback, max) {
  const next = Number(value || fallback);
  if (!Number.isFinite(next) || next <= 0) return fallback;
  return Math.min(Math.floor(next), max);
}

function isDateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeToDateFilter(value) {
  if (!isDateOnly(value)) return value;
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function normalizeDateValue(value) {
  if (value instanceof Date) return value.toISOString();
  return String(value || "");
}

function normalizeJson(value) {
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
