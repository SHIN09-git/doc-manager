import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runMigrations } from "../src/db/migrations/migrationRunner.js";
import { buildAuditHistoryQuery, listAuditByOrganization } from "../src/db/repositories/auditRepository.js";
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
