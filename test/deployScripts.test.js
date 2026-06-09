import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { collectStaticFileCopies } from "../scripts/build-static.mjs";
import { buildProductionChecks, parseDotEnv } from "../scripts/verify-production.mjs";

test("parseDotEnv reads simple quoted and unquoted values", () => {
  assert.deepEqual(parseDotEnv("A=one\nB=\"two\"\n# skip\nC='three'"), {
    A: "one",
    B: "two",
    C: "three",
  });
});

test("production checks accept APP_BASE_URL alias when required launch fields are set", () => {
  const checks = buildProductionChecks({
    NODE_ENV: "production",
    STORE_DRIVER: "postgres",
    DATABASE_URL: "postgres://mowen:secret@db.realhost.test:5432/mowen",
    SESSION_SECRET: "s".repeat(40),
    APP_ENCRYPTION_SECRET: "e".repeat(40),
    APP_BASE_URL: "https://mowen.realhost.test/index.html",
    CORS_ORIGIN: "https://mowen.realhost.test",
    SESSION_SECURE: "true",
    EMAIL_MODE: "webhook",
    EMAIL_PROVIDER: "generic-webhook",
    EMAIL_WEBHOOK_URL: "https://mail.realhost.test/send",
    MANUAL_PAYMENT_PACKAGES: JSON.stringify([{ id: "pro_month", title: "Pro", type: "plan", plan: "pro", duration_days: 30, amount_cny: 29 }]),
    MANUAL_PAYMENT_WECHAT_QR_URL: "https://mowen.realhost.test/wechat.png",
    MANUAL_PAYMENT_ALIPAY_QR_URL: "https://mowen.realhost.test/alipay.png",
    BACKUP_ENCRYPTION_KEY: "b".repeat(40),
    AI_PROXY_MODE: "mock",
  });
  assert.deepEqual(checks.filter((item) => item.level === "error" && !item.ok), []);
});

test("production checks reject placeholder launch configuration", () => {
  const checks = buildProductionChecks({
    NODE_ENV: "production",
    STORE_DRIVER: "postgres",
    DATABASE_URL: "postgres://USER:PASSWORD@HOST:5432/DATABASE",
    SESSION_SECRET: "replace-with-secret",
    APP_ENCRYPTION_SECRET: "replace-with-encryption-secret",
    APP_URL: "https://your-domain.example/index.html",
    CORS_ORIGIN: "https://your-domain.example",
    SESSION_SECURE: "true",
    EMAIL_MODE: "webhook",
    EMAIL_PROVIDER: "resend",
    EMAIL_RESEND_API_KEY: "re_xxx",
    MANUAL_PAYMENT_PACKAGES: "[]",
  });
  const failedNames = checks.filter((item) => item.level === "error" && !item.ok).map((item) => item.name);
  assert.ok(failedNames.includes("DATABASE_URL"));
  assert.ok(failedNames.includes("SESSION_SECRET"));
  assert.ok(failedNames.includes("APP_URL"));
  assert.ok(failedNames.includes("MANUAL_PAYMENT_PACKAGES"));
});

test("production checks reject manual payment packages that normalize away", () => {
  const checks = buildProductionChecks({
    NODE_ENV: "production",
    STORE_DRIVER: "postgres",
    DATABASE_URL: "postgres://mowen:secret@db.realhost.test:5432/mowen",
    SESSION_SECRET: "s".repeat(40),
    APP_ENCRYPTION_SECRET: "e".repeat(40),
    APP_URL: "https://mowen.realhost.test/index.html",
    CORS_ORIGIN: "https://mowen.realhost.test",
    SESSION_SECURE: "true",
    EMAIL_MODE: "webhook",
    EMAIL_PROVIDER: "generic-webhook",
    EMAIL_WEBHOOK_URL: "https://mail.realhost.test/send",
    MANUAL_PAYMENT_PACKAGES: JSON.stringify([{ id: "empty_credits", title: "Empty", type: "credits", credits: 0, amount_cny: 29 }]),
    AI_PROXY_MODE: "mock",
  });
  const failedNames = checks.filter((item) => item.level === "error" && !item.ok).map((item) => item.name);
  assert.ok(failedNames.includes("MANUAL_PAYMENT_PACKAGES"));
});

test("production checks reject manual payment packages for the free plan", () => {
  const checks = buildProductionChecks({
    NODE_ENV: "production",
    STORE_DRIVER: "postgres",
    DATABASE_URL: "postgres://mowen:secret@db.realhost.test:5432/mowen",
    SESSION_SECRET: "s".repeat(40),
    APP_ENCRYPTION_SECRET: "e".repeat(40),
    APP_URL: "https://mowen.realhost.test/index.html",
    CORS_ORIGIN: "https://mowen.realhost.test",
    SESSION_SECURE: "true",
    EMAIL_MODE: "webhook",
    EMAIL_PROVIDER: "generic-webhook",
    EMAIL_WEBHOOK_URL: "https://mail.realhost.test/send",
    MANUAL_PAYMENT_PACKAGES: JSON.stringify([{ id: "free_month", title: "Free", type: "plan", plan: "free", duration_days: 30, amount_cny: 9 }]),
    AI_PROXY_MODE: "mock",
  });
  const failedNames = checks.filter((item) => item.level === "error" && !item.ok).map((item) => item.name);
  assert.ok(failedNames.includes("MANUAL_PAYMENT_PACKAGES"));
});

test("production checks reject webhook checkout without signed price mapping", () => {
  const checks = buildProductionChecks({
    NODE_ENV: "production",
    STORE_DRIVER: "postgres",
    DATABASE_URL: "postgres://mowen:secret@db.realhost.test:5432/mowen",
    SESSION_SECRET: "s".repeat(40),
    APP_ENCRYPTION_SECRET: "e".repeat(40),
    APP_URL: "https://mowen.realhost.test/index.html",
    CORS_ORIGIN: "https://mowen.realhost.test",
    SESSION_SECURE: "true",
    EMAIL_MODE: "webhook",
    EMAIL_PROVIDER: "generic-webhook",
    EMAIL_WEBHOOK_URL: "https://mail.realhost.test/send",
    MANUAL_PAYMENT_PACKAGES: JSON.stringify([{ id: "pro_month", title: "Pro", type: "plan", plan: "pro", duration_days: 30, amount_cny: 29 }]),
    AI_PROXY_MODE: "mock",
    PAYMENT_CHECKOUT_MODE: "webhook",
    PAYMENT_CHECKOUT_URL: "https://pay.realhost.test/checkout",
  });
  const failedNames = checks.filter((item) => item.level === "error" && !item.ok).map((item) => item.name);
  assert.ok(failedNames.includes("loadEnv"));
  assert.ok(failedNames.includes("PAYMENT_PLAN_PRICE_MAP"));
  assert.ok(failedNames.includes("PAYMENT_WEBHOOK_SECRET"));
});

test("production checks require an explicit live AI key source", () => {
  const checks = buildProductionChecks({
    NODE_ENV: "production",
    STORE_DRIVER: "postgres",
    DATABASE_URL: "postgres://mowen:secret@db.realhost.test:5432/mowen",
    SESSION_SECRET: "s".repeat(40),
    APP_ENCRYPTION_SECRET: "e".repeat(40),
    APP_URL: "https://mowen.realhost.test/index.html",
    CORS_ORIGIN: "https://mowen.realhost.test",
    SESSION_SECURE: "true",
    EMAIL_MODE: "webhook",
    EMAIL_PROVIDER: "generic-webhook",
    EMAIL_WEBHOOK_URL: "https://mail.realhost.test/send",
    MANUAL_PAYMENT_PACKAGES: JSON.stringify([{ id: "pro_month", title: "Pro", type: "plan", plan: "pro", duration_days: 30, amount_cny: 29 }]),
    AI_PROXY_MODE: "live",
    AI_MODEL: "gpt-test",
  });
  const failedNames = checks.filter((item) => item.level === "error" && !item.ok).map((item) => item.name);
  assert.ok(failedNames.includes("loadEnv"));
  assert.ok(failedNames.includes("AI key source"));

  const organizationKeyChecks = buildProductionChecks({
    NODE_ENV: "production",
    STORE_DRIVER: "postgres",
    DATABASE_URL: "postgres://mowen:secret@db.realhost.test:5432/mowen",
    SESSION_SECRET: "s".repeat(40),
    APP_ENCRYPTION_SECRET: "e".repeat(40),
    APP_URL: "https://mowen.realhost.test/index.html",
    CORS_ORIGIN: "https://mowen.realhost.test",
    SESSION_SECURE: "true",
    EMAIL_MODE: "webhook",
    EMAIL_PROVIDER: "generic-webhook",
    EMAIL_WEBHOOK_URL: "https://mail.realhost.test/send",
    MANUAL_PAYMENT_PACKAGES: JSON.stringify([{ id: "pro_month", title: "Pro", type: "plan", plan: "pro", duration_days: 30, amount_cny: 29 }]),
    AI_PROXY_MODE: "live",
    AI_MODEL: "gpt-test",
    ALLOW_ORGANIZATION_AI_KEYS: "true",
  });
  assert.deepEqual(organizationKeyChecks.filter((item) => item.level === "error" && !item.ok), []);
});

test("production checks require a default live AI model", () => {
  const checks = buildProductionChecks({
    NODE_ENV: "production",
    STORE_DRIVER: "postgres",
    DATABASE_URL: "postgres://mowen:secret@db.realhost.test:5432/mowen",
    SESSION_SECRET: "s".repeat(40),
    APP_ENCRYPTION_SECRET: "e".repeat(40),
    APP_URL: "https://mowen.realhost.test/index.html",
    CORS_ORIGIN: "https://mowen.realhost.test",
    SESSION_SECURE: "true",
    EMAIL_MODE: "webhook",
    EMAIL_PROVIDER: "generic-webhook",
    EMAIL_WEBHOOK_URL: "https://mail.realhost.test/send",
    MANUAL_PAYMENT_PACKAGES: JSON.stringify([{ id: "pro_month", title: "Pro", type: "plan", plan: "pro", duration_days: 30, amount_cny: 29 }]),
    AI_PROXY_MODE: "live",
    PLATFORM_OPENAI_API_KEY: "sk-production-key",
  });
  const failedNames = checks.filter((item) => item.level === "error" && !item.ok).map((item) => item.name);
  assert.ok(failedNames.includes("loadEnv"));
  assert.ok(failedNames.includes("AI_MODEL"));
});

test("static build manifest includes admin page module dependencies", async () => {
  const copiedSources = new Set((await collectStaticFileCopies()).map(([source]) => source.replace(/\\/g, "/")));
  const adminSource = "src/admin/adminPage.js";
  const adminContent = readFileSync(adminSource, "utf8");
  const imports = Array.from(adminContent.matchAll(/from\s+["'](\.\.?\/[^"']+)["']/g))
    .map((match) => {
      const resolved = path
        .normalize(path.join(path.dirname(adminSource), match[1]))
        .replace(/\\/g, "/");
      return path.extname(resolved) ? resolved : `${resolved}.js`;
    });

  imports.forEach((source) => {
    assert.ok(copiedSources.has(source), `${source} must be copied for dist/admin.html`);
  });
});

test("static build manifest recursively includes transitive module dependencies", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mowen-static-"));
  try {
    await mkdir(path.join(root, "nested"), { recursive: true });
    await mkdir(path.join(root, "shared"), { recursive: true });
    await writeFile(path.join(root, "entry.js"), 'import "./nested/child.js";\n');
    await writeFile(path.join(root, "nested", "child.js"), 'export { value } from "../shared/value.js";\n');
    await writeFile(path.join(root, "shared", "value.js"), "export const value = 1;\n");
    await writeFile(path.join(root, "static.txt"), "static\n");

    const copiedSources = new Set((await collectStaticFileCopies({
      root,
      fileCopies: [["static.txt", "static.txt"]],
      moduleEntries: ["entry.js"],
    })).map(([source]) => source.replace(/\\/g, "/")));

    assert.ok(copiedSources.has("static.txt"));
    assert.ok(copiedSources.has("entry.js"));
    assert.ok(copiedSources.has("nested/child.js"));
    assert.ok(copiedSources.has("shared/value.js"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
