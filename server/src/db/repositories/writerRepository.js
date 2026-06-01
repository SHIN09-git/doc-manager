import { createId } from "../../utils/crypto.js";

const WRITER_COLUMNS = [
  "id",
  "organization_id",
  "owner_id",
  "name",
  "handle",
  "category",
  "description",
  "enabled",
  "summary_md",
  "skill_json",
  "quality_report",
  "version",
  "created_at",
  "updated_at",
  "deleted_at",
];

const WRITER_VERSION_COLUMNS = [
  "id",
  "writer_profile_id",
  "version",
  "summary_md",
  "skill_json",
  "quality_report",
  "created_by",
  "created_at",
];

export async function listWritersByOrganization(pool, { organizationId, includeDeleted = false } = {}) {
  if (!organizationId) throw new Error("organizationId is required");
  const values = [organizationId];
  const where = ["organization_id = $1"];
  if (!includeDeleted) where.push("deleted_at is null");
  const result = await pool.query(
    `
      select ${WRITER_COLUMNS.join(", ")}
      from writer_profiles
      where ${where.join(" and ")}
      order by updated_at desc, id desc
    `,
    values,
  );
  return result.rows.map(normalizeWriterRow);
}

export async function getWriterById(pool, { organizationId, writerId, includeDeleted = false } = {}) {
  if (!organizationId) throw new Error("organizationId is required");
  if (!writerId) throw new Error("writerId is required");
  const values = [organizationId, writerId];
  const where = ["organization_id = $1", "id = $2"];
  if (!includeDeleted) where.push("deleted_at is null");
  const result = await pool.query(
    `
      select ${WRITER_COLUMNS.join(", ")}
      from writer_profiles
      where ${where.join(" and ")}
      limit 1
    `,
    values,
  );
  return result.rows[0] ? normalizeWriterRow(result.rows[0]) : null;
}

export async function createWriterProfile(pool, { organizationId, userId, draft = {}, now = new Date().toISOString() } = {}) {
  await assertUniqueWriterHandle(pool, { organizationId, handle: draft.handle });
  const writer = {
    id: createId("wrt"),
    organization_id: organizationId,
    owner_id: userId,
    name: draft.name,
    handle: draft.handle,
    category: draft.category,
    description: draft.description,
    enabled: draft.enabled !== false,
    summary_md: draft.summary_md || "",
    skill_json: normalizeJson(draft.skill_json),
    quality_report: normalizeJson(draft.quality_report),
    version: 1,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  const result = await queryWriterChange(
    pool,
    `
      insert into writer_profiles (${WRITER_COLUMNS.join(", ")})
      values (${WRITER_COLUMNS.map((_, index) => `$${index + 1}`).join(", ")})
      returning ${WRITER_COLUMNS.join(", ")}
    `,
    WRITER_COLUMNS.map((column) => writer[column]),
    { handle: draft.handle },
  );
  const saved = normalizeWriterRow(result.rows[0]);
  await insertWriterVersion(pool, { writer: saved, userId, now });
  return saved;
}

export async function updateWriterProfile(pool, {
  organizationId,
  writerId,
  userId,
  draft = {},
  expectedVersion,
  force = false,
  now = new Date().toISOString(),
} = {}) {
  const existing = await getExistingWriter(pool, { organizationId, writerId });
  assertExpectedWriterVersion(existing, { expectedVersion, force });
  await assertUniqueWriterHandle(pool, { organizationId, handle: draft.handle, selfId: writerId });
  const nextVersion = Number(existing.version || 1) + 1;
  const values = [
    draft.name,
    draft.handle,
    draft.category,
    draft.description,
    draft.enabled !== false,
    draft.summary_md || "",
    normalizeJson(draft.skill_json),
    normalizeJson(draft.quality_report),
    nextVersion,
    now,
    writerId,
    organizationId,
  ];
  const result = await queryWriterChange(
    pool,
    `
      update writer_profiles
      set name = $1,
          handle = $2,
          category = $3,
          description = $4,
          enabled = $5,
          summary_md = $6,
          skill_json = $7,
          quality_report = $8,
          version = $9,
          updated_at = $10
      where id = $11 and organization_id = $12 and deleted_at is null
      returning ${WRITER_COLUMNS.join(", ")}
    `,
    values,
    { handle: draft.handle },
  );
  const saved = result.rows[0] ? normalizeWriterRow(result.rows[0]) : null;
  if (!saved) throw writerRepositoryError("not_found", "writer not found");
  await insertWriterVersion(pool, { writer: saved, userId, now });
  return saved;
}

export async function softDeleteWriterProfile(pool, { organizationId, writerId, now = new Date().toISOString() } = {}) {
  const result = await pool.query(
    `
      update writer_profiles
      set deleted_at = $3,
          updated_at = $3
      where organization_id = $1 and id = $2 and deleted_at is null
      returning ${WRITER_COLUMNS.join(", ")}
    `,
    [organizationId, writerId, now],
  );
  const writer = result.rows[0] ? normalizeWriterRow(result.rows[0]) : null;
  if (!writer) throw writerRepositoryError("not_found", "writer not found");
  return writer;
}

export async function listWriterVersionsByWriter(pool, { organizationId, writerId } = {}) {
  const writer = await getExistingWriter(pool, { organizationId, writerId });
  const result = await pool.query(
    `
      select ${WRITER_VERSION_COLUMNS.join(", ")}
      from writer_versions
      where writer_profile_id = $1
      order by version asc, created_at asc, id asc
    `,
    [writer.id],
  );
  return result.rows.map(normalizeWriterVersionRow);
}

export async function restoreWriterVersion(pool, {
  organizationId,
  writerId,
  versionId,
  userId,
  now = new Date().toISOString(),
} = {}) {
  const existing = await getExistingWriter(pool, { organizationId, writerId });
  const version = await getWriterVersionById(pool, { writerId, versionId });
  const nextVersion = Number(existing.version || 1) + 1;
  const result = await pool.query(
    `
      update writer_profiles
      set summary_md = $1,
          skill_json = $2,
          quality_report = $3,
          version = $4,
          updated_at = $5
      where id = $6 and organization_id = $7 and deleted_at is null
      returning ${WRITER_COLUMNS.join(", ")}
    `,
    [
      version.summary_md,
      normalizeJson(version.skill_json),
      normalizeJson(version.quality_report),
      nextVersion,
      now,
      writerId,
      organizationId,
    ],
  );
  const saved = result.rows[0] ? normalizeWriterRow(result.rows[0]) : null;
  if (!saved) throw writerRepositoryError("not_found", "writer not found");
  await insertWriterVersion(pool, { writer: saved, userId, now });
  return saved;
}

async function getExistingWriter(pool, { organizationId, writerId }) {
  const writer = await getWriterById(pool, { organizationId, writerId });
  if (!writer) throw writerRepositoryError("not_found", "writer not found");
  return writer;
}

async function getWriterVersionById(pool, { writerId, versionId }) {
  if (!writerId) throw new Error("writerId is required");
  if (!versionId) throw new Error("versionId is required");
  const result = await pool.query(
    `
      select ${WRITER_VERSION_COLUMNS.join(", ")}
      from writer_versions
      where writer_profile_id = $1 and id = $2
      limit 1
    `,
    [writerId, versionId],
  );
  const version = result.rows[0] ? normalizeWriterVersionRow(result.rows[0]) : null;
  if (!version) throw writerRepositoryError("version_not_found", "writer version not found");
  return version;
}

async function insertWriterVersion(pool, { writer, userId, now }) {
  const result = await pool.query(
    `
      insert into writer_versions (${WRITER_VERSION_COLUMNS.join(", ")})
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      returning ${WRITER_VERSION_COLUMNS.join(", ")}
    `,
    [
      createId("ver"),
      writer.id,
      Number(writer.version || 1),
      writer.summary_md || "",
      normalizeJson(writer.skill_json),
      normalizeJson(writer.quality_report),
      userId,
      now,
    ],
  );
  return normalizeWriterVersionRow(result.rows[0]);
}

async function queryWriterChange(pool, text, values, { handle }) {
  try {
    return await pool.query(text, values);
  } catch (error) {
    if (error?.code === "23505") {
      throw writerRepositoryError("handle_exists", "writer handle already exists", { handle });
    }
    throw error;
  }
}

async function assertUniqueWriterHandle(pool, { organizationId, handle, selfId = "" }) {
  if (!organizationId) throw new Error("organizationId is required");
  if (!handle) throw new Error("handle is required");
  const result = await pool.query(
    `
      select id
      from writer_profiles
      where organization_id = $1 and handle = $2 and deleted_at is null and ($3 = '' or id <> $3)
      limit 1
    `,
    [organizationId, handle, selfId || ""],
  );
  if (result.rows.length > 0) {
    throw writerRepositoryError("handle_exists", "writer handle already exists", { handle });
  }
}

function assertExpectedWriterVersion(existing, { expectedVersion, force }) {
  if (force === true || expectedVersion === undefined || expectedVersion === null || expectedVersion === "") return;
  const current = Number(existing.version || 1);
  if (Number(expectedVersion) !== current) {
    throw writerRepositoryError("version_conflict", "writer version conflict", {
      current_version: current,
      remote: existing,
    });
  }
}

function normalizeWriterRow(row) {
  return {
    ...row,
    enabled: row.enabled !== false,
    skill_json: normalizeJson(row.skill_json),
    quality_report: normalizeJson(row.quality_report),
    version: Number(row.version || 1),
    created_at: normalizeDateValue(row.created_at),
    updated_at: normalizeDateValue(row.updated_at),
    deleted_at: normalizeDateValue(row.deleted_at),
  };
}

function normalizeWriterVersionRow(row) {
  return {
    ...row,
    version: Number(row.version || 1),
    skill_json: normalizeJson(row.skill_json),
    quality_report: normalizeJson(row.quality_report),
    created_at: normalizeDateValue(row.created_at),
  };
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

function normalizeDateValue(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value || "");
}

function writerRepositoryError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}
