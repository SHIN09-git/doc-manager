import crypto from "node:crypto";

const PASSWORD_ITERATIONS = 210000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = "sha256";

export function createId(prefix = "id") {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function hmacSha256(secret, value) {
  return crypto.createHmac("sha256", String(secret)).update(String(value)).digest("hex");
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto
    .pbkdf2Sync(String(password), salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST)
    .toString("base64url");
  return `pbkdf2$${PASSWORD_ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password, encoded) {
  const [scheme, iterations, salt, expected] = String(encoded || "").split("$");
  if (scheme !== "pbkdf2" || !iterations || !salt || !expected) return false;
  const actual = crypto
    .pbkdf2Sync(String(password), salt, Number(iterations), PASSWORD_KEY_LENGTH, PASSWORD_DIGEST)
    .toString("base64url");
  return timingSafeEqual(actual, expected);
}

export function encryptSecret(value, secret) {
  const key = deriveEncryptionKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `gcm:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptSecret(value, secret) {
  const [, ivText, tagText, encryptedText] = String(value || "").split(":");
  if (!ivText || !tagText || !encryptedText) throw new Error("Invalid encrypted secret");
  const key = deriveEncryptionKey(secret);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function secretHint(value) {
  const text = String(value || "");
  if (text.length <= 8) return "****";
  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

function deriveEncryptionKey(secret) {
  return crypto.createHash("sha256").update(String(secret)).digest();
}

export function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}
