import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runMigrations } from "../src/db/migrations/migrationRunner.js";
import { buildAdminPreferencesGetQuery, deleteAdminPreferences, getAdminPreferences, upsertAdminPreferences } from "../src/db/repositories/adminPreferenceRepository.js";
import { buildAuditHistoryQuery, insertAuditLog, listAuditByOrganization } from "../src/db/repositories/auditRepository.js";
import { buildDocumentListQuery, listDocumentsByOrganization } from "../src/db/repositories/documentRepository.js";
import { buildUsageHistoryQuery, listUsageByOrganization } from "../src/db/repositories/usageRepository.js";

test("migration runner records executed versions and skips repeats", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mowen-migrations-"));
  try {
    await writeFile(path.join(dir, "001_initial.sql"), "create table if not exists sample_one (id text primary key);", "utf8");
    await writeFile(path.join(dir, "002_usage_index.sql"), "create index if not exists idx_sample_one_id on sample_one (id);", "utf8");
    const pool = createMigrationPool();

    const first = await runMigrations(pool, { migrationsDir: dir });
    assert.deepEqual(first.applied.map((item) => item.id), ["001_initial", "002_usage_index"]);
    assert.deepEqual(first.skipped, []);
    assert.ok(pool.applied.has("001_initial"));
    assert.ok(pool.applied.has("002_usage_index"));

    const second = await runMigrations(pool, { migrationsDir: dir });
    assert.deepEqual(second.applied, []);
    assert.deepEqual(second.skipped.map((item) => item.id), ["001_initial", "002_usage_index"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("usage repository query is organization-scoped and applies limit", async () => {
  const query = buildUsageHistoryQuery({
    organizationId: "org_001",
    filters: { task_type: "draft", status: "success" },
    limit: 3,
  });

  assert.match(query.text, /from ai_usage/);
  assert.match(query.text, /organization_id = \$1/);
  assert.match(query.text, /task_type = \$2/);
  assert.match(query.text, /status = \$3/);
  assert.match(query.text, /limit \$4/);
  assert.deepEqual(query.values, ["org_001", "draft", "success", 3]);
});

test("usage repository can scope history to one user before applying limit", async () => {
  const query = buildUsageHistoryQuery({
    organizationId: "org_001",
    userId: "usr_001",
    filters: { task_type: "draft", status: "success" },
    limit: 3,
  });

  assert.match(query.text, /organization_id = \$1/);
  assert.match(query.text, /user_id = \$2/);
  assert.match(query.text, /task_type = \$3/);
  assert.match(query.text, /status = \$4/);
  assert.match(query.text, /limit \$5/);
  assert.deepEqual(query.values, ["org_001", "usr_001", "draft", "success", 3]);
});

test("usage repository normalizes PostgreSQL rows without exposing other organizations", async () => {
  let captured = null;
  const pool = {
    async query(text, values) {
      captured = { text, values };
      return {
        rows: [{
          id: "use_001",
          organization_id: values[0],
          user_id: "usr_001",
          provider: "openai",
          model: "gpt-test",
          task_type: "draft",
          prompt_tokens: "10",
          completion_tokens: "15",
          total_tokens: "25",
          estimated_cost: "0.12",
          status: "success",
          error: "",
          created_at: new Date("2026-05-24T01:02:03.000Z"),
        }],
      };
    },
  };

  const usage = await listUsageByOrganization(pool, {
    organizationId: "org_abc",
    filters: { status: "success" },
    limit: 1,
  });

  assert.equal(captured.values[0], "org_abc");
  assert.equal(captured.values.at(-1), 1);
  assert.equal(usage.length, 1);
  assert.equal(usage[0].organization_id, "org_abc");
  assert.equal(usage[0].total_tokens, 25);
  assert.equal(usage[0].estimated_cost, 0.12);
  assert.equal(usage[0].created_at, "2026-05-24T01:02:03.000Z");
});

test("audit repository query is organization-scoped and filterable", async () => {
  const query = buildAuditHistoryQuery({
    organizationId: "org_audit",
    filters: {
      from: "2026-05-01",
      to: "2026-05-24",
      action: "organization.update",
      target_type: "organization",
    },
    limit: 5,
  });

  assert.match(query.text, /from audit_logs/);
  assert.match(query.text, /organization_id = \$1/);
  assert.match(query.text, /created_at >= \$2/);
  assert.match(query.text, /created_at < \$3/);
  assert.match(query.text, /action = \$4/);
  assert.match(query.text, /target_type = \$5/);
  assert.match(query.text, /limit \$6/);
  assert.deepEqual(query.values, [
    "org_audit",
    "2026-05-01",
    "2026-05-25T00:00:00.000Z",
    "organization.update",
    "organization",
    5,
  ]);
});

test("audit repository normalizes metadata and dates", async () => {
  let captured = null;
  const pool = {
    async query(text, values) {
      captured = { text, values };
      return {
        rows: [{
          id: "aud_001",
          organization_id: values[0],
          user_id: "usr_001",
          action: "organization.update",
          target_type: "organization",
          target_id: values[0],
          metadata: "{\"name\":\"新组织\"}",
          created_at: new Date("2026-05-24T02:03:04.000Z"),
        }],
      };
    },
  };

  const logs = await listAuditByOrganization(pool, {
    organizationId: "org_audit_rows",
    filters: { action: "organization.update" },
    limit: 1,
  });

  assert.equal(captured.values[0], "org_audit_rows");
  assert.equal(captured.values.at(-1), 1);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].organization_id, "org_audit_rows");
  assert.deepEqual(logs[0].metadata, { name: "新组织" });
  assert.equal(logs[0].created_at, "2026-05-24T02:03:04.000Z");
});

test("audit repository can insert audit logs without snapshot writes", async () => {
  let captured = null;
  const pool = {
    async query(text, values) {
      captured = { text, values };
      return {
        rows: [{
          id: values[0],
          organization_id: values[1],
          user_id: values[2],
          action: values[3],
          target_type: values[4],
          target_id: values[5],
          metadata: values[6],
          created_at: new Date(values[7]),
        }],
      };
    },
  };

  const entry = await insertAuditLog(pool, {
    id: "aud_pref",
    organization_id: "org_pref",
    user_id: "usr_pref",
    action: "admin.preferences.update",
    target_type: "admin_preferences",
    target_id: "pref_001",
    metadata: { audit_filter_count: 2 },
    created_at: "2026-05-24T03:04:05.000Z",
  });

  assert.match(captured.text, /insert into audit_logs/);
  assert.deepEqual(captured.values.slice(0, 6), [
    "aud_pref",
    "org_pref",
    "usr_pref",
    "admin.preferences.update",
    "admin_preferences",
    "pref_001",
  ]);
  assert.deepEqual(entry.metadata, { audit_filter_count: 2 });
  assert.equal(entry.created_at, "2026-05-24T03:04:05.000Z");
});

test("admin preferences repository scopes preferences to one organization user", async () => {
  const query = buildAdminPreferencesGetQuery({
    organizationId: "org_pref",
    userId: "usr_pref",
  });

  assert.match(query.text, /from admin_preferences/);
  assert.match(query.text, /organization_id = \$1 and user_id = \$2/);
  assert.match(query.text, /limit 1/);
  assert.deepEqual(query.values, ["org_pref", "usr_pref"]);
});

test("admin preferences repository reads and normalizes preferences", async () => {
  const pool = {
    async query(text, values) {
      return {
        rows: [{
          id: "pref_001",
          organization_id: values[0],
          user_id: values[1],
          preferences: "{\"audit_filters\":[{\"name\":\"daily\"}]}",
          created_at: new Date("2026-05-24T01:00:00.000Z"),
          updated_at: new Date("2026-05-24T02:00:00.000Z"),
        }],
      };
    },
  };

  const record = await getAdminPreferences(pool, {
    organizationId: "org_pref",
    userId: "usr_pref",
  });

  assert.equal(record.organization_id, "org_pref");
  assert.equal(record.user_id, "usr_pref");
  assert.deepEqual(record.preferences, { audit_filters: [{ name: "daily" }] });
  assert.equal(record.updated_at, "2026-05-24T02:00:00.000Z");
});

test("admin preferences repository updates the latest existing record", async () => {
  const calls = [];
  const pool = {
    async query(text, values) {
      calls.push({ text, values });
      if (/select/.test(text)) {
        return {
          rows: [{
            id: "pref_existing",
            organization_id: values[0],
            user_id: values[1],
            preferences: {},
            created_at: "2026-05-24T01:00:00.000Z",
            updated_at: "2026-05-24T01:00:00.000Z",
          }],
        };
      }
      return {
        rows: [{
          id: values[0],
          organization_id: "org_pref",
          user_id: "usr_pref",
          preferences: values[1],
          created_at: "2026-05-24T01:00:00.000Z",
          updated_at: values[2],
        }],
      };
    },
  };

  const record = await upsertAdminPreferences(pool, {
    organizationId: "org_pref",
    userId: "usr_pref",
    preferences: { feedback_filter: { status: "pending" } },
    now: "2026-05-24T03:00:00.000Z",
  });

  assert.match(calls[1].text, /update admin_preferences/);
  assert.deepEqual(calls[1].values, [
    "pref_existing",
    { feedback_filter: { status: "pending" } },
    "2026-05-24T03:00:00.000Z",
  ]);
  assert.equal(record.id, "pref_existing");
  assert.deepEqual(record.preferences, { feedback_filter: { status: "pending" } });
});

test("admin preferences repository inserts and deletes scoped preferences", async () => {
  const calls = [];
  const pool = {
    async query(text, values) {
      calls.push({ text, values });
      if (/select/.test(text)) return { rows: [] };
      if (/insert into admin_preferences/.test(text)) {
        return {
          rows: [{
            id: values[0],
            organization_id: values[1],
            user_id: values[2],
            preferences: values[3],
            created_at: values[4],
            updated_at: values[5],
          }],
        };
      }
      if (/delete from admin_preferences/.test(text)) return { rows: [], rowCount: 2 };
      return { rows: [], rowCount: 0 };
    },
  };

  const inserted = await upsertAdminPreferences(pool, {
    organizationId: "org_pref",
    userId: "usr_pref",
    preferences: { error_filter: { level: "warn" } },
    now: "2026-05-24T04:00:00.000Z",
  });
  const deleted = await deleteAdminPreferences(pool, {
    organizationId: "org_pref",
    userId: "usr_pref",
  });

  assert.match(inserted.id, /^pref_/);
  assert.equal(calls[1].values[1], "org_pref");
  assert.deepEqual(calls[1].values[3], { error_filter: { level: "warn" } });
  assert.match(calls[2].text, /delete from admin_preferences/);
  assert.deepEqual(calls[2].values, ["org_pref", "usr_pref"]);
  assert.deepEqual(deleted, { deleted_count: 2 });
});

test("document repository query supports pagination without deleted documents by default", async () => {
  const query = buildDocumentListQuery({
    organizationId: "org_docs",
    filters: {
      type: "通知",
      folder_id: "folder_001",
      cursor_updated_at: "2026-05-24T10:00:00.000Z",
      cursor_id: "doc_010",
    },
    limit: 20,
  });

  assert.match(query.text, /from documents/);
  assert.match(query.text, /organization_id = \$1/);
  assert.match(query.text, /deleted_at is null/);
  assert.match(query.text, /type = \$2/);
  assert.match(query.text, /folder_id = \$3/);
  assert.match(query.text, /\(updated_at, id\) < \(\$4, \$5\)/);
  assert.match(query.text, /limit \$6/);
  assert.deepEqual(query.values, [
    "org_docs",
    "通知",
    "folder_001",
    "2026-05-24T10:00:00.000Z",
    "doc_010",
    21,
  ]);
});

test("document repository can include deleted documents and returns page info", async () => {
  let captured = null;
  const pool = {
    async query(text, values) {
      captured = { text, values };
      return {
        rows: [{
          id: "doc_001",
          organization_id: values[0],
          owner_id: "usr_001",
          title: "云端文档",
          type: "通知",
          folder_id: "",
          content: "正文",
          source: "cloud",
          local_id: "",
          metadata: { origin: "test" },
          version: "3",
          created_at: new Date("2026-05-23T01:00:00.000Z"),
          updated_at: new Date("2026-05-24T01:00:00.000Z"),
          deleted_at: null,
        }, {
          id: "doc_002",
          organization_id: values[0],
          owner_id: "usr_001",
          title: "下一页文档",
          type: "通知",
          folder_id: "",
          content: "正文",
          source: "cloud",
          local_id: "",
          metadata: {},
          version: 1,
          created_at: new Date("2026-05-22T01:00:00.000Z"),
          updated_at: new Date("2026-05-23T01:00:00.000Z"),
          deleted_at: null,
        }],
      };
    },
  };

  const result = await listDocumentsByOrganization(pool, {
    organizationId: "org_docs_rows",
    filters: { include_deleted: true },
    limit: 1,
  });

  assert.equal(captured.values[0], "org_docs_rows");
  assert.equal(captured.values.at(-1), 2);
  assert.doesNotMatch(captured.text, /deleted_at is null/);
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].organization_id, "org_docs_rows");
  assert.equal(result.documents[0].version, 3);
  assert.equal(result.documents[0].updated_at, "2026-05-24T01:00:00.000Z");
  assert.deepEqual(result.page_info, {
    limit: 1,
    has_more: true,
    next_cursor: {
      updated_at: "2026-05-24T01:00:00.000Z",
      id: "doc_001",
    },
  });
});

function createMigrationPool() {
  const pool = {
    applied: new Set(),
    statements: [],
    async query(sql) {
      this.statements.push(sql);
      return { rows: [], rowCount: 0 };
    },
    async connect() {
      return createMigrationClient(this);
    },
  };
  return pool;
}

function createMigrationClient(pool) {
  return {
    async query(sql, values = []) {
      pool.statements.push(sql);
      const normalized = String(sql).trim().toLowerCase();
      if (normalized.startsWith("select id from migration_versions")) {
        const id = values[0];
        return pool.applied.has(id) ? { rows: [{ id }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (normalized.startsWith("insert into migration_versions")) {
        pool.applied.add(values[0]);
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
}
