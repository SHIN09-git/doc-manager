import assert from "node:assert/strict";
import test from "node:test";
import {
  copyTextToClipboard,
  createId,
  sanitizeCssColor,
  sanitizeFileName,
  sanitizeUrl,
} from "../src/utils/helpers.js";

test("createId falls back when Web Crypto is unavailable", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", {
    value: undefined,
    configurable: true,
  });
  try {
    assert.match(createId(), /^[a-z0-9]+-[a-z0-9]+$/);
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, "crypto", descriptor);
    } else {
      delete globalThis.crypto;
    }
  }
});

test("sanitizeFileName keeps export names stable and filesystem-safe", () => {
  assert.equal(sanitizeFileName("工作总结"), "工作总结");
  assert.equal(sanitizeFileName("  学校\n通知:初稿?.docx  "), "学校 通知_初稿_.docx");
  assert.equal(sanitizeFileName("...   "), "未命名文档");
  assert.equal(sanitizeFileName("CON"), "CON_");
  assert.equal(sanitizeFileName("a".repeat(100)).length, 80);
});

test("sanitizeCssColor keeps safe colors and rejects attribute-breaking values", () => {
  assert.equal(sanitizeCssColor("#0f766e"), "#0f766e");
  assert.equal(sanitizeCssColor("rgb(15, 118, 110)"), "rgb(15, 118, 110)");
  assert.equal(sanitizeCssColor("rebeccapurple"), "rebeccapurple");
  assert.equal(sanitizeCssColor('red";background:url(javascript:alert(1))'), "#2d3234");
  assert.equal(sanitizeCssColor("var(--unsafe-token)"), "#2d3234");
});

test("sanitizeUrl allows web and relative urls while rejecting unsafe protocols", () => {
  assert.equal(sanitizeUrl("https://example.com/qr.png"), "https://example.com/qr.png");
  assert.equal(sanitizeUrl("http://127.0.0.1:4173/assets/qr.png"), "http://127.0.0.1:4173/assets/qr.png");
  assert.equal(sanitizeUrl("/assets/qr.png"), "/assets/qr.png");
  assert.equal(sanitizeUrl("assets/qr.png"), "assets/qr.png");
  assert.equal(sanitizeUrl("javascript:alert(1)"), "");
  assert.equal(sanitizeUrl("data:text/html,<script>alert(1)</script>"), "");
  assert.equal(sanitizeUrl("https://example.com/\u0000bad"), "");
});

test("copyTextToClipboard prefers the Clipboard API", async () => {
  const writes = [];
  const copied = await copyTextToClipboard("邀请口令", {
    navigator: {
      clipboard: {
        writeText: async (value) => writes.push(value),
      },
    },
  });

  assert.equal(copied, true);
  assert.deepEqual(writes, ["邀请口令"]);
});

test("copyTextToClipboard falls back to a temporary textarea", async () => {
  const calls = [];
  const textarea = {
    value: "",
    style: {},
    setAttribute: (name, value) => calls.push(["setAttribute", name, value]),
    select: () => calls.push(["select"]),
    setSelectionRange: (start, end) => calls.push(["range", start, end]),
    remove: () => calls.push(["remove"]),
  };
  const document = {
    body: {
      appendChild: (node) => calls.push(["append", node.value]),
    },
    createElement: (tag) => {
      assert.equal(tag, "textarea");
      return textarea;
    },
    execCommand: (command) => {
      calls.push(["exec", command]);
      return command === "copy";
    },
  };

  const copied = await copyTextToClipboard("复制内容", {
    navigator: { clipboard: { writeText: async () => { throw new Error("blocked"); } } },
    document,
  });

  assert.equal(copied, true);
  assert.deepEqual(calls.map((item) => item[0]), ["setAttribute", "append", "select", "range", "exec", "remove"]);
});

test("copyTextToClipboard reports failure when no copy path is available", async () => {
  assert.equal(await copyTextToClipboard("x", { navigator: {}, document: null }), false);
});
