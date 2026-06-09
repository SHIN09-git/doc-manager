import assert from "node:assert/strict";
import test from "node:test";
import { triggerDownload } from "../src/admin/adminDownload.js";

function createDownloadEnv(overrides = {}) {
  const clicks = [];
  const appended = [];
  const removed = [];
  const revoked = [];
  const createdBlobs = [];
  const anchor = {
    href: "",
    download: "",
    click() {
      clicks.push({ href: this.href, download: this.download });
    },
    remove() {
      removed.push(this);
    },
  };
  class FakeBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.type = options?.type || "";
      createdBlobs.push(this);
    }
  }
  const env = {
    document: {
      body: {
        appendChild(node) {
          appended.push(node);
        },
      },
      createElement(tagName) {
        assert.equal(tagName, "a");
        return anchor;
      },
    },
    URL: {
      createObjectURL(blob) {
        assert.ok(blob instanceof FakeBlob);
        return "blob:download-1";
      },
      revokeObjectURL(url) {
        revoked.push(url);
      },
    },
    Blob: FakeBlob,
    setTimeout(callback) {
      callback();
    },
    ...overrides,
  };
  return { env, anchor, clicks, appended, removed, revoked, createdBlobs };
}

test("triggerDownload creates a safe download anchor and revokes the object url", () => {
  const harness = createDownloadEnv();

  assert.equal(triggerDownload("  审计\n筛选:今日?.csv  ", "a,b", "text/csv", harness.env), true);

  assert.equal(harness.appended.length, 1);
  assert.equal(harness.removed.length, 1);
  assert.deepEqual(harness.clicks, [{ href: "blob:download-1", download: "审计 筛选_今日_.csv" }]);
  assert.deepEqual(harness.revoked, ["blob:download-1"]);
  assert.equal(harness.createdBlobs[0].type, "text/csv");
});

test("triggerDownload reports failure when browser download APIs are unavailable", () => {
  const harness = createDownloadEnv({ URL: null });

  assert.equal(triggerDownload("export.json", "{}", "application/json", harness.env), false);
  assert.equal(harness.clicks.length, 0);
});

test("triggerDownload cleans up object urls when clicking cannot be prepared", () => {
  const harness = createDownloadEnv({
    document: {
      body: {
        appendChild() {
          throw new Error("blocked");
        },
      },
      createElement() {
        return { click() {}, remove() {} };
      },
    },
  });

  assert.equal(triggerDownload("export.json", "{}", "application/json", harness.env), false);
  assert.deepEqual(harness.revoked, ["blob:download-1"]);
});
