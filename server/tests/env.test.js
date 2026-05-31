import { test } from "node:test";
import assert from "node:assert/strict";
import { loadEnv } from "../src/config/env.js";

const PRODUCTION_ENV = {
  NODE_ENV: "production",
  APP_ENCRYPTION_SECRET: "production-encryption-secret-with-enough-length",
  SESSION_SECRET: "production-session-secret-with-enough-length",
  CORS_ORIGIN: "https://mowen.example.com",
  EMAIL_MODE: "webhook",
  EMAIL_WEBHOOK_URL: "https://hooks.example.com/mowen-email",
};

test("APP_BASE_URL can configure the public app url alias", () => {
  const env = loadEnv({
    APP_BASE_URL: "https://mowen.example.com/index.html",
  });
  assert.equal(env.appUrl, "https://mowen.example.com/index.html");
});

test("CORS_ORIGIN normalizes full urls to origins", () => {
  const env = loadEnv({
    CORS_ORIGIN: "https://mowen.example.com/index.html",
  });
  assert.equal(env.corsOrigin, "https://mowen.example.com");
});

test("production mode requires secure session cookies", () => {
  assert.throws(() => loadEnv(PRODUCTION_ENV), /SESSION_SECURE=true/);
});

test("production mode requires an explicit CORS origin", () => {
  const { CORS_ORIGIN, ...withoutCorsOrigin } = PRODUCTION_ENV;
  assert.throws(() => loadEnv({
    ...withoutCorsOrigin,
    SESSION_SECURE: "true",
  }), /CORS_ORIGIN is required/);
});

test("production mode requires an HTTPS CORS origin", () => {
  assert.throws(() => loadEnv({
    ...PRODUCTION_ENV,
    SESSION_SECURE: "true",
    CORS_ORIGIN: "http://127.0.0.1:4173",
  }), /CORS_ORIGIN must be an HTTPS origin/);
});

test("production mode accepts explicit secure session cookies", () => {
  const env = loadEnv({
    ...PRODUCTION_ENV,
    SESSION_SECURE: "true",
  });
  assert.equal(env.sessionSecure, true);
});
