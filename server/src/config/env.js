import path from "node:path";

export function loadEnv(source = process.env) {
  const dataDir = path.resolve(source.DATA_DIR || "server/.data");
  const env = {
    nodeEnv: source.NODE_ENV || "development",
    host: source.HOST || "127.0.0.1",
    port: toNumber(source.PORT, 8787),
    storeDriver: source.STORE_DRIVER || "json",
    databaseUrl: source.DATABASE_URL || "",
    dataDir,
    dataFile: path.join(dataDir, "db.json"),
    encryptionSecret: source.APP_ENCRYPTION_SECRET || "dev-only-change-this-commercial-api-encryption-secret",
    sessionSecret: source.SESSION_SECRET || "dev-only-change-this-commercial-api-session-secret",
    sessionSecure: source.SESSION_SECURE === "true",
    corsOrigin: source.CORS_ORIGIN || "http://127.0.0.1:4173",
    aiProxyMode: source.AI_PROXY_MODE || "mock",
    aiBaseUrl: (source.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, ""),
    aiModel: source.AI_MODEL || "",
    aiRequestTimeoutMs: toNumber(source.AI_REQUEST_TIMEOUT_MS, 60000),
    aiCostRates: parseJsonMap(source.AI_COST_RATES),
    aiDailyBudgetCny: toOptionalNumber(source.AI_DAILY_BUDGET_CNY),
    aiMonthlyBudgetCny: toOptionalNumber(source.AI_MONTHLY_BUDGET_CNY),
    requestLogging: source.REQUEST_LOGGING === "true",
    platformOpenAiKey: source.PLATFORM_OPENAI_API_KEY || "",
    paymentWebhookSecret: source.PAYMENT_WEBHOOK_SECRET || "",
    paymentPlanPriceMap: parseJsonMap(source.PAYMENT_PLAN_PRICE_MAP),
    paymentCheckoutMode: source.PAYMENT_CHECKOUT_MODE || "disabled",
    paymentCheckoutUrl: source.PAYMENT_CHECKOUT_URL || "",
    paymentSuccessUrl: source.PAYMENT_SUCCESS_URL || "",
    paymentCancelUrl: source.PAYMENT_CANCEL_URL || "",
    manualPaymentReceiverName: source.MANUAL_PAYMENT_RECEIVER_NAME || "",
    manualPaymentWechatQrUrl: source.MANUAL_PAYMENT_WECHAT_QR_URL || "",
    manualPaymentAlipayQrUrl: source.MANUAL_PAYMENT_ALIPAY_QR_URL || "",
    manualPaymentPackages: parseJsonArray(source.MANUAL_PAYMENT_PACKAGES),
    emailMode: source.EMAIL_MODE || "log",
    emailProvider: source.EMAIL_PROVIDER || "generic-webhook",
    emailFrom: source.EMAIL_FROM || "noreply@mowen.local",
    emailWebhookUrl: source.EMAIL_WEBHOOK_URL || "",
    emailWebhookToken: source.EMAIL_WEBHOOK_TOKEN || "",
    emailCallbackToken: source.EMAIL_CALLBACK_TOKEN || "",
    emailResendApiKey: source.EMAIL_RESEND_API_KEY || "",
    emailResendEndpoint: (source.EMAIL_RESEND_ENDPOINT || "https://api.resend.com/emails").replace(/\/+$/, ""),
    appUrl: (source.APP_URL || "http://127.0.0.1:4173/index.html").replace(/\/+$/, ""),
    backupDir: path.resolve(source.BACKUP_DIR || path.join(dataDir, "backups")),
    backupRetentionDays: toNumber(source.BACKUP_RETENTION_DAYS, 14),
    backupEncryptionKey: source.BACKUP_ENCRYPTION_KEY || "",
    backupFailureWebhookUrl: source.BACKUP_FAILURE_WEBHOOK_URL || "",
    backupFailureWebhookToken: source.BACKUP_FAILURE_WEBHOOK_TOKEN || "",
    backupObjectStorageMode: source.BACKUP_OBJECT_STORAGE_MODE || "disabled",
    backupObjectStorageEndpoint: source.BACKUP_OBJECT_STORAGE_ENDPOINT || "",
    backupObjectStorageBucket: source.BACKUP_OBJECT_STORAGE_BUCKET || "",
    backupObjectStorageRegion: source.BACKUP_OBJECT_STORAGE_REGION || "us-east-1",
    backupObjectStoragePrefix: source.BACKUP_OBJECT_STORAGE_PREFIX || "mowen-backups",
    backupObjectStorageAccessKeyId: source.BACKUP_OBJECT_STORAGE_ACCESS_KEY_ID || "",
    backupObjectStorageSecretAccessKey: source.BACKUP_OBJECT_STORAGE_SECRET_ACCESS_KEY || "",
    backupObjectStorageSessionToken: source.BACKUP_OBJECT_STORAGE_SESSION_TOKEN || "",
    dailyUserRequestLimit: toNumber(source.DAILY_USER_REQUEST_LIMIT, 100),
    dailyOrgRequestLimit: toNumber(source.DAILY_ORG_REQUEST_LIMIT, 500),
    maxJsonBodyBytes: toNumber(source.MAX_JSON_BODY_BYTES, 1024 * 1024),
    maxDocumentChars: toNumber(source.MAX_DOCUMENT_CHARS, 200000),
  };
  validateEnv(env);
  return env;
}

function toNumber(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : fallback;
}

function toOptionalNumber(value) {
  if (value === undefined || value === null || value === "") return 0;
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : 0;
}

function parseJsonMap(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function validateEnv(env) {
  if (env.storeDriver !== "json" && env.storeDriver !== "postgres") {
    throw new Error("STORE_DRIVER must be either json or postgres");
  }
  if (env.emailMode !== "log" && env.emailMode !== "webhook") {
    throw new Error("EMAIL_MODE must be either log or webhook");
  }
  if (!["generic-webhook", "resend"].includes(env.emailProvider)) {
    throw new Error("EMAIL_PROVIDER must be generic-webhook or resend");
  }
  if (!["disabled", "mock", "webhook"].includes(env.paymentCheckoutMode)) {
    throw new Error("PAYMENT_CHECKOUT_MODE must be disabled, mock, or webhook");
  }
  if (!["disabled", "s3-compatible"].includes(env.backupObjectStorageMode)) {
    throw new Error("BACKUP_OBJECT_STORAGE_MODE must be disabled or s3-compatible");
  }
  if (env.backupObjectStorageMode === "s3-compatible") {
    if (!env.backupObjectStorageEndpoint) throw new Error("BACKUP_OBJECT_STORAGE_ENDPOINT is required when BACKUP_OBJECT_STORAGE_MODE=s3-compatible");
    if (!env.backupObjectStorageBucket) throw new Error("BACKUP_OBJECT_STORAGE_BUCKET is required when BACKUP_OBJECT_STORAGE_MODE=s3-compatible");
    if (!env.backupObjectStorageAccessKeyId) throw new Error("BACKUP_OBJECT_STORAGE_ACCESS_KEY_ID is required when BACKUP_OBJECT_STORAGE_MODE=s3-compatible");
    if (!env.backupObjectStorageSecretAccessKey) throw new Error("BACKUP_OBJECT_STORAGE_SECRET_ACCESS_KEY is required when BACKUP_OBJECT_STORAGE_MODE=s3-compatible");
  }
  if (env.emailMode === "webhook" && env.emailProvider === "generic-webhook" && !env.emailWebhookUrl) {
    throw new Error("EMAIL_WEBHOOK_URL is required when EMAIL_MODE=webhook");
  }
  if (env.emailMode === "webhook" && env.emailProvider === "resend" && !env.emailResendApiKey) {
    throw new Error("EMAIL_RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
  }
  if (env.storeDriver === "postgres" && !env.databaseUrl) {
    throw new Error("DATABASE_URL is required when STORE_DRIVER=postgres");
  }
  if (env.nodeEnv !== "production") return;
  assertStrongSecret("APP_ENCRYPTION_SECRET", env.encryptionSecret, "dev-only-change-this-commercial-api-encryption-secret");
  assertStrongSecret("SESSION_SECRET", env.sessionSecret, "dev-only-change-this-commercial-api-session-secret");
  if (env.emailMode === "log") {
    throw new Error("EMAIL_MODE=webhook is required in production");
  }
  if (!env.corsOrigin) {
    throw new Error("CORS_ORIGIN is required in production");
  }
}

function assertStrongSecret(name, value, defaultValue) {
  if (!value || value === defaultValue || value.length < 32) {
    throw new Error(`${name} must be set to a non-default value with at least 32 characters in production`);
  }
}
