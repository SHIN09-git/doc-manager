import { test } from "node:test";
import assert from "node:assert/strict";
import { loadEnv } from "../src/config/env.js";

const PRODUCTION_ENV = {
  NODE_ENV: "production",
  APP_ENCRYPTION_SECRET: "production-encryption-secret-with-enough-length",
  SESSION_SECRET: "production-session-secret-with-enough-length",
  APP_URL: "https://mowen.example.com/index.html",
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

test("APP_URL is trimmed and trailing slashes are removed", () => {
  const env = loadEnv({
    APP_URL: " https://mowen.example.com/index.html/ ",
  });
  assert.equal(env.appUrl, "https://mowen.example.com/index.html");
});

test("CORS_ORIGIN normalizes full urls to origins", () => {
  const env = loadEnv({
    CORS_ORIGIN: "https://mowen.example.com/index.html",
  });
  assert.equal(env.corsOrigin, "https://mowen.example.com");
});

test("JSON env maps and arrays parse configured values", () => {
  const env = loadEnv({
    AI_COST_RATES: JSON.stringify({ default: { prompt_per_1k: 0.01, completion_per_1k: 0.02 } }),
    PAYMENT_PLAN_PRICE_MAP: JSON.stringify({ price_pro_monthly: "pro" }),
    MANUAL_PAYMENT_PACKAGES: JSON.stringify([{ id: "credits_100", credits: 100 }]),
  });
  assert.deepEqual(env.aiCostRates.default, { prompt_per_1k: 0.01, completion_per_1k: 0.02 });
  assert.equal(env.paymentPlanPriceMap.price_pro_monthly, "pro");
  assert.equal(env.manualPaymentPackages[0].id, "credits_100");
});

test("JSON env maps fail fast on malformed JSON", () => {
  assert.throws(() => loadEnv({
    AI_COST_RATES: "{bad-json",
  }), /AI_COST_RATES must be a valid JSON object/);

  assert.throws(() => loadEnv({
    PAYMENT_PLAN_PRICE_MAP: "[",
  }), /PAYMENT_PLAN_PRICE_MAP must be a valid JSON object/);
});

test("JSON env values reject the wrong container type", () => {
  assert.throws(() => loadEnv({
    PAYMENT_PLAN_PRICE_MAP: JSON.stringify(["price_pro_monthly"]),
  }), /PAYMENT_PLAN_PRICE_MAP must be a JSON object/);

  assert.throws(() => loadEnv({
    MANUAL_PAYMENT_PACKAGES: JSON.stringify({ id: "credits_100" }),
  }), /MANUAL_PAYMENT_PACKAGES must be a JSON array/);
});

test("AI_PROXY_MODE rejects unknown modes", () => {
  assert.throws(() => loadEnv({
    AI_PROXY_MODE: "liv",
  }), /AI_PROXY_MODE must be mock or live/);
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

test("production mode requires an explicit app url", () => {
  const { APP_URL, ...withoutAppUrl } = PRODUCTION_ENV;
  assert.throws(() => loadEnv({
    ...withoutAppUrl,
    SESSION_SECURE: "true",
  }), /APP_URL or APP_BASE_URL is required/);
});

test("production mode requires an HTTPS app url", () => {
  assert.throws(() => loadEnv({
    ...PRODUCTION_ENV,
    SESSION_SECURE: "true",
    APP_URL: "http://127.0.0.1:4173/index.html",
  }), /APP_URL must be an HTTPS URL/);
});

test("production mode accepts explicit secure session cookies", () => {
  const env = loadEnv({
    ...PRODUCTION_ENV,
    SESSION_SECURE: "true",
  });
  assert.equal(env.sessionSecure, true);
});

test("production mode accepts APP_BASE_URL as the app url alias", () => {
  const { APP_URL, ...withoutAppUrl } = PRODUCTION_ENV;
  const env = loadEnv({
    ...withoutAppUrl,
    SESSION_SECURE: "true",
    APP_BASE_URL: "https://mowen.example.com/workbench",
  });
  assert.equal(env.appUrl, "https://mowen.example.com/workbench");
});

test("production live AI mode requires an HTTPS AI base url", () => {
  assert.throws(() => loadEnv({
    ...PRODUCTION_ENV,
    SESSION_SECURE: "true",
    AI_PROXY_MODE: "live",
    AI_BASE_URL: "http://api.example.com/v1",
  }), /AI_BASE_URL must be an HTTPS URL/);
});

test("production live AI mode requires an explicit key source", () => {
  assert.throws(() => loadEnv({
    ...PRODUCTION_ENV,
    SESSION_SECURE: "true",
    AI_PROXY_MODE: "live",
    AI_MODEL: "gpt-test",
  }), /PLATFORM_OPENAI_API_KEY or ALLOW_ORGANIZATION_AI_KEYS=true/);

  const platformKeyEnv = loadEnv({
    ...PRODUCTION_ENV,
    SESSION_SECURE: "true",
    AI_PROXY_MODE: "live",
    AI_MODEL: "gpt-test",
    PLATFORM_OPENAI_API_KEY: "sk-production-key",
  });
  assert.equal(platformKeyEnv.platformOpenAiKey, "sk-production-key");

  const organizationKeyEnv = loadEnv({
    ...PRODUCTION_ENV,
    SESSION_SECURE: "true",
    AI_PROXY_MODE: "live",
    AI_MODEL: "gpt-test",
    ALLOW_ORGANIZATION_AI_KEYS: "true",
  });
  assert.equal(organizationKeyEnv.allowOrganizationAiKeys, true);
});

test("production live AI mode requires a default model", () => {
  assert.throws(() => loadEnv({
    ...PRODUCTION_ENV,
    SESSION_SECURE: "true",
    AI_PROXY_MODE: "live",
    PLATFORM_OPENAI_API_KEY: "sk-production-key",
  }), /AI_MODEL is required/);
});

test("production payment webhook checkout requires a configured HTTPS url", () => {
  assert.throws(() => loadEnv({
    ...PRODUCTION_ENV,
    SESSION_SECURE: "true",
    PAYMENT_CHECKOUT_MODE: "webhook",
  }), /PAYMENT_CHECKOUT_URL is required/);

  assert.throws(() => loadEnv({
    ...PRODUCTION_ENV,
    SESSION_SECURE: "true",
    PAYMENT_CHECKOUT_MODE: "webhook",
    PAYMENT_CHECKOUT_URL: "http://pay.example.com/checkout",
  }), /PAYMENT_CHECKOUT_URL must be an HTTPS URL/);
});

test("production payment webhook checkout requires signed mapped prices", () => {
  assert.throws(() => loadEnv({
    ...PRODUCTION_ENV,
    SESSION_SECURE: "true",
    PAYMENT_CHECKOUT_MODE: "webhook",
    PAYMENT_CHECKOUT_URL: "https://pay.example.com/checkout",
    PAYMENT_PLAN_PRICE_MAP: JSON.stringify({ price_pro: "pro" }),
  }), /PAYMENT_WEBHOOK_SECRET must be set/);

  assert.throws(() => loadEnv({
    ...PRODUCTION_ENV,
    SESSION_SECURE: "true",
    PAYMENT_CHECKOUT_MODE: "webhook",
    PAYMENT_CHECKOUT_URL: "https://pay.example.com/checkout",
    PAYMENT_WEBHOOK_SECRET: "w".repeat(40),
  }), /PAYMENT_PLAN_PRICE_MAP must map provider price ids/);

  const env = loadEnv({
    ...PRODUCTION_ENV,
    SESSION_SECURE: "true",
    PAYMENT_CHECKOUT_MODE: "webhook",
    PAYMENT_CHECKOUT_URL: "https://pay.example.com/checkout",
    PAYMENT_WEBHOOK_SECRET: "w".repeat(40),
    PAYMENT_PLAN_PRICE_MAP: JSON.stringify({ price_pro: "pro", price_team: "team" }),
  });
  assert.equal(env.paymentCheckoutMode, "webhook");
});

test("production optional public urls must use HTTPS when configured", () => {
  const cases = [
    ["PAYMENT_SUCCESS_URL", "http://mowen.example.com/success"],
    ["PAYMENT_CANCEL_URL", "http://mowen.example.com/cancel"],
    ["MANUAL_PAYMENT_WECHAT_QR_URL", "http://mowen.example.com/wechat.png"],
    ["MANUAL_PAYMENT_ALIPAY_QR_URL", "http://mowen.example.com/alipay.png"],
    ["BACKUP_FAILURE_WEBHOOK_URL", "http://ops.example.com/backup"],
  ];
  cases.forEach(([key, value]) => {
    assert.throws(() => loadEnv({
      ...PRODUCTION_ENV,
      SESSION_SECURE: "true",
      [key]: value,
    }), new RegExp(`${key} must be an HTTPS URL`));
  });
});

test("production email webhook mode requires HTTPS provider urls", () => {
  assert.throws(() => loadEnv({
    ...PRODUCTION_ENV,
    SESSION_SECURE: "true",
    EMAIL_WEBHOOK_URL: "http://mail.example.com/send",
  }), /EMAIL_WEBHOOK_URL must be an HTTPS URL/);

  assert.throws(() => loadEnv({
    ...PRODUCTION_ENV,
    SESSION_SECURE: "true",
    EMAIL_PROVIDER: "resend",
    EMAIL_RESEND_API_KEY: "re_test_key",
    EMAIL_RESEND_ENDPOINT: "http://api.resend.local/emails",
  }), /EMAIL_RESEND_ENDPOINT must be an HTTPS URL/);
});

test("production S3-compatible backup storage requires an HTTPS endpoint", () => {
  assert.throws(() => loadEnv({
    ...PRODUCTION_ENV,
    SESSION_SECURE: "true",
    BACKUP_OBJECT_STORAGE_MODE: "s3-compatible",
    BACKUP_OBJECT_STORAGE_ENDPOINT: "http://storage.example.com",
    BACKUP_OBJECT_STORAGE_BUCKET: "mowen-backups",
    BACKUP_OBJECT_STORAGE_ACCESS_KEY_ID: "access-key",
    BACKUP_OBJECT_STORAGE_SECRET_ACCESS_KEY: "secret-key",
  }), /BACKUP_OBJECT_STORAGE_ENDPOINT must be an HTTPS URL/);
});
