import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pruneOperationalData } from "./operationalDataRetention.js";

export const EMPTY_DATA = {
  users: [],
  organizations: [],
  memberships: [],
  organization_invitations: [],
  email_verifications: [],
  password_resets: [],
  email_deliveries: [],
  login_attempts: [],
  documents: [],
  writer_profiles: [],
  writer_versions: [],
  ai_usage: [],
  manual_payment_orders: [],
  credit_accounts: [],
  ai_credit_reservations: [],
  credit_ledger: [],
  ops_triage: [],
  api_keys: [],
  audit_logs: [],
  system_events: [],
  admin_preferences: [],
  sessions: [],
  rate_limits: [],
  payment_webhooks: [],
};

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = structuredClone(EMPTY_DATA);
    this.ready = false;
    this.initPromise = null;
    this.writeQueue = Promise.resolve();
  }

  async init() {
    if (this.ready) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.initialize();
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  async initialize() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const raw = await readFile(this.filePath, "utf8");
      this.data = normalizeData(JSON.parse(raw));
      const cleanup = pruneOperationalData(this.data);
      if (cleanup.changed) await this.save();
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      this.data = structuredClone(EMPTY_DATA);
      await this.save();
    }
    this.ready = true;
  }

  async read() {
    await this.init();
    return this.data;
  }

  async write(mutator) {
    const run = this.writeQueue.catch(() => null).then(async () => {
      await this.init();
      const draft = structuredClone(this.data);
      const result = await mutator(draft);
      this.data = normalizeData(draft);
      pruneOperationalData(this.data);
      await this.save();
      return result;
    });
    this.writeQueue = run.catch(() => null);
    return run;
  }

  async health() {
    await this.init();
    return { ok: true, driver: "json", file: this.filePath };
  }

  async save() {
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(this.data, null, 2)}\n`, "utf8");
    await rename(tempPath, this.filePath);
  }
}

export function normalizeData(data = {}) {
  const next = structuredClone(EMPTY_DATA);
  for (const key of Object.keys(next)) {
    next[key] = Array.isArray(data[key]) ? data[key] : [];
  }
  next.documents = next.documents.map((document) => ({
    ...document,
    version: Number(document.version || 1),
  }));
  next.writer_profiles = next.writer_profiles.map((writer) => ({
    ...writer,
    version: Number(writer.version || 1),
  }));
  next.organizations = next.organizations.map((organization) => ({
    ...organization,
    plan_expires_at: organization.plan_expires_at || null,
  }));
  next.credit_accounts = next.credit_accounts.map((account) => ({
    ...account,
    balance: Number(account.balance || 0),
  }));
  next.ai_credit_reservations = next.ai_credit_reservations.map((reservation) => ({
    ...reservation,
    usage_id: reservation.usage_id || null,
    amount: Math.max(1, Math.floor(Number(reservation.amount || 1))),
    balance_after: Number(reservation.balance_after || 0),
    status: ["reserved", "settled", "refunded"].includes(reservation.status)
      ? reservation.status
      : "reserved",
  }));
  next.manual_payment_orders = next.manual_payment_orders.map((order) => ({
    ...order,
    amount_cny: Number(order.amount_cny || 0),
    credits: Number(order.credits || 0),
    duration_days: Number(order.duration_days || 0),
    status: order.status || "pending",
  }));
  next.credit_ledger = next.credit_ledger.map((entry) => ({
    ...entry,
    amount: Number(entry.amount || 0),
    balance_after: Number(entry.balance_after || 0),
  }));
  return next;
}
