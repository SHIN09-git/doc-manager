import assert from "node:assert/strict";
import test from "node:test";
import { EventBus } from "../src/core/eventBus.js";

test("EventBus emits data and supports unsubscribe", () => {
  const bus = new EventBus();
  const received = [];
  const off = bus.on("demo", (payload) => received.push(payload));
  bus.emit("demo", { ok: true });
  off();
  bus.emit("demo", { ok: false });
  assert.deepEqual(received, [{ ok: true }]);
});

test("EventBus.clear removes all listeners", () => {
  const bus = new EventBus();
  let count = 0;
  bus.on("demo", () => {
    count += 1;
  });
  bus.clear();
  bus.emit("demo");
  assert.equal(count, 0);
});
