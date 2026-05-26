const DOCUMENT_COLUMNS = [
  "id",
  "organization_id",
  "owner_id",
  "title",
  "type",
  "folder_id",
  "content",
  "source",
  "local_id",
  "metadata",
  "version",
  "created_at",
  "updated_at",
  "deleted_at",
];

export async function listDocumentsByOrganization(pool, { organizationId, filters = {}, limit = 200 } = {}) {
  const query = buildDocumentListQuery({ organizationId, filters, limit });
  const result = await pool.query(query.text, query.values);
  const normalizedLimit = normalizeLimit(limit, 200, 1000);
  const rows = result.rows.map(normalizeDocumentRow);
  const documents = rows.slice(0, normalizedLimit);
  return {
    documents,
    page_info: buildPageInfo(documents, rows.length > normalizedLimit, normalizedLimit),
  };
}

export function buildDocumentListQuery({ organizationId, filters = {}, limit = 200 } = {}) {
  if (!organizationId) throw new Error("organizationId is required");
  const values = [organizationId];
  const where = ["organization_id = $1"];
  const includeDeleted = filters.include_deleted === true || filters.includeDeleted === true;
  const type = normalizeText(filters.type);
  const folderId = normalizeText(filters.folder_id || filters.folderId);
  const cursorUpdatedAt = normalizeText(filters.cursor_updated_at || filters.cursorUpdatedAt);
  const cursorId = normalizeText(filters.cursor_id || filters.cursorId);

  if (!includeDeleted) where.push("deleted_at is null");
  if (type) {
    values.push(type);
    where.push(`type = $${values.length}`);
  }
  if (folderId) {
    values.push(folderId);
    where.push(`folder_id = $${values.length}`);
  }
  if (cursorUpdatedAt && cursorId) {
    values.push(cursorUpdatedAt, cursorId);
    const updatedPlaceholder = `$${values.length - 1}`;
    const idPlaceholder = `$${values.length}`;
    where.push(`(updated_at, id) < (${updatedPlaceholder}, ${idPlaceholder})`);
  }

  values.push(normalizeLimit(limit, 200, 1000) + 1);
  const limitPlaceholder = `$${values.length}`;
  return {
    text: `
      select ${DOCUMENT_COLUMNS.join(", ")}
      from documents
      where ${where.join(" and ")}
      order by updated_at desc, id desc
      limit ${limitPlaceholder}
    `,
    values,
  };
}

export function normalizeDocumentListFiltersFromUrl(url) {
  const includeDeleted = url.searchParams.get("include_deleted");
  return {
    include_deleted: includeDeleted === "1" || includeDeleted === "true",
    type: url.searchParams.get("type") || "",
    folder_id: url.searchParams.get("folder_id") || "",
    cursor_updated_at: url.searchParams.get("cursor_updated_at") || "",
    cursor_id: url.searchParams.get("cursor_id") || "",
  };
}

function normalizeDocumentRow(row) {
  return {
    ...row,
    metadata: normalizeJson(row.metadata),
    version: Number(row.version || 1),
    created_at: normalizeDateValue(row.created_at),
    updated_at: normalizeDateValue(row.updated_at),
    deleted_at: normalizeDateValue(row.deleted_at),
  };
}

function buildPageInfo(rows, hasMore, limit) {
  const last = rows[rows.length - 1] || null;
  return {
    limit,
    has_more: hasMore,
    next_cursor: last ? {
      updated_at: last.updated_at,
      id: last.id,
    } : null,
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

function normalizeDateValue(value) {
  if (!value) return "";
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
