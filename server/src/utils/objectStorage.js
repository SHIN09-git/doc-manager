import { readFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const SERVICE = "s3";
const ALGORITHM = "AWS4-HMAC-SHA256";

export async function uploadBackupToObjectStorage(env, { filePath, fileName } = {}) {
  if (env.backupObjectStorageMode === "disabled") {
    return { enabled: false, uploaded: false };
  }
  if (env.backupObjectStorageMode !== "s3-compatible") {
    throw new Error(`Unsupported backup object storage mode: ${env.backupObjectStorageMode}`);
  }
  const body = await readFile(filePath);
  const request = buildS3PutRequest(env, {
    key: buildObjectKey(env, fileName || path.basename(filePath)),
    body,
    contentType: getBackupContentType(fileName || filePath),
    now: new Date(),
  });
  const response = await fetch(request.url, {
    method: "PUT",
    headers: request.headers,
    body,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`object storage upload failed: ${response.status}${text ? ` ${text.slice(0, 200)}` : ""}`);
  }
  return {
    enabled: true,
    uploaded: true,
    bucket: env.backupObjectStorageBucket,
    object_key: request.objectKey,
  };
}

export function buildS3PutRequest(env, { key, body, contentType = "application/octet-stream", now = new Date() } = {}) {
  const endpoint = normalizeEndpoint(env.backupObjectStorageEndpoint);
  const bucket = String(env.backupObjectStorageBucket || "").trim();
  const objectKey = String(key || "").replace(/^\/+/, "");
  if (!bucket) throw new Error("BACKUP_OBJECT_STORAGE_BUCKET is required");
  if (!objectKey) throw new Error("backup object key is required");

  const url = new URL(endpoint);
  const bucketPath = encodePathSegment(bucket);
  const keyPath = objectKey.split("/").map(encodePathSegment).join("/");
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${bucketPath}/${keyPath}`;

  const payloadHash = sha256Hex(body || "");
  const amzDate = formatAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const region = String(env.backupObjectStorageRegion || "us-east-1").trim() || "us-east-1";
  const headers = {
    "content-type": contentType,
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (env.backupObjectStorageSessionToken) {
    headers["x-amz-security-token"] = String(env.backupObjectStorageSessionToken);
  }

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${normalizeHeaderValue(headers[name])}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");
  const credentialScope = `${dateStamp}/${region}/${SERVICE}/aws4_request`;
  const canonicalRequest = [
    "PUT",
    url.pathname,
    canonicalQueryString(url),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const stringToSign = [
    ALGORITHM,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = hmacHex(getSigningKey(env.backupObjectStorageSecretAccessKey, dateStamp, region), stringToSign);
  headers.Authorization = `${ALGORITHM} Credential=${env.backupObjectStorageAccessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: url.toString(),
    objectKey,
    headers,
  };
}

export function buildObjectKey(env, fileName) {
  const prefix = String(env.backupObjectStoragePrefix || "").trim().replace(/^\/+|\/+$/g, "");
  const safeName = path.basename(fileName);
  return prefix ? `${prefix}/${safeName}` : safeName;
}

function normalizeEndpoint(value) {
  const endpoint = String(value || "").trim().replace(/\/+$/, "");
  if (!endpoint) throw new Error("BACKUP_OBJECT_STORAGE_ENDPOINT is required");
  return endpoint;
}

function getBackupContentType(fileName) {
  return String(fileName || "").endsWith(".gcm")
    ? "application/vnd.mowen.backup+json"
    : "application/json; charset=utf-8";
}

function formatAmzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function canonicalQueryString(url) {
  return Array.from(url.searchParams.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

function normalizeHeaderValue(value) {
  return String(value).trim().replace(/\s+/g, " ");
}

function encodePathSegment(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmac(key, value) {
  return crypto.createHmac("sha256", key).update(String(value)).digest();
}

function hmacHex(key, value) {
  return crypto.createHmac("sha256", key).update(String(value)).digest("hex");
}

function getSigningKey(secret, dateStamp, region) {
  const dateKey = hmac(`AWS4${secret}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, SERVICE);
  return hmac(serviceKey, "aws4_request");
}
