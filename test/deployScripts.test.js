import { test } from "node:test";
import assert from "node:assert/strict";
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
    MANUAL_PAYMENT_PACKAGES: JSON.stringify([{ id: "pro_month", title: "Pro", amount_cny: 29 }]),
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
