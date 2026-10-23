import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const CONTRACTS = [
  { html: "index.html", script: "app.js" },
  { html: "admin.html", script: "src/admin/adminPage.js" },
];

for (const contract of CONTRACTS) {
  test(`${contract.html} has unique ids and contains every bound element`, async () => {
    const [html, script] = await Promise.all([
      readFile(new URL(`../${contract.html}`, import.meta.url), "utf8"),
      readFile(new URL(`../${contract.script}`, import.meta.url), "utf8"),
    ]);
    const htmlIds = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
    const duplicateIds = htmlIds.filter((id, index) => htmlIds.indexOf(id) !== index);
    assert.deepEqual([...new Set(duplicateIds)], [], "HTML contains duplicate ids");

    const bindingBlock = script.match(/function bindElements\(\)\s*\{\s*\[([\s\S]*?)\]\s*\.forEach/);
    assert.ok(bindingBlock, "bindElements id list was not found");
    const boundIds = [...bindingBlock[1].matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
    const missingIds = boundIds.filter((id) => !htmlIds.includes(id));
    assert.deepEqual(missingIds, [], "Script binds elements that are absent from HTML");
  });
}

test("document type controls keep an explicit accessible label", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<label\s+for="typeSelect">类型<\/label>/);
  assert.doesNotMatch(html, /<label[^>]*class="type-field"/);
});

test("cloud page presents account data before optional feature navigation", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const syncIndex = html.indexOf('class="cloud-section cloud-sync-section"');
  const usageIndex = html.indexOf('id="cloudUsageReport"');
  const billingIndex = html.indexOf('id="cloudBillingReport"');
  const featureMapIndex = html.indexOf('id="featureMapGrid"');

  assert.ok(syncIndex > -1 && usageIndex > syncIndex && billingIndex > usageIndex);
  assert.ok(featureMapIndex > billingIndex, "feature navigation should not bury cloud account data");
  assert.match(html, /<details\s+class="cloud-section feature-map-section">/);
});
