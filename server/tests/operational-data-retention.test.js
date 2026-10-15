import assert from "node:assert/strict";
import test from "node:test";
import {
  pruneOperationalData,
  prunePostgresOperationalData,
} from "../src/db/operationalDataRetention.js";

const NOW = new Date("2026-07-17T12:00:00.000Z");

test("operational retention removes expired transient records and keeps recent ones", () => {
  const data = {
    sessions: [
      { id: "old", expires_at: "2026-07-17T11:59:59.000Z" },
      { id: "active", expires_at: "2026-07-18T00:00:00.000Z" },
    ],
    email_verifications: [
      { id: "old", expires_at: "2026-07-01T00:00:00.000Z" },
      { id: "recent", expires_at: "2026-07-15T00:00:00.000Z" },
    ],
    password_resets: [{ id: "old", expires_at: "2026-07-01T00:00:00.000Z" }],
    login_attempts: [
      { id: "old", created_at: "2026-06-01T00:00:00.000Z" },
      { id: "recent", created_at: "2026-07-17T00:00:00.000Z" },
    ],
    rate_limits: [
      { id: "old", date: "2026-05-01" },
      { id: "recent", updated_at: "2026-07-16T00:00:00.000Z" },
    ],
  };

  const result = pruneOperationalData(data, { now: NOW });

  assert.equal(result.changed, true);
  assert.deepEqual(data.sessions.map((item) => item.id), ["active"]);
  assert.deepEqual(data.email_verifications.map((item) => item.id), ["recent"]);
  assert.deepEqual(data.password_resets, []);
  assert.deepEqual(data.login_attempts.map((item) => item.id), ["recent"]);
  assert.deepEqual(data.rate_limits.map((item) => item.id), ["recent"]);
});

test("operational retention refunds stale AI credit reservations once", () => {
  const data = {
    credit_accounts: [{
      id: "crd_recovery",
      organization_id: "org_recovery",
      user_id: "usr_recovery",
      balance: 2,
      updated_at: "2026-07-17T09:00:00.000Z",
    }],
    ai_credit_reservations: [
      {
        id: "acr_stale",
        organization_id: "org_recovery",
        user_id: "usr_recovery",
        amount: 1,
        status: "reserved",
        created_at: "2026-07-17T10:00:00.000Z",
        updated_at: "2026-07-17T10:00:00.000Z",
      },
      {
        id: "acr_recent",
        organization_id: "org_recovery",
        user_id: "usr_recovery",
        amount: 1,
        status: "reserved",
        created_at: "2026-07-17T11:30:00.000Z",
        updated_at: "2026-07-17T11:30:00.000Z",
      },
    ],
  };

  const first = pruneOperationalData(data, { now: NOW });
  const second = pruneOperationalData(data, { now: NOW });

  assert.equal(first.recovered.ai_credit_reservations, 1);
  assert.equal(first.changed, true);
  assert.equal(second.recovered.ai_credit_reservations, 0);
  assert.equal(data.credit_accounts[0].balance, 3);
  assert.equal(data.ai_credit_reservations[0].status, "refunded");
  assert.equal(data.ai_credit_reservations[1].status, "reserved");
});

test("PostgreSQL retention uses the store write lock and commits all cleanup", async () => {
  const calls = [];
  const client = {
    async query(text, values = []) {
      calls.push({ text, values });
      return { rowCount: /^delete /.test(text) ? 1 : 0 };
    },
    release() {
      calls.push({ text: "release", values: [] });
    },
  };
  const pool = { async connect() { return client; } };

  const result = await prunePostgresOperationalData(pool, { now: NOW });

  assert.equal(result.changed, true);
  assert.equal(calls[0].text, "begin");
  assert.match(calls[1].text, /pg_advisory_xact_lock/);
  assert.match(calls[2].text, /with stale as/);
  assert.equal(calls.filter((call) => /^delete /.test(call.text)).length, 6);
  assert.equal(calls.at(-2).text, "commit");
  assert.equal(calls.at(-1).text, "release");
});

test("PostgreSQL retention rolls back and releases on failure", async () => {
  const calls = [];
  const client = {
    async query(text) {
      calls.push(text);
      if (/delete from password_resets/.test(text)) throw new Error("cleanup failed");
      return { rowCount: 0 };
    },
    release() {
      calls.push("release");
    },
  };

  await assert.rejects(
    () => prunePostgresOperationalData({ async connect() { return client; } }, { now: NOW }),
    /cleanup failed/,
  );
  assert.ok(calls.includes("rollback"));
  assert.equal(calls.at(-1), "release");
});
