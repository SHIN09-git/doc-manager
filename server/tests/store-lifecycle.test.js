import assert from "node:assert/strict";
import test from "node:test";
import { JsonStore } from "../src/db/jsonStore.js";
import { PostgresStore } from "../src/db/postgresStore.js";

test("JSON store shares one initialization across concurrent callers", async () => {
  const store = new JsonStore("unused.json");
  let initializeCount = 0;
  let releaseInitialization;
  store.initialize = async () => {
    initializeCount += 1;
    await new Promise((resolve) => {
      releaseInitialization = resolve;
    });
    store.ready = true;
  };

  const first = store.init();
  const second = store.init();
  await Promise.resolve();
  assert.equal(initializeCount, 1);
  releaseInitialization();
  await Promise.all([first, second]);
  assert.equal(store.ready, true);
});

test("PostgreSQL snapshot refresh waits for queued writes before reloading", async () => {
  const store = Object.create(PostgresStore.prototype);
  let releaseWrite;
  let loadCount = 0;
  store.init = async () => {};
  store.pruneOperationalData = async () => {};
  store.writeQueue = new Promise((resolve) => {
    releaseWrite = resolve;
  });
  store.data = { users: [{ id: "old" }] };
  store.loadAll = async () => {
    loadCount += 1;
    return { users: [{ id: "fresh" }] };
  };

  const pending = store.refresh();
  await Promise.resolve();
  assert.equal(loadCount, 0);
  releaseWrite();
  const snapshot = await pending;

  assert.equal(loadCount, 1);
  assert.equal(snapshot.users[0].id, "fresh");
  assert.equal(store.data, snapshot);
});
