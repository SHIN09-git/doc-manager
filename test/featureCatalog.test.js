import { test } from "node:test";
import assert from "node:assert/strict";
import { getFeatureByAction, getFeatureGroups, WORKBENCH_FEATURES } from "../src/modules/product/featureCatalog.js";

test("feature catalog keeps core workbench capabilities discoverable", () => {
  const ids = new Set(WORKBENCH_FEATURES.map((feature) => feature.id));
  const actions = new Set(WORKBENCH_FEATURES.map((feature) => feature.action));
  assert.equal(ids.size, WORKBENCH_FEATURES.length);
  assert.equal(actions.size, WORKBENCH_FEATURES.length);
  ["documents", "writer-use", "writer-build", "draft", "ppt", "billing", "admin"].forEach((id) => {
    assert.ok(ids.has(id), `${id} should be listed`);
  });
  WORKBENCH_FEATURES.forEach((feature) => {
    assert.ok(feature.title);
    assert.ok(feature.summary);
    assert.ok(feature.entry);
    assert.ok(Array.isArray(feature.outputs) && feature.outputs.length > 0);
  });
});

test("feature catalog groups and resolves actions for the UI map", () => {
  const groups = getFeatureGroups();
  assert.deepEqual(groups.map((group) => group.name), ["资料与文档", "执笔人", "生成与演示", "云端与商业化"]);
  assert.equal(getFeatureByAction("billing").title, "套餐与充值");
  assert.equal(getFeatureByAction("missing"), null);
});
