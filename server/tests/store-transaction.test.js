import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";
import { JsonStore, normalizeData } from "../src/db/jsonStore.js";
import { PostgresStore } from "../src/db/postgresStore.js";

test("JsonStore.write does not keep mutations when the mutator throws", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mowen-json-store-"));
  const store = new JsonStore(path.join(tempDir, "db.json"));
  try {
    await store.init();
    await assert.rejects(
      () => store.write((data) => {
        data.users.push({ id: "usr_leaked", email: "leaked@example.com" });
        throw new Error("boom");
      }),
      /boom/,
    );

    assert.equal((await store.read()).users.some((user) => user.id === "usr_leaked"), false);

    await store.write((data) => {
      data.users.push({ id: "usr_saved", email: "saved@example.com" });
    });

    const data = await store.read();
    assert.deepEqual(data.users.map((user) => user.id), ["usr_saved"]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("PostgresStore.write leaves the memory snapshot untouched after rollback", async () => {
  const client = {
    queries: [],
    async query(sql) {
      this.queries.push(sql);
    },
    release() {
      this.released = true;
    },
  };
  let databaseData = normalizeData({
    users: [{ id: "usr_initial", email: "initial@example.com" }],
  });
  let saveCount = 0;
  const store = Object.create(PostgresStore.prototype);
  Object.assign(store, {
    data: structuredClone(databaseData),
    writeQueue: Promise.resolve(),
    pool: { connect: async () => client },
    init: async () => {},
    loadAll: async () => structuredClone(databaseData),
    saveAllWithClient: async (_client, data) => {
      saveCount += 1;
      databaseData = structuredClone(data);
    },
  });

  await assert.rejects(
    () => store.write((data) => {
      data.users.push({ id: "usr_leaked", email: "leaked@example.com" });
      throw new Error("boom");
    }),
    /boom/,
  );

  assert.equal(saveCount, 0);
  assert.deepEqual(store.data.users.map((user) => user.id), ["usr_initial"]);
  assert.equal(client.queries.some((sql) => String(sql).toLowerCase() === "rollback"), true);

  await store.write((data) => {
    data.users.push({ id: "usr_saved", email: "saved@example.com" });
  });

  assert.equal(saveCount, 1);
  assert.deepEqual(store.data.users.map((user) => user.id), ["usr_initial", "usr_saved"]);
  assert.deepEqual(databaseData.users.map((user) => user.id), ["usr_initial", "usr_saved"]);
});
