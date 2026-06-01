import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runMigrations } from "../src/db/migrations/migrationRunner.js";
import { buildAdminPreferencesGetQuery, deleteAdminPreferences, getAdminPreferences, upsertAdminPreferences } from "../src/db/repositories/adminPreferenceRepository.js";
import { buildAuditHistoryQuery, insertAuditLog, listAuditByOrganization } from "../src/db/repositories/auditRepository.js";
import { buildDocumentListQuery, listDocumentsByOrganization } from "../src/db/repositories/documentRepository.js";
import { buildOpsTriageGetQuery, getOpsTriage, upsertOpsTriage } from "../src/db/repositories/opsTriageRepository.js";
import { buildUsageHistoryQuery, listUsageByOrganization } from "../src/db/repositories/usageRepository.js";
import {
  createWriterProfile,
  getWriterById,
  listWritersByOrganization,
  listWriterVersionsByWriter,
  restoreWriterVersion,
  softDeleteWriterProfile,
  updateWriterProfile,
} from "../src/db/repositories/writerRepository.js";

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

test("ops triage repository scopes records by organization source pair", async () => {
  const query = buildOpsTriageGetQuery({
    organizationId: "org_ops",
    sourceType: "ai_usage",
    sourceId: "use_failed",
  });

  assert.match(query.text, /from ops_triage/);
  assert.match(query.text, /organization_id = \$1 and source_type = \$2 and source_id = \$3/);
  assert.deepEqual(query.values, ["org_ops", "ai_usage", "use_failed"]);
});

test("ops triage repository reads and normalizes metadata", async () => {
  const pool = {
    async query(text, values) {
      return {
        rows: [{
          id: "tri_001",
          organization_id: values[0],
          source_type: values[1],
          source_id: values[2],
          metadata: "{\"triage_status\":\"processing\",\"assignee\":\"ops@example.com\"}",
          updated_by: "usr_ops",
          created_at: new Date("2026-05-24T01:00:00.000Z"),
          updated_at: new Date("2026-05-24T02:00:00.000Z"),
        }],
      };
    },
  };

  const record = await getOpsTriage(pool, {
    organizationId: "org_ops",
    sourceType: "ai_usage",
    sourceId: "use_failed",
  });

  assert.equal(record.organization_id, "org_ops");
  assert.equal(record.source_type, "ai_usage");
  assert.deepEqual(record.metadata, { triage_status: "processing", assignee: "ops@example.com" });
  assert.equal(record.updated_at, "2026-05-24T02:00:00.000Z");
});

test("ops triage repository updates an existing record", async () => {
  const calls = [];
  const pool = {
    async query(text, values) {
      calls.push({ text, values });
      if (/select/.test(text)) {
        return {
          rows: [{
            id: "tri_existing",
            organization_id: values[0],
            source_type: values[1],
            source_id: values[2],
            metadata: {},
            updated_by: "usr_old",
            created_at: "2026-05-24T01:00:00.000Z",
            updated_at: "2026-05-24T01:00:00.000Z",
          }],
        };
      }
      return {
        rows: [{
          id: values[0],
          organization_id: "org_ops",
          source_type: "ai_usage",
          source_id: "use_failed",
          metadata: values[1],
          updated_by: values[2],
          created_at: "2026-05-24T01:00:00.000Z",
          updated_at: values[3],
        }],
      };
    },
  };

  const record = await upsertOpsTriage(pool, {
    organizationId: "org_ops",
    sourceType: "ai_usage",
    sourceId: "use_failed",
    metadata: { triage_status: "resolved", note: "done" },
    userId: "usr_ops",
    now: "2026-05-24T03:00:00.000Z",
  });

  assert.match(calls[1].text, /update ops_triage/);
  assert.deepEqual(calls[1].values, [
    "tri_existing",
    { triage_status: "resolved", note: "done" },
    "usr_ops",
    "2026-05-24T03:00:00.000Z",
  ]);
  assert.equal(record.id, "tri_existing");
  assert.deepEqual(record.metadata, { triage_status: "resolved", note: "done" });
});

test("ops triage repository inserts a new scoped record", async () => {
  const calls = [];
  const pool = {
    async query(text, values) {
      calls.push({ text, values });
      if (/select/.test(text)) return { rows: [] };
      return {
        rows: [{
          id: values[0],
          organization_id: values[1],
          source_type: values[2],
          source_id: values[3],
          metadata: values[4],
          updated_by: values[5],
          created_at: values[6],
          updated_at: values[7],
        }],
      };
    },
  };

  const record = await upsertOpsTriage(pool, {
    organizationId: "org_ops",
    sourceType: "ai_usage",
    sourceId: "use_new_failed",
    metadata: { triage_status: "processing" },
    userId: "usr_ops",
    now: "2026-05-24T04:00:00.000Z",
  });

  assert.match(calls[1].text, /insert into ops_triage/);
  assert.match(record.id, /^tri_/);
  assert.deepEqual(calls[1].values.slice(1, 5), [
    "org_ops",
    "ai_usage",
    "use_new_failed",
    { triage_status: "processing" },
  ]);
  assert.equal(record.updated_by, "usr_ops");
});

test("writer repository lists organization writers and normalizes rows", async () => {
  let captured = null;
  const pool = {
    async query(text, values) {
      captured = { text, values };
      return {
        rows: [writerRow({
          id: "wrt_001",
          organization_id: values[0],
          handle: "notice",
          version: "3",
          skill_json: "{\"style\":\"formal\"}",
          quality_report: "{\"score\":88}",
          updated_at: new Date("2026-05-24T02:00:00.000Z"),
        })],
      };
    },
  };

  const writers = await listWritersByOrganization(pool, {
    organizationId: "org_writer",
  });

  assert.match(captured.text, /from writer_profiles/);
  assert.match(captured.text, /deleted_at is null/);
  assert.deepEqual(captured.values, ["org_writer"]);
  assert.equal(writers[0].organization_id, "org_writer");
  assert.equal(writers[0].version, 3);
  assert.deepEqual(writers[0].skill_json, { style: "formal" });
  assert.deepEqual(writers[0].quality_report, { score: 88 });
  assert.equal(writers[0].updated_at, "2026-05-24T02:00:00.000Z");
});

test("writer repository creates a writer and initial version", async () => {
  const calls = [];
  const pool = {
    async query(text, values) {
      calls.push({ text, values });
      if (/select id\s+from writer_profiles/.test(text)) return { rows: [] };
      if (/insert into writer_profiles/.test(text)) {
        return { rows: [writerRow({
          id: values[0],
          organization_id: values[1],
          owner_id: values[2],
          name: values[3],
          handle: values[4],
          category: values[5],
          description: values[6],
          enabled: values[7],
          summary_md: values[8],
          skill_json: values[9],
          quality_report: values[10],
          version: values[11],
          created_at: values[12],
          updated_at: values[13],
          deleted_at: values[14],
        })] };
      }
      if (/insert into writer_versions/.test(text)) {
        return { rows: [writerVersionRow({
          id: values[0],
          writer_profile_id: values[1],
          version: values[2],
          summary_md: values[3],
          skill_json: values[4],
          quality_report: values[5],
          created_by: values[6],
          created_at: values[7],
        })] };
      }
      return { rows: [] };
    },
  };

  const writer = await createWriterProfile(pool, {
    organizationId: "org_writer",
    userId: "usr_writer",
    draft: {
      name: "通知执笔人",
      handle: "notice",
      category: "公文写作",
      description: "生成通知",
      enabled: true,
      summary_md: "v1",
      skill_json: { style: "formal" },
      quality_report: { score: 90 },
    },
    now: "2026-05-24T03:00:00.000Z",
  });

  assert.match(writer.id, /^wrt_/);
  assert.equal(writer.version, 1);
  assert.equal(writer.handle, "notice");
  assert.match(calls[1].text, /insert into writer_profiles/);
  assert.match(calls[2].text, /insert into writer_versions/);
  assert.equal(calls[2].values[1], writer.id);
  assert.equal(calls[2].values[2], 1);
  assert.deepEqual(calls[2].values[4], { style: "formal" });
});

test("writer repository maps database handle conflicts to domain errors", async () => {
  const pool = {
    async query(text) {
      if (/select id\s+from writer_profiles/.test(text)) return { rows: [] };
      if (/insert into writer_profiles/.test(text)) {
        const error = new Error("duplicate key value violates unique constraint");
        error.code = "23505";
        throw error;
      }
      throw new Error("version insert should not run");
    },
  };

  await assert.rejects(
    () => createWriterProfile(pool, {
      organizationId: "org_writer",
      userId: "usr_writer",
      draft: {
        name: "通知执笔人",
        handle: "notice",
        category: "公文写作",
        description: "",
        enabled: true,
        summary_md: "",
        skill_json: {},
        quality_report: {},
      },
    }),
    (error) => {
      assert.equal(error.code, "handle_exists");
      assert.equal(error.details.handle, "notice");
      return true;
    },
  );
});

test("writer repository updates a writer and creates a new version", async () => {
  const calls = [];
  const pool = {
    async query(text, values) {
      calls.push({ text, values });
      if (/select id\s+from writer_profiles/.test(text)) return { rows: [] };
      if (/from writer_profiles/.test(text) && /limit 1/.test(text)) {
        return { rows: [writerRow({
          id: values[1],
          organization_id: values[0],
          handle: "notice",
          version: 2,
        })] };
      }
      if (/update writer_profiles/.test(text)) {
        return { rows: [writerRow({
          id: values[10],
          organization_id: values[11],
          name: values[0],
          handle: values[1],
          category: values[2],
          description: values[3],
          enabled: values[4],
          summary_md: values[5],
          skill_json: values[6],
          quality_report: values[7],
          version: values[8],
          updated_at: values[9],
        })] };
      }
      if (/insert into writer_versions/.test(text)) {
        return { rows: [writerVersionRow({
          id: values[0],
          writer_profile_id: values[1],
          version: values[2],
          summary_md: values[3],
          skill_json: values[4],
          quality_report: values[5],
          created_by: values[6],
          created_at: values[7],
        })] };
      }
      return { rows: [] };
    },
  };

  const writer = await updateWriterProfile(pool, {
    organizationId: "org_writer",
    writerId: "wrt_001",
    userId: "usr_writer",
    expectedVersion: 2,
    draft: {
      name: "通知执笔人新版",
      handle: "notice-new",
      category: "公文写作",
      description: "生成正式通知",
      enabled: false,
      summary_md: "v3",
      skill_json: { style: "strict" },
      quality_report: { score: 96 },
    },
    now: "2026-05-24T04:00:00.000Z",
  });

  assert.equal(writer.version, 3);
  assert.equal(writer.enabled, false);
  assert.match(calls[2].text, /update writer_profiles/);
  assert.match(calls[3].text, /insert into writer_versions/);
  assert.equal(calls[3].values[2], 3);
});

test("writer repository reports version conflicts before updating", async () => {
  const pool = {
    async query(text, values) {
      if (/from writer_profiles/.test(text)) {
        return { rows: [writerRow({
          id: values[1],
          organization_id: values[0],
          version: 4,
        })] };
      }
      throw new Error("update should not run");
    },
  };

  await assert.rejects(
    () => updateWriterProfile(pool, {
      organizationId: "org_writer",
      writerId: "wrt_conflict",
      userId: "usr_writer",
      expectedVersion: 3,
      draft: {
        name: "冲突执笔人",
        handle: "conflict",
        category: "公文写作",
        description: "",
        enabled: true,
        summary_md: "",
        skill_json: {},
        quality_report: {},
      },
    }),
    (error) => {
      assert.equal(error.code, "version_conflict");
      assert.equal(error.details.current_version, 4);
      return true;
    },
  );
});

test("writer repository restores a version and snapshots the restore", async () => {
  const calls = [];
  const pool = {
    async query(text, values) {
      calls.push({ text, values });
      if (/from writer_profiles/.test(text)) {
        return { rows: [writerRow({
          id: values[1],
          organization_id: values[0],
          handle: "notice",
          version: 3,
        })] };
      }
      if (/from writer_versions/.test(text)) {
        return { rows: [writerVersionRow({
          id: values[1],
          writer_profile_id: values[0],
          version: 1,
          summary_md: "restored",
          skill_json: { style: "old" },
          quality_report: { score: 80 },
        })] };
      }
      if (/update writer_profiles/.test(text)) {
        return { rows: [writerRow({
          id: values[5],
          organization_id: values[6],
          handle: "notice",
          summary_md: values[0],
          skill_json: values[1],
          quality_report: values[2],
          version: values[3],
          updated_at: values[4],
        })] };
      }
      if (/insert into writer_versions/.test(text)) {
        return { rows: [writerVersionRow({
          id: values[0],
          writer_profile_id: values[1],
          version: values[2],
          summary_md: values[3],
          skill_json: values[4],
          quality_report: values[5],
          created_by: values[6],
          created_at: values[7],
        })] };
      }
      return { rows: [] };
    },
  };

  const writer = await restoreWriterVersion(pool, {
    organizationId: "org_writer",
    writerId: "wrt_001",
    versionId: "ver_001",
    userId: "usr_writer",
    now: "2026-05-24T05:00:00.000Z",
  });

  assert.equal(writer.version, 4);
  assert.equal(writer.summary_md, "restored");
  assert.deepEqual(writer.skill_json, { style: "old" });
  assert.match(calls[3].text, /insert into writer_versions/);
  assert.equal(calls[3].values[2], 4);
});

test("writer repository soft deletes one active writer", async () => {
  let captured = null;
  const pool = {
    async query(text, values) {
      captured = { text, values };
      return { rows: [writerRow({
        id: values[1],
        organization_id: values[0],
        deleted_at: new Date(values[2]),
        updated_at: new Date(values[2]),
      })] };
    },
  };

  const writer = await softDeleteWriterProfile(pool, {
    organizationId: "org_writer",
    writerId: "wrt_delete",
    now: "2026-05-24T06:00:00.000Z",
  });

  assert.match(captured.text, /update writer_profiles/);
  assert.deepEqual(captured.values, ["org_writer", "wrt_delete", "2026-05-24T06:00:00.000Z"]);
  assert.equal(writer.deleted_at, "2026-05-24T06:00:00.000Z");
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

function writerRow(overrides = {}) {
  return {
    id: "wrt_default",
    organization_id: "org_default",
    owner_id: "usr_default",
    name: "默认执笔人",
    handle: "default",
    category: "自定义",
    description: "",
    enabled: true,
    summary_md: "",
    skill_json: {},
    quality_report: {},
    version: 1,
    created_at: "2026-05-24T00:00:00.000Z",
    updated_at: "2026-05-24T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

function writerVersionRow(overrides = {}) {
  return {
    id: "ver_default",
    writer_profile_id: "wrt_default",
    version: 1,
    summary_md: "",
    skill_json: {},
    quality_report: {},
    created_by: "usr_default",
    created_at: "2026-05-24T00:00:00.000Z",
    ...overrides,
  };
}

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
