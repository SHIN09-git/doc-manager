import { createId } from "../../utils/crypto.js";

const USAGE_COLUMNS = [
  "id",
  "organization_id",
  "user_id",
  "provider",
  "model",
  "task_type",
  "prompt_tokens",
  "completion_tokens",
  "total_tokens",
  "estimated_cost",
  "status",
  "error",
  "created_at",
];

export async function listUsageByOrganization(pool, { organizationId, userId = "", filters = {}, limit = 200 } = {}) {
  const query = buildUsageHistoryQuery({ organizationId, userId, filters, limit });
  const result = await pool.query(query.text, query.values);
  return result.rows.map(normalizeUsageRow);
}

export async function insertUsageRecord(pool, { usage = {} } = {}) {
  const record = normalizeUsageDraft(usage);
  const result = await pool.query(
    `
      insert into ai_usage (${USAGE_COLUMNS.join(", ")})
      values (${USAGE_COLUMNS.map((_, index) => `$${index + 1}`).join(", ")})
      returning ${USAGE_COLUMNS.join(", ")}
    `,
    USAGE_COLUMNS.map((column) => record[column]),
  );
  return normalizeUsageRow(result.rows[0]);
}

export function buildUsageHistoryQuery({ organizationId, userId = "", filters = {}, limit = 200 } = {}) {
  if (!organizationId) throw new Error("organizationId is required");
  const values = [organizationId];
  const where = ["organization_id = $1"];
  const normalizedUserId = normalizeText(userId);
  const from = normalizeText(filters.from);
  const to = normalizeText(filters.to);
  const taskType = normalizeText(filters.task_type || filters.taskType);
  const status = normalizeText(filters.status);

  if (normalizedUserId) {
    values.push(normalizedUserId);
    where.push(`user_id = $${values.length}`);
  }
  if (from) {
    values.push(from);
    where.push(`created_at >= $${values.length}`);
  }
  if (to) {
    values.push(normalizeToDateFilter(to));
    where.push(`created_at <${isDateOnly(to) ? "" : "="} $${values.length}`);
  }
  if (taskType) {
    values.push(taskType);
    where.push(`task_type = $${values.length}`);
  }
  if (status) {
    values.push(status);
    where.push(`status = $${values.length}`);
  }

  values.push(normalizeLimit(limit, 200, 1000));
  const limitPlaceholder = `$${values.length}`;
  const columns = USAGE_COLUMNS.join(", ");
  return {
    text: `
      select ${columns}
      from (
        select ${columns}
        from ai_usage
        where ${where.join(" and ")}
        order by created_at desc, id desc
        limit ${limitPlaceholder}
      ) usage_rows
      order by created_at asc, id asc
    `,
    values,
  };
}

export function normalizeUsageFiltersFromUrl(url) {
  return {
    from: url.searchParams.get("from") || "",
    to: url.searchParams.get("to") || "",
    task_type: url.searchParams.get("task_type") || "",
    status: url.searchParams.get("status") || "",
  };
}

function normalizeUsageRow(row) {
  return {
    ...row,
    prompt_tokens: Number(row.prompt_tokens || 0),
    completion_tokens: Number(row.completion_tokens || 0),
    total_tokens: Number(row.total_tokens || 0),
    estimated_cost: Number(row.estimated_cost || 0),
    created_at: normalizeDateValue(row.created_at),
  };
}

function normalizeUsageDraft(usage) {
  if (!usage.organization_id) throw new Error("usage.organization_id is required");
  if (!usage.user_id) throw new Error("usage.user_id is required");
  const promptTokens = Number(usage.prompt_tokens || 0);
  const completionTokens = Number(usage.completion_tokens || 0);
  const totalTokens = Number(usage.total_tokens || promptTokens + completionTokens || 0);
  return {
    id: usage.id || createId("use"),
    organization_id: usage.organization_id,
    user_id: usage.user_id,
    provider: String(usage.provider || "openai-compatible"),
    model: String(usage.model || "default"),
    task_type: String(usage.task_type || "chat"),
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    estimated_cost: Number(usage.estimated_cost || 0),
    status: String(usage.status || "success"),
    error: String(usage.error || ""),
    created_at: usage.created_at || new Date().toISOString(),
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
