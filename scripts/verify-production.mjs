import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getManualPaymentPackages } from "../server/src/billing/manualPaymentService.js";
import { loadEnv } from "../server/src/config/env.js";

const PLACEHOLDER_RE = /(replace-with|your-domain|example\.|USER:PASSWORD@HOST|change-this|re_xxx|xxx)/i;

export function parseDotEnv(text) {
  const parsed = {};
  String(text || "").split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return;
    const [key, ...rest] = trimmed.split("=");
    const name = key.trim();
    if (!name) return;
    parsed[name] = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
  });
  return parsed;
}

export function buildProductionChecks(source) {
  const envSource = {
    ...source,
    NODE_ENV: source.NODE_ENV || "production",
  };
  const checks = [];
  const add = (level, name, ok, message) => checks.push({ level, name, ok, message });
  const requireValue = (key, message = `${key} is required`) => {
    const value = String(envSource[key] || "").trim();
    add("error", key, Boolean(value) && !PLACEHOLDER_RE.test(value), Boolean(value) ? message : `${key} is empty`);
  };
  const requireHttpsUrl = (key) => {
    const value = String(envSource[key] || "").trim();
    let ok = false;
    try {
      ok = new URL(value).protocol === "https:" && !PLACEHOLDER_RE.test(value);
    } catch {
      ok = false;
    }
    add("error", key, ok, `${key} must be a production HTTPS URL`);
  };

  try {
    const env = loadEnv(envSource);
    add("error", "loadEnv", true, `loaded production env with ${env.storeDriver} store`);
  } catch (error) {
    add("error", "loadEnv", false, error.message || String(error));
  }

  requireValue("DATABASE_URL", "DATABASE_URL must point to the production PostgreSQL database");
  requireValue("SESSION_SECRET", "SESSION_SECRET must be non-default and at least 32 characters");
  requireValue("APP_ENCRYPTION_SECRET", "APP_ENCRYPTION_SECRET must be non-default and at least 32 characters");
  requireHttpsUrl(envSource.APP_URL ? "APP_URL" : "APP_BASE_URL");
  requireHttpsUrl("CORS_ORIGIN");

  add("error", "NODE_ENV", envSource.NODE_ENV === "production", "NODE_ENV must be production");
  add("error", "STORE_DRIVER", envSource.STORE_DRIVER === "postgres", "STORE_DRIVER should be postgres before public launch");
  add("error", "SESSION_SECURE", envSource.SESSION_SECURE === "true", "SESSION_SECURE should be true behind HTTPS");
  add("error", "EMAIL_MODE", envSource.EMAIL_MODE === "webhook", "EMAIL_MODE should be webhook before public launch");

  const configuredManualPackages = parseJsonArray(envSource.MANUAL_PAYMENT_PACKAGES);
  const manualPackages = configuredManualPackages.length
    ? getManualPaymentPackages({ manualPaymentPackages: configuredManualPackages })
    : [];
  add(
    "error",
    "MANUAL_PAYMENT_PACKAGES",
    manualPackages.length > 0 && manualPackages.every((item) => Number(item.amount_cny || 0) > 0),
    "manual recharge packages must contain at least one valid paid package for the first paid launch",
  );
  add("warn", "MANUAL_PAYMENT_WECHAT_QR_URL", hasProductionUrl(envSource.MANUAL_PAYMENT_WECHAT_QR_URL), "configure a public WeChat payment QR URL if WeChat recharge is offered");
  add("warn", "MANUAL_PAYMENT_ALIPAY_QR_URL", hasProductionUrl(envSource.MANUAL_PAYMENT_ALIPAY_QR_URL), "configure a public Alipay QR URL if Alipay recharge is offered");
  add("warn", "BACKUP_ENCRYPTION_KEY", isStrongSecret(envSource.BACKUP_ENCRYPTION_KEY), "configure BACKUP_ENCRYPTION_KEY before storing production backups");
  add(
    "error",
    "AI key source",
    Boolean(envSource.PLATFORM_OPENAI_API_KEY || envSource.AI_PROXY_MODE !== "live" || envSource.ALLOW_ORGANIZATION_AI_KEYS === "true"),
    "set PLATFORM_OPENAI_API_KEY or ALLOW_ORGANIZATION_AI_KEYS=true when AI_PROXY_MODE=live",
  );
  add(
    "error",
    "AI_MODEL",
    Boolean(String(envSource.AI_MODEL || "").trim()) || envSource.AI_PROXY_MODE !== "live",
    "set AI_MODEL to the default production model when AI_PROXY_MODE=live",
  );
  if (envSource.PAYMENT_CHECKOUT_MODE === "webhook") {
    const priceMap = parseJsonObject(envSource.PAYMENT_PLAN_PRICE_MAP);
    add(
      "error",
      "PAYMENT_PLAN_PRICE_MAP",
      hasPaidPaymentPriceMap(priceMap),
      "PAYMENT_PLAN_PRICE_MAP must map provider price ids to pro/team when webhook checkout is enabled",
    );
    add(
      "error",
      "PAYMENT_WEBHOOK_SECRET",
      isStrongSecret(envSource.PAYMENT_WEBHOOK_SECRET),
      "PAYMENT_WEBHOOK_SECRET must be set before webhook checkout can be used",
    );
  }

  return checks;
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

function parseJsonObject(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function hasProductionUrl(value) {
  const raw = String(value || "").trim();
  if (!raw || PLACEHOLDER_RE.test(raw)) return false;
  try {
    const url = new URL(raw);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function isStrongSecret(value) {
  const raw = String(value || "");
  return raw.length >= 32 && !PLACEHOLDER_RE.test(raw);
}

function hasPaidPaymentPriceMap(map) {
  return Object.entries(map || {}).some(([priceId, plan]) => {
    const normalizedPriceId = String(priceId || "").trim();
    const normalizedPlan = String(plan || "").trim().toLowerCase();
    return Boolean(normalizedPriceId) && ["pro", "team"].includes(normalizedPlan);
  });
}

function formatCheck(check) {
  const mark = check.ok ? "OK" : check.level === "warn" ? "WARN" : "FAIL";
  return `[${mark}] ${check.name}: ${check.message}`;
}

async function main() {
  const envPath = path.resolve(process.argv[2] || "server/.env.production");
  if (!existsSync(envPath)) {
    console.error(`Production env file not found: ${envPath}`);
    console.error("Create it from server/env.production.example first.");
    process.exit(1);
  }

  const fileEnv = parseDotEnv(readFileSync(envPath, "utf8"));
  const checks = buildProductionChecks({ ...process.env, ...fileEnv });
  checks.forEach((check) => console.log(formatCheck(check)));

  const failed = checks.filter((check) => check.level === "error" && !check.ok);
  const warnings = checks.filter((check) => check.level === "warn" && !check.ok);
  console.log(`\nProduction check: ${failed.length} blocking issue(s), ${warnings.length} warning(s).`);
  if (failed.length > 0) process.exit(1);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  });
}
