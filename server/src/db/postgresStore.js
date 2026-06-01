import path from "node:path";
import { fileURLToPath } from "node:url";
import { createId } from "../utils/crypto.js";
import { normalizeData } from "./jsonStore.js";
import { runMigrations } from "./migrations/migrationRunner.js";
import { getAdminPreferences, upsertAdminPreferences, deleteAdminPreferences } from "./repositories/adminPreferenceRepository.js";
import { insertAuditLog, listAuditByOrganization } from "./repositories/auditRepository.js";
import { listDocumentsByOrganization } from "./repositories/documentRepository.js";
import { getOpsTriage, upsertOpsTriage } from "./repositories/opsTriageRepository.js";
import { insertUsageRecord, listUsageByOrganization } from "./repositories/usageRepository.js";
import {
  createWriterProfile,
  getWriterById,
  listWritersByOrganization,
  listWriterVersionsByWriter,
  restoreWriterVersion as restoreWriterVersionRecord,
  softDeleteWriterProfile,
  updateWriterProfile,
} from "./repositories/writerRepository.js";

const TABLES = {
  users: ["id", "email", "name", "avatar_url", "password_hash", "email_verified_at", "created_at", "updated_at", "last_login_at", "disabled_at"],
  organizations: ["id", "name", "slug", "plan", "plan_expires_at", "created_by", "created_at", "updated_at"],
  memberships: ["id", "organization_id", "user_id", "role", "created_at"],
  organization_invitations: ["id", "organization_id", "email", "role", "token_hash", "invited_by", "created_at", "expires_at", "accepted_at", "revoked_at"],
  email_verifications: ["id", "user_id", "token_hash", "created_at", "expires_at", "used_at"],
  password_resets: ["id", "user_id", "token_hash", "created_at", "expires_at", "used_at"],
  email_deliveries: ["id", "user_id", "email", "template", "provider", "status", "attempts", "error", "metadata", "created_at", "updated_at"],
  login_attempts: ["id", "email", "ip_hash", "success", "created_at"],
  documents: ["id", "organization_id", "owner_id", "title", "type", "folder_id", "content", "source", "local_id", "metadata", "version", "created_at", "updated_at", "deleted_at"],
  writer_profiles: ["id", "organization_id", "owner_id", "name", "handle", "category", "description", "enabled", "summary_md", "skill_json", "quality_report", "version", "created_at", "updated_at", "deleted_at"],
  writer_versions: ["id", "writer_profile_id", "version", "summary_md", "skill_json", "quality_report", "created_by", "created_at"],
  api_keys: ["id", "organization_id", "user_id", "provider", "scope", "encrypted_key", "key_hint", "created_at", "updated_at", "disabled_at"],
  ai_usage: ["id", "organization_id", "user_id", "provider", "model", "task_type", "prompt_tokens", "completion_tokens", "total_tokens", "estimated_cost", "status", "error", "created_at"],
  manual_payment_orders: ["id", "organization_id", "user_id", "package_id", "package_type", "title", "amount_cny", "credits", "plan", "duration_days", "payment_channel", "payer_note", "proof_text", "status", "reviewed_by", "reviewed_at", "review_note", "created_at", "updated_at"],
  credit_accounts: ["id", "organization_id", "user_id", "balance", "updated_at"],
  credit_ledger: ["id", "organization_id", "user_id", "order_id", "usage_id", "direction", "amount", "balance_after", "reason", "created_at"],
  ops_triage: ["id", "organization_id", "source_type", "source_id", "metadata", "updated_by", "created_at", "updated_at"],
  audit_logs: ["id", "organization_id", "user_id", "action", "target_type", "target_id", "metadata", "created_at"],
  system_events: ["id", "organization_id", "user_id", "level", "type", "message", "metadata", "created_at"],
  admin_preferences: ["id", "organization_id", "user_id", "preferences", "created_at", "updated_at"],
  sessions: ["id", "user_id", "token_hash", "expires_at", "created_at"],
  rate_limits: ["id", "organization_id", "user_id", "scope", "date", "count", "updated_at"],
  payment_webhooks: ["id", "provider", "event_id", "organization_id", "event_type", "payload", "processed_at", "created_at"],
};

const TABLE_ORDER = Object.keys(TABLES);
const JSON_COLUMNS = new Set(["metadata", "skill_json", "quality_report", "payload", "preferences"]);

export class PostgresStore {
  constructor({ databaseUrl }) {
    this.databaseUrl = databaseUrl;
    this.pool = null;
    this.data = null;
    this.ready = false;
    this.writeQueue = Promise.resolve();
    this.migrationResult = null;
  }

  async init() {
    if (this.ready) return;
    const { Pool } = await import("pg");
    this.pool = new Pool({ connectionString: this.databaseUrl });
    await this.applyMigrations();
    this.data = await this.loadAll();
    this.ready = true;
  }

  async read() {
    await this.init();
    return this.data;
  }

  async write(mutator) {
    const run = this.writeQueue.catch(() => null).then(async () => {
      await this.init();
      const client = await this.pool.connect();
      try {
        await client.query("begin");
        await client.query("select pg_advisory_xact_lock(hashtext('mowen_store_write'))");
        this.data = await this.loadAll(client);
        const result = await mutator(this.data);
        this.data = normalizeData(this.data);
        await this.saveAllWithClient(client, this.data);
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback").catch(() => null);
        throw error;
      } finally {
        client.release();
      }
    });
    this.writeQueue = run.catch(() => null);
    return run;
  }

  async health() {
    await this.init();
    await this.pool.query("select 1");
    return {
      ok: true,
      driver: "postgres",
      migrations: {
        applied: this.migrationResult?.applied?.length || 0,
        skipped: this.migrationResult?.skipped?.length || 0,
      },
    };
  }

  async close() {
    await this.pool?.end();
  }

  async applyMigrations() {
    const currentFile = fileURLToPath(import.meta.url);
    const migrationsDir = path.resolve(path.dirname(currentFile), "../../migrations");
    this.migrationResult = await runMigrations(this.pool, { migrationsDir });
  }

  async listUsageByOrganization(options) {
    await this.init();
    return listUsageByOrganization(this.pool, options);
  }

  async recordAiUsage(options = {}) {
    return this.repositoryWrite(async (client) => {
      const record = await insertUsageRecord(client, options);
      await insertAuditLog(client, {
        id: createId("aud"),
        organization_id: record.organization_id,
        user_id: record.user_id,
        action: "ai.chat",
        target_type: "ai_usage",
        target_id: record.id,
        metadata: {
          provider: record.provider,
          model: record.model,
          status: record.status,
          task_type: record.task_type,
        },
        created_at: record.created_at || new Date().toISOString(),
      });
      return record;
    });
  }

  async listAuditByOrganization(options) {
    await this.init();
    return listAuditByOrganization(this.pool, options);
  }

  async listDocumentsByOrganization(options) {
    await this.init();
    return listDocumentsByOrganization(this.pool, options);
  }

  async getAdminPreferences(options) {
    await this.init();
    return getAdminPreferences(this.pool, options);
  }

  async saveAdminPreferences(options = {}) {
    return this.repositoryWrite(async (client) => {
      const now = new Date().toISOString();
      const record = await upsertAdminPreferences(client, { ...options, now });
      await insertAuditLog(client, {
        id: createId("aud"),
        organization_id: options.organizationId,
        user_id: options.userId,
        action: "admin.preferences.update",
        target_type: "admin_preferences",
        target_id: record.id,
        metadata: {
          audit_filter_count: Array.isArray(record.preferences?.audit_filters)
            ? record.preferences.audit_filters.length
            : 0,
        },
        created_at: now,
      });
      return record;
    });
  }

  async clearAdminPreferences(options = {}) {
    return this.repositoryWrite(async (client) => {
      const now = new Date().toISOString();
      const result = await deleteAdminPreferences(client, options);
      await insertAuditLog(client, {
        id: createId("aud"),
        organization_id: options.organizationId,
        user_id: options.userId,
        action: "admin.preferences.clear",
        target_type: "admin_preferences",
        target_id: options.userId,
        metadata: {},
        created_at: now,
      });
      return result;
    });
  }

  async getOpsTriage(options) {
    await this.init();
    return getOpsTriage(this.pool, options);
  }

  async saveOpsTriage(options = {}) {
    return this.repositoryWrite(async (client) => {
      const now = new Date().toISOString();
      const record = await upsertOpsTriage(client, { ...options, now });
      await insertAuditLog(client, {
        id: createId("aud"),
        organization_id: options.organizationId,
        user_id: options.userId,
        action: "ops.error.triage",
        target_type: options.sourceType,
        target_id: options.sourceId,
        metadata: {
          triage_status: record.metadata?.triage_status || "",
          assignee: record.metadata?.assignee || "",
          sla_at: record.metadata?.sla_at || "",
        },
        created_at: now,
      });
      return record;
    });
  }

  async listWriterProfiles(options) {
    await this.init();
    return listWritersByOrganization(this.pool, options);
  }

  async getWriterProfile(options) {
    await this.init();
    return getWriterById(this.pool, options);
  }

  async createWriterProfile(options = {}) {
    return this.repositoryWrite(async (client) => {
      const now = new Date().toISOString();
      const writer = await createWriterProfile(client, { ...options, now });
      await insertAuditLog(client, {
        id: createId("aud"),
        organization_id: options.organizationId,
        user_id: options.userId,
        action: "writer.create",
        target_type: "writer",
        target_id: writer.id,
        metadata: { handle: writer.handle },
        created_at: now,
      });
      return writer;
    });
  }

  async updateWriterProfile(options = {}) {
    return this.repositoryWrite(async (client) => {
      const now = new Date().toISOString();
      const writer = await updateWriterProfile(client, { ...options, now });
      await insertAuditLog(client, {
        id: createId("aud"),
        organization_id: options.organizationId,
        user_id: options.userId,
        action: "writer.update",
        target_type: "writer",
        target_id: writer.id,
        metadata: { handle: writer.handle },
        created_at: now,
      });
      return writer;
    });
  }

  async deleteWriterProfile(options = {}) {
    return this.repositoryWrite(async (client) => {
      const now = new Date().toISOString();
      const writer = await softDeleteWriterProfile(client, { ...options, now });
      await insertAuditLog(client, {
        id: createId("aud"),
        organization_id: options.organizationId,
        user_id: options.userId,
        action: "writer.delete",
        target_type: "writer",
        target_id: writer.id,
        metadata: { handle: writer.handle },
        created_at: now,
      });
      return writer;
    });
  }

  async listWriterVersions(options) {
    await this.init();
    return listWriterVersionsByWriter(this.pool, options);
  }

  async restoreWriterVersion(options = {}) {
    return this.repositoryWrite(async (client) => {
      const now = new Date().toISOString();
      const writer = await restoreWriterVersionRecord(client, { ...options, now });
      await insertAuditLog(client, {
        id: createId("aud"),
        organization_id: options.organizationId,
        user_id: options.userId,
        action: "writer.version.restore",
        target_type: "writer",
        target_id: options.writerId,
        metadata: { version_id: options.versionId },
        created_at: now,
      });
      return writer;
    });
  }

  async repositoryWrite(callback) {
    const run = this.writeQueue.catch(() => null).then(async () => {
      await this.init();
      const client = await this.pool.connect();
      try {
        await client.query("begin");
        await client.query("select pg_advisory_xact_lock(hashtext('mowen_store_write'))");
        const result = await callback(client);
        this.data = await this.loadAll(client);
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback").catch(() => null);
        throw error;
      } finally {
        client.release();
      }
    });
    this.writeQueue = run.catch(() => null);
    return run;
  }

  async loadAll(client = this.pool) {
    const data = {};
    for (const table of TABLE_ORDER) {
      const result = await client.query(`select * from ${table}`);
      data[table] = result.rows;
    }
    return normalizeData(data);
  }

  async saveAll(data) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtext('mowen_store_write'))");
      await this.saveAllWithClient(client, data);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => null);
      throw error;
    } finally {
      client.release();
    }
  }

  async saveAllWithClient(client, data) {
    for (const table of [...TABLE_ORDER].reverse()) {
      await client.query(`delete from ${table}`);
    }
    for (const table of TABLE_ORDER) {
      await insertRows(client, table, data[table] || []);
    }
  }
}

async function insertRows(client, table, rows) {
  const columns = TABLES[table];
  for (const row of rows) {
    const values = columns.map((column) => serializeValue(column, row[column]));
    const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
    await client.query(
      `insert into ${table} (${columns.join(", ")}) values (${placeholders})`,
      values,
    );
  }
}

function serializeValue(column, value) {
  if (value === undefined) return null;
  if (JSON_COLUMNS.has(column)) return value && typeof value === "object" ? value : {};
  return value;
}
