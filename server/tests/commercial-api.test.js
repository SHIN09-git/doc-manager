import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";
import { normalizeData } from "../src/db/jsonStore.js";
import { sha256 } from "../src/utils/crypto.js";

let server;
let baseUrl;
let tempDir;

before(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "mowen-commercial-api-"));
  server = createApp({
    env: {
      DATA_DIR: tempDir,
      APP_ENCRYPTION_SECRET: "test-encryption-secret-with-enough-length",
      SESSION_SECRET: "test-session-secret-with-enough-length",
      AI_PROXY_MODE: "mock",
      AI_COST_RATES: JSON.stringify({ default: { prompt_per_1k: 0.01, completion_per_1k: 0.02 } }),
      AI_DAILY_BUDGET_CNY: "1",
      AI_MONTHLY_BUDGET_CNY: "10",
      DAILY_USER_REQUEST_LIMIT: "3",
      DAILY_ORG_REQUEST_LIMIT: "4",
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
});

test("register creates user, personal organization, and session", async () => {
  const response = await api("/api/auth/register", {
    method: "POST",
    body: { email: "owner@example.com", password: "password123", name: "Owner" },
  });
  assert.equal(response.status, 201);
  assert.equal(response.json.authenticated, true);
  assert.equal(response.json.active_organization.name, "Owner的工作区");
  assert.match(response.cookie, /mowen_session=/);
});

test("cloud APIs require authentication while /api/me preserves local mode", async () => {
  const me = await api("/api/me");
  assert.equal(me.status, 200);
  assert.equal(me.json.authenticated, false);

  const docs = await api("/api/documents");
  assert.equal(docs.status, 401);
});

test("malformed cookies do not break anonymous auth resolution", async () => {
  const me = await api("/api/me", { cookie: "mowen_session=%E0%A4%A" });
  assert.equal(me.status, 200);
  assert.equal(me.json.authenticated, false);

  const docs = await api("/api/documents", { cookie: "mowen_session=%E0%A4%A" });
  assert.equal(docs.status, 401);
  assert.equal(docs.json.error.code, "unauthorized");
});

test("email verification gates sensitive team and API key actions", async () => {
  const owner = await register("verify-owner@example.com", { verify: false });
  const blockedInvite = await api(`/api/orgs/${owner.orgId}/invitations`, {
    method: "POST",
    cookie: owner.cookie,
    body: { email: "blocked@example.com" },
  });
  assert.equal(blockedInvite.status, 403);
  assert.equal(blockedInvite.json.error.code, "email_not_verified");

  const requested = await api("/api/auth/request-email-verification", {
    method: "POST",
    cookie: owner.cookie,
    body: { email: "verify-owner@example.com" },
  });
  assert.equal(requested.status, 200);
  assert.ok(requested.json.email_verification_token);
  const repeatedVerify = await api("/api/auth/request-email-verification", {
    method: "POST",
    cookie: owner.cookie,
    body: { email: "verify-owner@example.com" },
  });
  assert.equal(repeatedVerify.status, 200);
  const throttledVerify = await api("/api/auth/request-email-verification", {
    method: "POST",
    cookie: owner.cookie,
    body: { email: "verify-owner@example.com" },
  });
  assert.equal(throttledVerify.status, 429);
  assert.equal(throttledVerify.json.error.code, "email_request_throttled");

  const verified = await api("/api/auth/verify-email", {
    method: "POST",
    cookie: owner.cookie,
    body: { email: "verify-owner@example.com", token: requested.json.email_verification_token },
  });
  assert.equal(verified.status, 200);
  assert.ok(verified.json.user.email_verified_at);
  const data = await server.store.read();
  const deliveries = data.email_deliveries.filter((item) => item.email === "verify-owner@example.com");
  assert.ok(deliveries.length >= 1);
  assert.equal(deliveries.at(-1).status, "sent");
});

test("password reset revokes previous sessions", async () => {
  const owner = await register("reset-owner@example.com");
  const requested = await api("/api/auth/request-password-reset", {
    method: "POST",
    body: { email: "reset-owner@example.com" },
  });
  assert.equal(requested.status, 200);
  assert.ok(requested.json.reset_token);

  const reset = await api("/api/auth/reset-password", {
    method: "POST",
    body: { email: "reset-owner@example.com", token: requested.json.reset_token, password: "newpassword123" },
  });
  assert.equal(reset.status, 204);

  const oldSession = await api("/api/documents", { cookie: owner.cookie });
  assert.equal(oldSession.status, 401);

  const login = await api("/api/auth/login", {
    method: "POST",
    body: { email: "reset-owner@example.com", password: "newpassword123" },
  });
  assert.equal(login.status, 200);
});

test("production email mode sends through webhook without returning tokens", async () => {
  const emails = [];
  const receiverUrl = "https://mail.example.test/send";
  const restoreFetch = installFetchMock(async (url, init) => {
    if (url !== receiverUrl) return null;
    emails.push(JSON.parse(String(init.body || "{}")));
    return new Response("{}", { status: 202, headers: { "Content-Type": "application/json" } });
  });
  const temp = await mkdtemp(path.join(os.tmpdir(), "mowen-email-api-"));
  const emailServer = createApp({
    env: {
      NODE_ENV: "production",
      DATA_DIR: temp,
      APP_ENCRYPTION_SECRET: "production-encryption-secret-with-enough-length",
      SESSION_SECRET: "production-session-secret-with-enough-length",
      SESSION_SECURE: "true",
      APP_URL: "https://mowen.example.com/index.html",
      CORS_ORIGIN: "https://mowen.example.com",
      EMAIL_MODE: "webhook",
      EMAIL_WEBHOOK_URL: receiverUrl,
      AI_PROXY_MODE: "mock",
    },
  });
  await new Promise((resolve) => emailServer.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${emailServer.address().port}`;
  try {
    const response = await fetch(`${url}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "prod-email@example.com", password: "password123", name: "Prod" }),
    });
    const json = await response.json();
    assert.equal(response.status, 201);
    assert.equal(json.email_verification_token, "");
    assert.equal(emails.length, 1);
    assert.equal(emails[0].to, "prod-email@example.com");
    assert.ok(emails[0].metadata.delivery_id);
  } finally {
    restoreFetch();
    await new Promise((resolve) => emailServer.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
});

test("production email mode can send through Resend adapter", async () => {
  const emails = [];
  const receiverUrl = "https://api.resend.test/emails";
  const restoreFetch = installFetchMock(async (url, init) => {
    if (url !== receiverUrl) return null;
    emails.push({ headers: normalizeHeaderObject(init.headers), body: JSON.parse(String(init.body || "{}")) });
    return new Response(JSON.stringify({ id: "resend_email_123" }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  const temp = await mkdtemp(path.join(os.tmpdir(), "mowen-resend-api-"));
  const emailServer = createApp({
    env: {
      NODE_ENV: "production",
      DATA_DIR: temp,
      APP_ENCRYPTION_SECRET: "production-encryption-secret-with-enough-length",
      SESSION_SECRET: "production-session-secret-with-enough-length",
      SESSION_SECURE: "true",
      APP_URL: "https://mowen.example.com/index.html",
      CORS_ORIGIN: "https://mowen.example.com",
      EMAIL_MODE: "webhook",
      EMAIL_PROVIDER: "resend",
      EMAIL_RESEND_ENDPOINT: receiverUrl,
      EMAIL_RESEND_API_KEY: "re_test_key",
      EMAIL_FROM: "Mowen <noreply@example.com>",
      AI_PROXY_MODE: "mock",
    },
  });
  await new Promise((resolve) => emailServer.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${emailServer.address().port}`;
  try {
    const response = await fetch(`${url}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "prod-resend@example.com", password: "password123", name: "Resend" }),
    });
    const json = await response.json();
    assert.equal(response.status, 201);
    assert.equal(json.email_verification_token, "");
    assert.equal(emails.length, 1);
    assert.equal(emails[0].headers.authorization, "Bearer re_test_key");
    assert.equal(emails[0].body.from, "Mowen <noreply@example.com>");
    assert.deepEqual(emails[0].body.to, ["prod-resend@example.com"]);
    assert.ok(emails[0].body.text.includes("验证码："));
    assert.ok(emails[0].body.tags.some((tag) => tag.name === "template" && tag.value === "email_verification"));
    assert.ok(emails[0].body.tags.some((tag) => tag.name === "delivery_id" && tag.value));

    const data = await emailServer.store.read();
    const delivery = data.email_deliveries.find((item) => item.email === "prod-resend@example.com");
    assert.equal(delivery.provider, "resend");
    assert.equal(delivery.metadata.message_id, "resend_email_123");
  } finally {
    restoreFetch();
    await new Promise((resolve) => emailServer.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
});

test("email delivery callbacks require token and update delivery status", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "mowen-email-callback-api-"));
  const callbackServer = createApp({
    env: {
      DATA_DIR: temp,
      APP_ENCRYPTION_SECRET: "test-encryption-secret-with-enough-length",
      SESSION_SECRET: "test-session-secret-with-enough-length",
      AI_PROXY_MODE: "mock",
      EMAIL_CALLBACK_TOKEN: "callback-secret",
    },
  });
  await new Promise((resolve) => callbackServer.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${callbackServer.address().port}`;
  try {
    const registered = await fetch(`${url}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "callback-owner@example.com", password: "password123", name: "Callback" }),
    });
    assert.equal(registered.status, 201);
    const data = await callbackServer.store.read();
    const delivery = data.email_deliveries.find((item) => item.email === "callback-owner@example.com");
    assert.ok(delivery);

    const blocked = await fetch(`${url}/api/webhooks/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-email-callback-token": "bad" },
      body: JSON.stringify({ delivery_id: delivery.id, status: "delivered" }),
    });
    assert.equal(blocked.status, 403);

    const delivered = await fetch(`${url}/api/webhooks/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-email-callback-token": "callback-secret" },
      body: JSON.stringify({ delivery_id: delivery.id, status: "delivered", message_id: "msg_1" }),
    });
    const deliveredJson = await delivered.json();
    assert.equal(delivered.status, 200);
    assert.equal(deliveredJson.delivery.status, "delivered");

    const resendBounce = await fetch(`${url}/api/webhooks/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-email-callback-token": "callback-secret" },
      body: JSON.stringify({
        type: "email.bounced",
        data: {
          email_id: "resend_email_456",
          to: ["callback-owner@example.com"],
          tags: { delivery_id: delivery.id, template: "email_verification" },
          bounce: { message: "Mailbox unavailable" },
        },
      }),
    });
    const resendBounceJson = await resendBounce.json();
    assert.equal(resendBounce.status, 200);
    assert.equal(resendBounceJson.delivery.status, "bounced");
    const bouncedData = await callbackServer.store.read();
    const bouncedDelivery = bouncedData.email_deliveries.find((item) => item.id === delivery.id);
    assert.equal(bouncedDelivery.error, "Mailbox unavailable");
    assert.equal(bouncedDelivery.metadata.message_id, "resend_email_456");

    const unmatched = await fetch(`${url}/api/webhooks/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer callback-secret" },
      body: JSON.stringify({ delivery_id: "missing", status: "failed", error: "unknown message" }),
    });
    assert.equal(unmatched.status, 202);
    const after = await callbackServer.store.read();
    assert.equal(after.email_deliveries.find((item) => item.id === delivery.id).status, "bounced");
    assert.ok(after.system_events.some((item) => item.type === "email.delivery.callback.unmatched"));
  } finally {
    await new Promise((resolve) => callbackServer.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
});

test("login failures are throttled", async () => {
  await register("throttle-owner@example.com");
  for (let i = 0; i < 5; i += 1) {
    const failed = await api("/api/auth/login", {
      method: "POST",
      body: { email: "throttle-owner@example.com", password: `bad-${i}` },
    });
    assert.equal(failed.status, 401);
  }
  const throttled = await api("/api/auth/login", {
    method: "POST",
    body: { email: "throttle-owner@example.com", password: "password123" },
  });
  assert.equal(throttled.status, 429);
  assert.equal(throttled.json.error.code, "login_throttled");
});

test("documents are organization scoped and soft deleted", async () => {
  const owner = await register("docs-owner@example.com");
  const created = await api("/api/documents", {
    method: "POST",
    cookie: owner.cookie,
    body: { title: "云端文档", type: "通知", content: "正文" },
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.document.organization_id, owner.orgId);

  const listed = await api("/api/documents", { cookie: owner.cookie });
  assert.equal(listed.json.documents.length, 1);

  const deleted = await api(`/api/documents/${created.json.document.id}`, { method: "DELETE", cookie: owner.cookie });
  assert.equal(deleted.status, 200);
  assert.ok(deleted.json.document.deleted_at);

  const active = await api("/api/documents", { cookie: owner.cookie });
  assert.equal(active.json.documents.length, 0);
});

test("cookie authenticated writes reject untrusted browser origins", async () => {
  const owner = await register("origin-owner@example.com");
  const blocked = await api("/api/documents", {
    method: "POST",
    cookie: owner.cookie,
    headers: { Origin: "https://evil.example" },
    body: { title: "Blocked", content: "cross-site" },
  });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.json.error.code, "untrusted_origin");

  const allowed = await api("/api/documents", {
    method: "POST",
    cookie: owner.cookie,
    headers: { Origin: "http://127.0.0.1:4173" },
    body: { title: "Allowed", content: "same workbench origin" },
  });
  assert.equal(allowed.status, 201);

  const localhostAllowed = await api("/api/documents", {
    method: "POST",
    cookie: owner.cookie,
    headers: { Origin: "http://localhost:4173" },
    body: { title: "Localhost", content: "local dev origin" },
  });
  assert.equal(localhostAllowed.status, 201);
  assert.equal(localhostAllowed.headers.get("access-control-allow-origin"), "http://localhost:4173");

  const token = extractSessionToken(owner.cookie);
  const bearerAllowed = await api("/api/documents", {
    method: "POST",
    headers: { Origin: "https://evil.example", Authorization: `Bearer ${token}` },
    body: { title: "Bearer", content: "api client" },
  });
  assert.equal(bearerAllowed.status, 201);
});

test("writers keep versions and support restore", async () => {
  const owner = await register("writer-owner@example.com");
  const created = await api("/api/writers", {
    method: "POST",
    cookie: owner.cookie,
    body: { name: "通知执笔人", handle: "通知执笔人", summary_md: "v1", skill_json: { style_rules: { must: [] } } },
  });
  assert.equal(created.status, 201);

  const updated = await api(`/api/writers/${created.json.writer.id}`, {
    method: "PUT",
    cookie: owner.cookie,
    body: { summary_md: "v2" },
  });
  assert.equal(updated.status, 200);

  const versions = await api(`/api/writers/${created.json.writer.id}/versions`, { cookie: owner.cookie });
  assert.equal(versions.json.versions.length, 2);

  const restored = await api(`/api/writers/${created.json.writer.id}/versions/${versions.json.versions[0].id}/restore`, {
    method: "POST",
    cookie: owner.cookie,
  });
  assert.equal(restored.json.writer.summary_md, "v1");
});

test("API keys are encrypted at rest and never returned", async () => {
  const owner = await register("key-owner@example.com");
  const saved = await api("/api/api-keys", {
    method: "POST",
    cookie: owner.cookie,
    body: { provider: "openai-compatible", api_key: "sk-test-secret-value" },
  });
  assert.equal(saved.status, 201);
  assert.equal(saved.json.api_key.key_hint, "sk-t…alue");
  assert.equal(saved.json.api_key.encrypted_key, undefined);

  const data = await server.store.read();
  const raw = data.api_keys.find((item) => item.id === saved.json.api_key.id);
  assert.notEqual(raw.encrypted_key, "sk-test-secret-value");
  assert.match(raw.encrypted_key, /^gcm:/);
});

test("AI proxy records usage and enforces request limits", async () => {
  const owner = await register("ai-owner@example.com");
  for (let i = 0; i < 3; i += 1) {
    const response = await api("/api/ai/chat", {
      method: "POST",
      cookie: owner.cookie,
      body: { task_type: "test", messages: [{ role: "user", content: `hello ${i}` }] },
    });
    assert.equal(response.status, 200);
    assert.equal(response.json.mocked, true);
  }
  const blocked = await api("/api/ai/chat", {
    method: "POST",
    cookie: owner.cookie,
    body: { task_type: "test", messages: [{ role: "user", content: "blocked" }] },
  });
  assert.equal(blocked.status, 429);

  const usage = await api("/api/usage/current", { cookie: owner.cookie });
  assert.equal(usage.json.usage.request_count, 3);
  assert.ok(usage.json.usage.estimated_cost > 0);
});

test("live AI proxy fails clearly when no API key is configured", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "mowen-live-ai-api-"));
  const liveServer = createApp({
    env: {
      DATA_DIR: temp,
      APP_ENCRYPTION_SECRET: "test-encryption-secret-with-enough-length",
      SESSION_SECRET: "test-session-secret-with-enough-length",
      AI_PROXY_MODE: "live",
    },
  });
  await new Promise((resolve) => liveServer.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${liveServer.address().port}`;
  try {
    const registered = await fetch(`${url}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "live-ai-owner@example.com", password: "password123", name: "Live AI" }),
    });
    const cookie = registered.headers.get("set-cookie") || "";
    const response = await fetch(`${url}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ task_type: "live_missing_key", messages: [{ role: "user", content: "hello" }] }),
    });
    const json = await response.json();
    assert.equal(response.status, 400);
    assert.equal(json.error.code, "missing_provider_key");
    const data = await liveServer.store.read();
    assert.equal(data.ai_usage.length, 1);
    assert.equal(data.ai_usage[0].status, "failed");
    assert.equal(data.ai_usage[0].error, "请先配置组织接口 API Key");
    assert.ok(data.system_events.some((item) => item.type === "ai.proxy.failed" && item.metadata?.usage_id === data.ai_usage[0].id));
  } finally {
    await new Promise((resolve) => liveServer.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
});

test("manual recharge orders grant credits after admin approval", async () => {
  const owner = await register("manual-billing-owner@example.com");
  const summary = await api("/api/billing/summary", { cookie: owner.cookie });
  assert.equal(summary.status, 200);
  assert.ok(summary.json.manual_payment.packages.some((item) => item.id === "credits_1000"));

  const missingProof = await api("/api/billing/manual-orders", {
    method: "POST",
    cookie: owner.cookie,
    body: {
      package_id: "credits_1000",
      payment_channel: "wechat",
    },
  });
  assert.equal(missingProof.status, 400);
  assert.equal(missingProof.json.error.code, "manual_payment_proof_required");

  const created = await api("/api/billing/manual-orders", {
    method: "POST",
    cookie: owner.cookie,
    body: {
      package_id: "credits_1000",
      payment_channel: "wechat",
      payer_note: "test payer",
      proof_text: "screenshot-001",
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.order.status, "pending");

  const approved = await api(`/api/billing/manual-orders/${created.json.order.id}/review`, {
    method: "POST",
    cookie: owner.cookie,
    body: { action: "approve", review_note: "paid" },
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.json.order.status, "approved");
  assert.equal(approved.json.order.review_note, "paid");
  assert.equal(approved.json.credits.balance, 1000);
  assert.ok(approved.json.credit_ledger.some((item) => item.order_id === created.json.order.id && item.direction === "in"));

  const billingAfterApproval = await api("/api/billing/summary", { cookie: owner.cookie });
  assert.equal(billingAfterApproval.status, 200);
  assert.ok(billingAfterApproval.json.credit_ledger.some((item) =>
    item.order_id === created.json.order.id &&
    item.direction === "in" &&
    item.amount === 1000 &&
    item.balance_after === 1000));

  for (let i = 0; i < 4; i += 1) {
    const response = await api("/api/ai/chat", {
      method: "POST",
      cookie: owner.cookie,
      body: { task_type: "credit_test", messages: [{ role: "user", content: `credit ${i}` }] },
    });
    assert.equal(response.status, 200);
  }

  const afterUsage = await api("/api/usage/current", { cookie: owner.cookie });
  assert.equal(afterUsage.status, 200);
  assert.equal(afterUsage.json.credits.balance, 999);

  const refreshed = await api("/api/billing/manual-orders", { cookie: owner.cookie });
  assert.equal(refreshed.status, 200);
  assert.equal(refreshed.json.orders[0].status, "approved");
  assert.ok(refreshed.json.credit_ledger.some((item) => item.order_id === created.json.order.id));

  const data = await server.store.read();
  assert.ok(data.audit_logs.some((item) => item.action === "billing.manual_order.create" && item.target_id === created.json.order.id && item.metadata.proof_submitted));
  assert.ok(data.audit_logs.some((item) => item.action === "billing.manual_order.approve" && item.target_id === created.json.order.id && item.metadata.review_note === "paid"));
  assert.ok(data.audit_logs.some((item) => item.action === "billing.credit.grant" && item.metadata.order_id === created.json.order.id && item.metadata.balance_after === 1000));
});

test("organization invitations add members without exposing cross-org data", async () => {
  const owner = await register("invite-owner@example.com");
  const invitee = await register("invitee@example.com");
  const invitation = await api(`/api/orgs/${owner.orgId}/invitations`, {
    method: "POST",
    cookie: owner.cookie,
    body: { email: "invitee@example.com", role: "member" },
  });
  assert.equal(invitation.status, 201);
  assert.ok(invitation.json.invitation.token);

  const missingToken = await api(`/api/orgs/${owner.orgId}/invitations/${invitation.json.invitation.id}/accept`, {
    method: "POST",
    cookie: invitee.cookie,
    body: {},
  });
  assert.equal(missingToken.status, 403);
  assert.equal(missingToken.json.error.code, "invalid_invitation_token");

  const accepted = await api(`/api/orgs/${owner.orgId}/invitations/${invitation.json.invitation.id}/accept`, {
    method: "POST",
    cookie: invitee.cookie,
    body: { token: invitation.json.invitation.token },
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.json.membership.role, "member");

  const memberDashboard = await api("/api/admin/dashboard", { cookie: invitee.cookie });
  assert.equal(memberDashboard.status, 403);
  assert.equal(memberDashboard.json.error.code, "forbidden");

  const invitations = await api(`/api/orgs/${owner.orgId}/invitations`, { cookie: owner.cookie });
  assert.equal(invitations.status, 200);
  assert.equal(invitations.json.invitations[0].token, undefined);

  const members = await api(`/api/orgs/${owner.orgId}/members`, { cookie: owner.cookie });
  assert.equal(members.status, 200);
  assert.equal(members.json.members.length, 2);

  const inviteeMembership = members.json.members.find((member) => member.user.email === "invitee@example.com");
  const promoted = await api(`/api/orgs/${owner.orgId}/members/${inviteeMembership.id}`, {
    method: "PUT",
    cookie: owner.cookie,
    body: { role: "admin" },
  });
  assert.equal(promoted.status, 200);
  assert.equal(promoted.json.membership.role, "admin");

  const removed = await api(`/api/orgs/${owner.orgId}/members/${inviteeMembership.id}`, {
    method: "DELETE",
    cookie: owner.cookie,
  });
  assert.equal(removed.status, 200);

  const afterRemove = await api(`/api/orgs/${owner.orgId}/members`, { cookie: owner.cookie });
  assert.equal(afterRemove.json.members.length, 1);
});

test("operator role can view operations data without mutating the organization", async () => {
  const owner = await register("operator-owner@example.com");
  const operator = await register("operator-viewer@example.com");
  const invitation = await api(`/api/orgs/${owner.orgId}/invitations`, {
    method: "POST",
    cookie: owner.cookie,
    body: { email: "operator-viewer@example.com", role: "operator" },
  });
  assert.equal(invitation.status, 201);
  const accepted = await api(`/api/orgs/${owner.orgId}/invitations/${invitation.json.invitation.id}/accept`, {
    method: "POST",
    cookie: operator.cookie,
    body: { token: invitation.json.invitation.token },
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.json.membership.role, "operator");
  const operatorHeaders = { "x-organization-id": owner.orgId };

  const renamed = await api(`/api/orgs/${owner.orgId}`, {
    method: "PUT",
    cookie: owner.cookie,
    body: { name: "运营只读测试组织" },
  });
  assert.equal(renamed.status, 200);
  const feedback = await api("/api/feedback", {
    method: "POST",
    cookie: owner.cookie,
    body: { message: "需要运营查看的反馈" },
  });
  assert.equal(feedback.status, 201);
  const manualOrder = await api("/api/billing/manual-orders", {
    method: "POST",
    cookie: owner.cookie,
    body: {
      package_id: "credits_1000",
      payment_channel: "alipay",
      payer_note: "operator proof",
    },
  });
  assert.equal(manualOrder.status, 201);
  await api("/api/api-keys", {
    method: "POST",
    cookie: owner.cookie,
    body: { provider: "openai-compatible", api_key: "sk-test-operator-view" },
  });
  await server.store.write((data) => {
    const now = new Date().toISOString();
    data.system_events.push({ id: "evt-operator-warning", organization_id: owner.orgId, user_id: owner.userId, level: "warn", type: "operator.warning", message: "operator", metadata: {}, created_at: now });
    data.ai_usage.push({
      id: "use-operator-owned",
      organization_id: owner.orgId,
      user_id: owner.userId,
      provider: "mock",
      model: "mock",
      task_type: "operator_view",
      status: "success",
      prompt_tokens: 11,
      completion_tokens: 1,
      total_tokens: 12,
      estimated_cost: 0,
      error: "",
      created_at: now,
    });
  });

  const dashboard = await api("/api/admin/dashboard", { cookie: operator.cookie, headers: operatorHeaders });
  assert.equal(dashboard.status, 200);
  assert.ok(dashboard.json.members.some((item) => item.role === "operator"));
  const usage = await api("/api/usage/history?task_type=operator_view", { cookie: operator.cookie, headers: operatorHeaders });
  assert.equal(usage.status, 200);
  assert.ok(usage.json.usage.some((item) => item.id === "use-operator-owned"));
  const audit = await api("/api/audit?action=organization.update", { cookie: operator.cookie, headers: operatorHeaders });
  assert.equal(audit.status, 200);
  assert.equal(audit.json.audit_logs.length, 1);
  const errors = await api("/api/ops/recent-errors", { cookie: operator.cookie, headers: operatorHeaders });
  assert.equal(errors.status, 200);
  assert.ok(errors.json.errors.some((item) => item.id === "evt-operator-warning"));
  const billing = await api("/api/billing/summary", { cookie: operator.cookie, headers: operatorHeaders });
  assert.equal(billing.status, 200);
  assert.equal(billing.json.checkout.enabled, false);
  assert.ok(billing.json.manual_orders.some((item) => item.id === manualOrder.json.order.id && item.proof_text === ""));
  const keys = await api("/api/api-keys", { cookie: operator.cookie, headers: operatorHeaders });
  assert.equal(keys.status, 200);
  assert.ok(keys.json.api_keys.some((item) => item.key_hint));
  const preferences = await api("/api/admin/preferences", {
    method: "PUT",
    cookie: operator.cookie,
    headers: operatorHeaders,
    body: { preferences: { audit_filters: [{ name: "只读筛选", action: "organization.update" }] } },
  });
  assert.equal(preferences.status, 200);

  const blockedOrgUpdate = await api(`/api/orgs/${owner.orgId}`, {
    method: "PUT",
    cookie: operator.cookie,
    headers: operatorHeaders,
    body: { name: "不应修改" },
  });
  assert.equal(blockedOrgUpdate.status, 403);
  const blockedKeySave = await api("/api/api-keys", {
    method: "POST",
    cookie: operator.cookie,
    headers: operatorHeaders,
    body: { provider: "openai-compatible", api_key: "sk-denied" },
  });
  assert.equal(blockedKeySave.status, 403);
  const blockedCheckout = await api("/api/billing/checkout", {
    method: "POST",
    cookie: operator.cookie,
    headers: operatorHeaders,
    body: { plan: "pro" },
  });
  assert.equal(blockedCheckout.status, 403);
  const blockedReview = await api(`/api/billing/manual-orders/${manualOrder.json.order.id}/review`, {
    method: "POST",
    cookie: operator.cookie,
    headers: operatorHeaders,
    body: { action: "approve" },
  });
  assert.equal(blockedReview.status, 403);
  const feedbackItem = dashboard.json.feedbacks.find((item) => item.message === "需要运营查看的反馈");
  const blockedFeedback = await api(`/api/feedback/${feedbackItem.id}/status`, {
    method: "POST",
    cookie: operator.cookie,
    headers: operatorHeaders,
    body: { status: "resolved" },
  });
  assert.equal(blockedFeedback.status, 403);
  const blockedTriage = await api("/api/ops/events/evt-operator-warning/triage", {
    method: "POST",
    cookie: operator.cookie,
    headers: operatorHeaders,
    body: { status: "resolved" },
  });
  assert.equal(blockedTriage.status, 403);
});

test("document and writer sync updates reject stale versions unless forced", async () => {
  const owner = await register("version-owner@example.com");
  const createdDoc = await api("/api/documents", {
    method: "POST",
    cookie: owner.cookie,
    body: { title: "Versioned", content: "v1" },
  });
  assert.equal(createdDoc.json.document.version, 1);
  const updatedDoc = await api(`/api/documents/${createdDoc.json.document.id}`, {
    method: "PUT",
    cookie: owner.cookie,
    body: { title: "Versioned", content: "v2", expected_version: 1 },
  });
  assert.equal(updatedDoc.status, 200);
  assert.equal(updatedDoc.json.document.version, 2);
  const staleDoc = await api(`/api/documents/${createdDoc.json.document.id}`, {
    method: "PUT",
    cookie: owner.cookie,
    body: { title: "Versioned", content: "stale", expected_version: 1 },
  });
  assert.equal(staleDoc.status, 409);
  assert.equal(staleDoc.json.error.code, "version_conflict");
  assert.equal(staleDoc.json.error.details.current_version, 2);

  const writer = await api("/api/writers", {
    method: "POST",
    cookie: owner.cookie,
    body: { name: "Writer", handle: "writer", summary_md: "v1" },
  });
  assert.equal(writer.json.writer.version, 1);
  const staleWriter = await api(`/api/writers/${writer.json.writer.id}`, {
    method: "PUT",
    cookie: owner.cookie,
    body: { summary_md: "stale", expected_version: 0 },
  });
  assert.equal(staleWriter.status, 409);
});

test("data export, recent errors, readiness, and account deletion work", async () => {
  const owner = await register("ops-owner@example.com");
  const ready = await api("/api/ready");
  assert.equal(ready.status, 200);
  assert.equal(ready.json.ok, true);

  const renamed = await api(`/api/orgs/${owner.orgId}`, {
    method: "PUT",
    cookie: owner.cookie,
    body: { name: "灰度团队" },
  });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.json.organization.name, "灰度团队");

  await api("/api/documents", {
    method: "POST",
    cookie: owner.cookie,
    body: { title: "Exportable", content: "content" },
  });
  const exported = await api("/api/me/export", { cookie: owner.cookie });
  assert.equal(exported.status, 200);
  assert.equal(exported.json.documents.length, 1);
  assert.equal(exported.json.api_keys, undefined);

  await api("/api/ai/chat", {
    method: "POST",
    cookie: owner.cookie,
    body: { task_type: "ops_test", messages: [{ role: "user", content: "hello" }] },
  });
  const other = await register("ops-other@example.com");
  await server.store.write((data) => {
    const now = new Date().toISOString();
    data.system_events.push(
      { id: "evt-global-warning", organization_id: null, user_id: null, level: "warn", type: "global.warning", message: "global", metadata: {}, created_at: now },
      { id: "evt-other-warning", organization_id: other.orgId, user_id: other.userId, level: "warn", type: "other.warning", message: "other", metadata: {}, created_at: now },
      { id: "evt-owner-warning", organization_id: owner.orgId, user_id: owner.userId, level: "warn", type: "owner.warning", message: "owner", metadata: {}, created_at: now },
    );
    data.ai_usage.push({
      id: "use-owner-failed",
      organization_id: owner.orgId,
      user_id: owner.userId,
      provider: "openai-compatible",
      model: "mock",
      task_type: "ops_failed",
      status: "failed",
      prompt_tokens: 10,
      completion_tokens: 0,
      total_tokens: 10,
      estimated_cost: 0,
      error: "AI proxy failed",
      created_at: now,
    });
  });
  const errors = await api("/api/ops/recent-errors", { cookie: owner.cookie });
  assert.equal(errors.status, 200);
  assert.ok(Array.isArray(errors.json.errors));
  assert.ok(errors.json.errors.some((item) => item.id === "evt-owner-warning"));
  assert.ok(errors.json.errors.some((item) => item.id === "use-owner-failed" && item.source_type === "ai_usage"));
  assert.equal(errors.json.errors.some((item) => item.id === "evt-global-warning"), false);
  assert.equal(errors.json.errors.some((item) => item.id === "evt-other-warning"), false);

  const billing = await api("/api/billing/summary", { cookie: owner.cookie });
  assert.equal(billing.status, 200);
  assert.equal(billing.json.organization.plan, "free");
  const checkoutWarning = await api("/api/billing/checkout", {
    method: "POST",
    cookie: owner.cookie,
    body: { plan: "pro" },
  });
  assert.equal(checkoutWarning.status, 503);

  const audit = await api("/api/audit?action=organization.update", { cookie: owner.cookie });
  assert.equal(audit.status, 200);
  assert.equal(audit.json.audit_logs.length, 1);

  const feedback = await api("/api/feedback", {
    method: "POST",
    cookie: owner.cookie,
    body: { message: "灰度试用反馈" },
  });
  assert.equal(feedback.status, 201);
  const feedbackTwo = await api("/api/feedback", {
    method: "POST",
    cookie: owner.cookie,
    body: { message: "第二条试用反馈" },
  });
  assert.equal(feedbackTwo.status, 201);

  const dashboard = await api("/api/admin/dashboard", { cookie: owner.cookie });
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.json.organization.name, "灰度团队");
  assert.equal(dashboard.json.feedbacks.length, 2);
  const feedbackStatus = await api(`/api/feedback/${dashboard.json.feedbacks[0].id}/status`, {
    method: "POST",
    cookie: owner.cookie,
    body: { status: "processing", assignee: "ops@example.com", sla_at: "2026-05-30", note: "先跟进" },
  });
  assert.equal(feedbackStatus.status, 200);
  assert.equal(feedbackStatus.json.feedback.metadata.status, "processing");
  assert.equal(feedbackStatus.json.feedback.metadata.assignee, "ops@example.com");
  assert.equal(feedbackStatus.json.feedback.metadata.sla_at, "2026-05-30");
  assert.equal(feedbackStatus.json.feedback.metadata.note, "先跟进");
  const feedbackBatch = await api("/api/feedback/batch-status", {
    method: "POST",
    cookie: owner.cookie,
    body: { feedback_ids: dashboard.json.feedbacks.map((item) => item.id), status: "resolved" },
  });
  assert.equal(feedbackBatch.status, 200);
  assert.equal(feedbackBatch.json.count, 2);
  assert.ok(feedbackBatch.json.feedbacks.every((item) => item.metadata.status === "resolved"));

  const triageTarget = dashboard.json.recent_errors.find((item) => item.type === "billing.checkout.not_configured");
  assert.ok(triageTarget?.id);
  const triaged = await api(`/api/ops/events/${triageTarget.id}/triage`, {
    method: "POST",
    cookie: owner.cookie,
    body: { status: "processing", priority: "high", assignee: "tech@example.com", sla_at: "2026-05-31", note: "配置支付链接" },
  });
  assert.equal(triaged.status, 200);
  assert.equal(triaged.json.event.metadata.triage_status, "processing");
  assert.equal(triaged.json.event.metadata.assignee, "tech@example.com");
  const globalTriage = await api("/api/ops/events/evt-global-warning/triage", {
    method: "POST",
    cookie: owner.cookie,
    body: { status: "resolved" },
  });
  assert.equal(globalTriage.status, 404);
  const aiTriaged = await api("/api/ops/events/use-owner-failed/triage", {
    method: "POST",
    cookie: owner.cookie,
    body: { status: "processing", priority: "urgent", assignee: "ai@example.com", sla_at: "2026-06-01", note: "排查接口失败" },
  });
  assert.equal(aiTriaged.status, 200);
  assert.equal(aiTriaged.json.event.source_type, "ai_usage");
  assert.equal(aiTriaged.json.event.metadata.triage_status, "processing");
  assert.equal(aiTriaged.json.event.metadata.assignee, "ai@example.com");

  const savedPreferences = await api("/api/admin/preferences", {
    method: "PUT",
    cookie: owner.cookie,
    body: { preferences: { audit_filters: [{ id: "filter-ops", name: "组织变更", action: "organization.update" }] } },
  });
  assert.equal(savedPreferences.status, 200);
  assert.equal(savedPreferences.json.preferences.audit_filters.length, 1);
  const loadedPreferences = await api("/api/admin/preferences", { cookie: owner.cookie });
  assert.equal(loadedPreferences.json.preferences.audit_filters[0].name, "组织变更");

  const orgExport = await api(`/api/orgs/${owner.orgId}/export`, { cookie: owner.cookie });
  assert.equal(orgExport.status, 200);
  assert.equal(orgExport.json.scope, "organization");
  assert.equal(orgExport.json.api_keys.length, 0);
  assert.equal(orgExport.json.ops_triage.length, 1);
  assert.equal(orgExport.json.admin_preferences.length, 1);
  const deletionRequest = await api(`/api/orgs/${owner.orgId}/deletion-request`, {
    method: "POST",
    cookie: owner.cookie,
    body: { reason: "测试删除草案" },
  });
  assert.equal(deletionRequest.status, 202);
  assert.equal(deletionRequest.json.request.status, "draft");

  const deleted = await api("/api/me", { method: "DELETE", cookie: owner.cookie });
  assert.equal(deleted.status, 204);
  const afterDelete = await api("/api/documents", { cookie: owner.cookie });
  assert.equal(afterDelete.status, 401);
});

test("JSON store date filters include the full selected end date", async () => {
  const owner = await register("date-filter-owner@example.com");
  await server.store.write((data) => {
    data.audit_logs.push(
      { id: "aud-before-date", organization_id: owner.orgId, user_id: owner.userId, action: "date.filter", target_type: "test", target_id: "before", metadata: {}, created_at: "2026-05-23T23:59:59.000Z" },
      { id: "aud-on-date", organization_id: owner.orgId, user_id: owner.userId, action: "date.filter", target_type: "test", target_id: "on", metadata: {}, created_at: "2026-05-24T12:00:00.000Z" },
      { id: "aud-after-date", organization_id: owner.orgId, user_id: owner.userId, action: "date.filter", target_type: "test", target_id: "after", metadata: {}, created_at: "2026-05-25T00:00:00.000Z" },
    );
    data.ai_usage.push(
      { id: "use-before-date", organization_id: owner.orgId, user_id: owner.userId, provider: "mock", model: "mock", task_type: "date_filter", prompt_tokens: 1, completion_tokens: 0, total_tokens: 1, estimated_cost: 0, status: "success", error: "", created_at: "2026-05-23T23:59:59.000Z" },
      { id: "use-on-date", organization_id: owner.orgId, user_id: owner.userId, provider: "mock", model: "mock", task_type: "date_filter", prompt_tokens: 1, completion_tokens: 0, total_tokens: 1, estimated_cost: 0, status: "success", error: "", created_at: "2026-05-24T12:00:00.000Z" },
      { id: "use-after-date", organization_id: owner.orgId, user_id: owner.userId, provider: "mock", model: "mock", task_type: "date_filter", prompt_tokens: 1, completion_tokens: 0, total_tokens: 1, estimated_cost: 0, status: "success", error: "", created_at: "2026-05-25T00:00:00.000Z" },
    );
  });

  const audit = await api("/api/audit?action=date.filter&to=2026-05-24", { cookie: owner.cookie });
  assert.equal(audit.status, 200);
  assert.ok(audit.json.audit_logs.some((item) => item.id === "aud-on-date"));
  assert.equal(audit.json.audit_logs.some((item) => item.id === "aud-after-date"), false);

  const usage = await api("/api/usage/history?task_type=date_filter&from=2026-05-24&to=2026-05-24", { cookie: owner.cookie });
  assert.equal(usage.status, 200);
  assert.deepEqual(usage.json.usage.map((item) => item.id), ["use-on-date"]);
});

test("billing checkout is admin-only and returns configured checkout URLs", async () => {
  const owner = await register("checkout-owner@example.com");
  const invitee = await register("checkout-member@example.com");
  const invitation = await api(`/api/orgs/${owner.orgId}/invitations`, {
    method: "POST",
    cookie: owner.cookie,
    body: { email: "checkout-member@example.com", role: "member" },
  });
  const accepted = await api(`/api/orgs/${owner.orgId}/invitations/${invitation.json.invitation.id}/accept`, {
    method: "POST",
    cookie: invitee.cookie,
    headers: { "x-organization-id": owner.orgId },
    body: { token: invitation.json.invitation.token },
  });
  assert.equal(accepted.status, 200);

  const blockedMember = await api("/api/billing/checkout", {
    method: "POST",
    cookie: invitee.cookie,
    headers: { "x-organization-id": owner.orgId },
    body: { plan: "pro" },
  });
  assert.equal(blockedMember.status, 403);

  const memberBilling = await api("/api/billing/summary", {
    cookie: invitee.cookie,
    headers: { "x-organization-id": owner.orgId },
  });
  assert.equal(memberBilling.status, 200);
  assert.equal(memberBilling.json.organization.id, owner.orgId);
  assert.equal(memberBilling.json.checkout.enabled, false);
  assert.ok(Array.isArray(memberBilling.json.manual_payment.packages));

  const unconfigured = await api("/api/billing/checkout", {
    method: "POST",
    cookie: owner.cookie,
    body: { plan: "pro" },
  });
  assert.equal(unconfigured.status, 503);
  assert.equal(unconfigured.json.error.code, "billing_checkout_not_configured");

  const temp = await mkdtemp(path.join(os.tmpdir(), "mowen-checkout-api-"));
  const checkoutServer = createApp({
    env: {
      DATA_DIR: temp,
      APP_ENCRYPTION_SECRET: "test-encryption-secret-with-enough-length",
      SESSION_SECRET: "test-session-secret-with-enough-length",
      AI_PROXY_MODE: "mock",
      PAYMENT_CHECKOUT_MODE: "mock",
      PAYMENT_PLAN_PRICE_MAP: JSON.stringify({ price_pro: "pro", price_team: "team" }),
      APP_URL: "http://127.0.0.1:4173/index.html",
    },
  });
  await new Promise((resolve) => checkoutServer.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${checkoutServer.address().port}`;
  try {
    const registered = await fetch(`${url}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "checkout-billing@example.com", password: "password123", name: "Checkout" }),
    });
    const registeredJson = await registered.json();
    const cookie = registered.headers.get("set-cookie") || "";
    const created = await fetch(`${url}/api/billing/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ plan: "pro" }),
    });
    const createdJson = await created.json();
    assert.equal(created.status, 201);
    assert.equal(createdJson.checkout.plan, "pro");
    assert.equal(createdJson.checkout.price_id, "price_pro");
    assert.match(createdJson.checkout.checkout_url, /billing-checkout-mock/);

    const rejected = await fetch(`${url}/api/billing/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ plan: "team-plus" }),
    });
    const rejectedJson = await rejected.json();
    assert.equal(rejected.status, 400);
    assert.equal(rejectedJson.error.code, "invalid_billing_plan");

    const data = await checkoutServer.store.read();
    assert.ok(data.audit_logs.some((item) => item.action === "billing.checkout.create" && item.organization_id === registeredJson.active_organization.id));
  } finally {
    await new Promise((resolve) => checkoutServer.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
});

test("payment webhook requires a signed request and is idempotent", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "mowen-webhook-api-"));
  const webhookServer = createApp({
    env: {
      DATA_DIR: temp,
      APP_ENCRYPTION_SECRET: "test-encryption-secret-with-enough-length",
      SESSION_SECRET: "test-session-secret-with-enough-length",
      AI_PROXY_MODE: "mock",
      PAYMENT_WEBHOOK_SECRET: "shared-secret",
      PAYMENT_PLAN_PRICE_MAP: JSON.stringify({ price_pro: "pro", price_team: "team" }),
    },
  });
  await new Promise((resolve) => webhookServer.listen(0, "127.0.0.1", resolve));
  const address = webhookServer.address();
  const url = `http://127.0.0.1:${address.port}`;
  try {
    const registered = await fetch(`${url}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "billing-owner@example.com", password: "password123", name: "Billing" }),
    });
    const registeredJson = await registered.json();
    const body = JSON.stringify({ provider: "mockpay", event_id: "evt_1", event_type: "checkout.completed", organization_id: registeredJson.active_organization.id, payload: { price_id: "price_pro" } });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = signWebhook("shared-secret", timestamp, body);
    const first = await fetch(`${url}/api/webhooks/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-webhook-timestamp": timestamp, "x-webhook-signature": signature },
      body,
    });
    assert.equal(first.status, 200);
    const second = await fetch(`${url}/api/webhooks/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-webhook-timestamp": timestamp, "x-webhook-signature": signature },
      body,
    });
    assert.equal(second.status, 200);
    const rejected = await fetch(`${url}/api/webhooks/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-webhook-timestamp": timestamp, "x-webhook-signature": "bad" },
      body,
    });
    assert.equal(rejected.status, 403);
    const expiredTimestamp = String(Math.floor(Date.now() / 1000) - 600);
    const expired = await fetch(`${url}/api/webhooks/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-webhook-timestamp": expiredTimestamp, "x-webhook-signature": signWebhook("shared-secret", expiredTimestamp, body) },
      body,
    });
    assert.equal(expired.status, 403);
    const data = await webhookServer.store.read();
    assert.equal(data.payment_webhooks.length, 1);
    assert.equal(data.organizations.find((item) => item.id === registeredJson.active_organization.id).plan, "pro");
    const forgedBody = JSON.stringify({ provider: "mockpay", event_id: "evt_forged", event_type: "checkout.completed", organization_id: registeredJson.active_organization.id, plan: "team" });
    const forgedTimestamp = Math.floor(Date.now() / 1000).toString();
    const forged = await fetch(`${url}/api/webhooks/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-webhook-timestamp": forgedTimestamp, "x-webhook-signature": signWebhook("shared-secret", forgedTimestamp, forgedBody) },
      body: forgedBody,
    });
    assert.equal(forged.status, 200);
    const afterForged = await webhookServer.store.read();
    assert.equal(afterForged.organizations.find((item) => item.id === registeredJson.active_organization.id).plan, "pro");
    const failedBody = JSON.stringify({ provider: "mockpay", event_id: "evt_failed", event_type: "invoice.payment_failed", organization_id: registeredJson.active_organization.id, payload: { price_id: "price_team" } });
    const failedTimestamp = Math.floor(Date.now() / 1000).toString();
    const failed = await fetch(`${url}/api/webhooks/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-webhook-timestamp": failedTimestamp, "x-webhook-signature": signWebhook("shared-secret", failedTimestamp, failedBody) },
      body: failedBody,
    });
    assert.equal(failed.status, 200);
    const refundBody = JSON.stringify({ provider: "mockpay", event_id: "evt_refund", event_type: "refund.created", organization_id: registeredJson.active_organization.id });
    const refundTimestamp = Math.floor(Date.now() / 1000).toString();
    const refund = await fetch(`${url}/api/webhooks/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-webhook-timestamp": refundTimestamp, "x-webhook-signature": signWebhook("shared-secret", refundTimestamp, refundBody) },
      body: refundBody,
    });
    assert.equal(refund.status, 200);
    const cancelBody = JSON.stringify({ provider: "mockpay", event_id: "evt_cancel", event_type: "subscription.cancelled", organization_id: registeredJson.active_organization.id });
    const cancelTimestamp = Math.floor(Date.now() / 1000).toString();
    const cancel = await fetch(`${url}/api/webhooks/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-webhook-timestamp": cancelTimestamp, "x-webhook-signature": signWebhook("shared-secret", cancelTimestamp, cancelBody) },
      body: cancelBody,
    });
    assert.equal(cancel.status, 200);
    const afterEvents = await webhookServer.store.read();
    assert.equal(afterEvents.payment_webhooks.length, 5);
    assert.equal(afterEvents.organizations.find((item) => item.id === registeredJson.active_organization.id).plan, "free");
    assert.ok(afterEvents.system_events.some((item) => item.type === "billing.payment.failed"));
    assert.ok(afterEvents.system_events.some((item) => item.type === "billing.refund.recorded"));
  } finally {
    await new Promise((resolve) => webhookServer.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
});

function signWebhook(secret, timestamp, body) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

function installFetchMock(handler) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url;
    const mocked = await handler(url, init);
    return mocked || originalFetch(input, init);
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function normalizeHeaderObject(headers = {}) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}

function extractSessionToken(cookieHeader) {
  const match = String(cookieHeader || "").match(/(?:^|;\s*)mowen_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

test("production mode rejects default secrets", () => {
  assert.throws(() => createApp({ env: { NODE_ENV: "production" } }), /APP_ENCRYPTION_SECRET/);
});

test("unexpected request errors are recorded under the active organization", async () => {
  const token = "scoped-error-session-token";
  const now = new Date().toISOString();
  const data = normalizeData({
    users: [{
      id: "usr_error",
      email: "error-owner@example.com",
      name: "Error Owner",
      password_hash: "",
      disabled_at: null,
      created_at: now,
      updated_at: now,
    }],
    organizations: [{
      id: "org_error",
      name: "Error Org",
      slug: "error-org",
      plan: "free",
      created_by: "usr_error",
      created_at: now,
      updated_at: now,
    }],
    memberships: [{
      id: "mem_error",
      organization_id: "org_error",
      user_id: "usr_error",
      role: "owner",
      created_at: now,
    }],
    sessions: [{
      id: "ses_error",
      user_id: "usr_error",
      token_hash: sha256(token),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      created_at: now,
    }],
  });
  let failNextWrite = true;
  const store = {
    async init() {},
    async read() {
      return data;
    },
    async write(mutator) {
      if (failNextWrite) {
        failNextWrite = false;
        throw new Error("simulated document write failure");
      }
      return mutator(data);
    },
  };
  const scopedServer = createApp({
    env: {
      APP_ENCRYPTION_SECRET: "test-encryption-secret-with-enough-length",
      SESSION_SECRET: "test-session-secret-with-enough-length",
      AI_PROXY_MODE: "mock",
    },
    store,
  });
  await new Promise((resolve) => scopedServer.listen(0, "127.0.0.1", resolve));
  const address = scopedServer.address();
  const scopedBaseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetch(`${scopedBaseUrl}/api/documents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `mowen_session=${encodeURIComponent(token)}`,
      },
      body: JSON.stringify({ title: "Broken", content: "body" }),
    });

    assert.equal(response.status, 500);
    assert.ok(data.system_events.some((item) =>
      item.organization_id === "org_error" &&
      item.user_id === "usr_error" &&
      item.type === "http.request.failed" &&
      item.metadata.url === "/api/documents"));
  } finally {
    await new Promise((resolve) => scopedServer.close(resolve));
  }
});

test("unexpected request errors use system event repository hook when available", async () => {
  const token = "scoped-error-hook-session-token";
  const now = new Date().toISOString();
  const data = normalizeData({
    users: [{
      id: "usr_error_hook",
      email: "error-hook-owner@example.com",
      name: "Error Hook Owner",
      password_hash: "",
      disabled_at: null,
      created_at: now,
      updated_at: now,
    }],
    organizations: [{
      id: "org_error_hook",
      name: "Error Hook Org",
      slug: "error-hook-org",
      plan: "free",
      created_by: "usr_error_hook",
      created_at: now,
      updated_at: now,
    }],
    memberships: [{
      id: "mem_error_hook",
      organization_id: "org_error_hook",
      user_id: "usr_error_hook",
      role: "owner",
      created_at: now,
    }],
    sessions: [{
      id: "ses_error_hook",
      user_id: "usr_error_hook",
      token_hash: sha256(token),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      created_at: now,
    }],
  });
  let writeCalls = 0;
  let createdEventOptions = null;
  const store = {
    async init() {},
    async read() {
      return data;
    },
    async write() {
      writeCalls += 1;
      throw new Error("simulated document write failure");
    },
    async createSystemEvent(options) {
      createdEventOptions = options;
      const event = {
        id: "evt_error_hook",
        organization_id: options.organizationId,
        user_id: options.userId,
        level: options.level,
        type: options.type,
        message: options.message,
        metadata: options.metadata,
        created_at: now,
      };
      data.system_events.push(event);
      return event;
    },
  };
  const scopedServer = createApp({
    env: {
      APP_ENCRYPTION_SECRET: "test-encryption-secret-with-enough-length",
      SESSION_SECRET: "test-session-secret-with-enough-length",
      AI_PROXY_MODE: "mock",
    },
    store,
  });
  await new Promise((resolve) => scopedServer.listen(0, "127.0.0.1", resolve));
  const address = scopedServer.address();
  const scopedBaseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetch(`${scopedBaseUrl}/api/documents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `mowen_session=${encodeURIComponent(token)}`,
      },
      body: JSON.stringify({ title: "Broken", content: "body" }),
    });

    assert.equal(response.status, 500);
    assert.equal(writeCalls, 1);
    assert.equal(createdEventOptions.organizationId, "org_error_hook");
    assert.equal(createdEventOptions.userId, "usr_error_hook");
    assert.equal(createdEventOptions.type, "http.request.failed");
    assert.equal(createdEventOptions.metadata.url, "/api/documents");
  } finally {
    await new Promise((resolve) => scopedServer.close(resolve));
  }
});

test("billing checkout warnings use system event repository hook when available", async () => {
  const now = new Date().toISOString();
  const token = `checkout-event-hook-${crypto.randomUUID()}`;
  const data = normalizeData({
    users: [{
      id: "usr_checkout_event",
      email: "checkout-event@example.com",
      name: "Checkout Event",
      password_hash: "unused",
      email_verified_at: now,
      created_at: now,
      updated_at: now,
    }],
    organizations: [{
      id: "org_checkout_event",
      name: "Checkout Event Org",
      slug: "checkout-event-org",
      plan: "free",
      created_by: "usr_checkout_event",
      created_at: now,
      updated_at: now,
    }],
    memberships: [{
      id: "mem_checkout_event",
      organization_id: "org_checkout_event",
      user_id: "usr_checkout_event",
      role: "admin",
      created_at: now,
    }],
    sessions: [{
      id: "ses_checkout_event",
      user_id: "usr_checkout_event",
      token_hash: sha256(token),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      created_at: now,
    }],
  });
  let writeCalled = false;
  const createdEventOptions = [];
  const store = {
    async init() {},
    async read() {
      return data;
    },
    async write(mutator) {
      writeCalled = true;
      return mutator(data);
    },
    async createSystemEvent(options) {
      createdEventOptions.push(options);
      const event = {
        id: `evt_checkout_event_${createdEventOptions.length}`,
        organization_id: options.organizationId,
        user_id: options.userId,
        level: options.level,
        type: options.type,
        message: options.message,
        metadata: options.metadata,
        created_at: now,
      };
      data.system_events.push(event);
      return event;
    },
  };
  const checkoutServer = createApp({
    env: {
      APP_ENCRYPTION_SECRET: "test-encryption-secret-with-enough-length",
      SESSION_SECRET: "test-session-secret-with-enough-length",
      AI_PROXY_MODE: "mock",
      PAYMENT_CHECKOUT_MODE: "disabled",
    },
    store,
  });
  await new Promise((resolve) => checkoutServer.listen(0, "127.0.0.1", resolve));
  const address = checkoutServer.address();
  const checkoutBaseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetch(`${checkoutBaseUrl}/api/billing/checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `mowen_session=${encodeURIComponent(token)}`,
      },
      body: JSON.stringify({ plan: "pro" }),
    });
    const body = await response.json();

    assert.equal(response.status, 503, JSON.stringify(body));
    assert.equal(writeCalled, false);
    const checkoutEvent = createdEventOptions.find((item) => item.type === "billing.checkout.not_configured");
    const requestEvent = createdEventOptions.find((item) => item.type === "http.request.failed");
    assert.equal(checkoutEvent.organizationId, "org_checkout_event");
    assert.equal(checkoutEvent.userId, "usr_checkout_event");
    assert.deepEqual(checkoutEvent.metadata, { plan: "pro" });
    assert.equal(requestEvent.organizationId, "org_checkout_event");
    assert.equal(requestEvent.metadata.status, 503);
  } finally {
    await new Promise((resolve) => checkoutServer.close(resolve));
  }
});

test("ops triage uses repository hook for AI usage when available", async () => {
  const now = new Date().toISOString();
  const token = `ops-repo-${crypto.randomUUID()}`;
  const data = normalizeData({
    users: [{
      id: "usr_ops_repo",
      email: "ops-repo@example.com",
      name: "Ops Repo",
      password_hash: "unused",
      email_verified_at: now,
      created_at: now,
      updated_at: now,
    }],
    organizations: [{
      id: "org_ops_repo",
      name: "Ops Repo Org",
      slug: "ops-repo-org",
      plan: "free",
      created_by: "usr_ops_repo",
      created_at: now,
      updated_at: now,
    }],
    memberships: [{
      id: "mem_ops_repo",
      organization_id: "org_ops_repo",
      user_id: "usr_ops_repo",
      role: "admin",
      created_at: now,
    }],
    sessions: [{
      id: "ses_ops_repo",
      user_id: "usr_ops_repo",
      token_hash: sha256(token),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      created_at: now,
    }],
    ai_usage: [{
      id: "use_ops_repo_failed",
      organization_id: "org_ops_repo",
      user_id: "usr_ops_repo",
      provider: "openai-compatible",
      model: "gpt-test",
      task_type: "draft",
      prompt_tokens: 12,
      completion_tokens: 0,
      total_tokens: 12,
      estimated_cost: 0.01,
      status: "failed",
      error: "provider timeout",
      created_at: now,
    }],
  });
  let writeCalled = false;
  let savedTriageOptions = null;
  const store = {
    async init() {},
    async read() {
      return data;
    },
    async write(mutator) {
      writeCalled = true;
      return mutator(data);
    },
    async saveOpsTriage(options) {
      savedTriageOptions = options;
      const record = {
        id: "tri_ops_repo",
        organization_id: options.organizationId,
        source_type: options.sourceType,
        source_id: options.sourceId,
        metadata: options.metadata,
        updated_by: options.userId,
        created_at: now,
        updated_at: now,
      };
      data.ops_triage.push(record);
      data.audit_logs.push({
        id: "aud_ops_repo",
        organization_id: options.organizationId,
        user_id: options.userId,
        action: "ops.error.triage",
        target_type: options.sourceType,
        target_id: options.sourceId,
        metadata: { triage_status: options.metadata.triage_status },
        created_at: now,
      });
      return record;
    },
  };
  const opsServer = createApp({
    env: {
      APP_ENCRYPTION_SECRET: "test-encryption-secret-with-enough-length",
      SESSION_SECRET: "test-session-secret-with-enough-length",
      AI_PROXY_MODE: "mock",
    },
    store,
  });
  await new Promise((resolve) => opsServer.listen(0, "127.0.0.1", resolve));
  const address = opsServer.address();
  const opsBaseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetch(`${opsBaseUrl}/api/ops/events/use_ops_repo_failed/triage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `mowen_session=${encodeURIComponent(token)}`,
      },
      body: JSON.stringify({
        status: "processing",
        priority: "high",
        assignee: "ops@example.com",
        note: "repository path",
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(writeCalled, false);
    assert.equal(savedTriageOptions.organizationId, "org_ops_repo");
    assert.equal(savedTriageOptions.sourceType, "ai_usage");
    assert.equal(savedTriageOptions.sourceId, "use_ops_repo_failed");
    assert.equal(body.event.source_type, "ai_usage");
    assert.equal(body.event.metadata.triage_status, "processing");
    assert.equal(body.event.metadata.assignee, "ops@example.com");
    assert.equal(data.ops_triage.length, 1);
    assert.equal(data.audit_logs[0].target_type, "ai_usage");
  } finally {
    await new Promise((resolve) => opsServer.close(resolve));
  }
});

test("ops triage uses repository hook for system events when available", async () => {
  const now = new Date().toISOString();
  const token = `ops-system-repo-${crypto.randomUUID()}`;
  const data = normalizeData({
    users: [{
      id: "usr_ops_system_repo",
      email: "ops-system-repo@example.com",
      name: "Ops System Repo",
      password_hash: "unused",
      email_verified_at: now,
      created_at: now,
      updated_at: now,
    }],
    organizations: [{
      id: "org_ops_system_repo",
      name: "Ops System Repo Org",
      slug: "ops-system-repo-org",
      plan: "free",
      created_by: "usr_ops_system_repo",
      created_at: now,
      updated_at: now,
    }],
    memberships: [{
      id: "mem_ops_system_repo",
      organization_id: "org_ops_system_repo",
      user_id: "usr_ops_system_repo",
      role: "admin",
      created_at: now,
    }],
    sessions: [{
      id: "ses_ops_system_repo",
      user_id: "usr_ops_system_repo",
      token_hash: sha256(token),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      created_at: now,
    }],
    system_events: [{
      id: "evt_ops_system_repo_warning",
      organization_id: "org_ops_system_repo",
      user_id: "usr_ops_system_repo",
      level: "warn",
      type: "billing.warning",
      message: "repository system event",
      metadata: {},
      created_at: now,
    }],
  });
  let writeCalled = false;
  let savedSystemEventOptions = null;
  const store = {
    async init() {},
    async read() {
      return data;
    },
    async write(mutator) {
      writeCalled = true;
      return mutator(data);
    },
    async saveSystemEventTriage(options) {
      savedSystemEventOptions = options;
      const event = data.system_events.find((item) =>
        item.organization_id === options.organizationId &&
        item.id === options.eventId);
      event.metadata = options.metadata;
      data.audit_logs.push({
        id: "aud_ops_system_repo",
        organization_id: options.organizationId,
        user_id: options.userId,
        action: "ops.error.triage",
        target_type: "system_event",
        target_id: options.eventId,
        metadata: { triage_status: options.metadata.triage_status },
        created_at: now,
      });
      return event;
    },
  };
  const opsServer = createApp({
    env: {
      APP_ENCRYPTION_SECRET: "test-encryption-secret-with-enough-length",
      SESSION_SECRET: "test-session-secret-with-enough-length",
      AI_PROXY_MODE: "mock",
    },
    store,
  });
  await new Promise((resolve) => opsServer.listen(0, "127.0.0.1", resolve));
  const address = opsServer.address();
  const opsBaseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetch(`${opsBaseUrl}/api/ops/events/evt_ops_system_repo_warning/triage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `mowen_session=${encodeURIComponent(token)}`,
      },
      body: JSON.stringify({
        status: "processing",
        priority: "urgent",
        assignee: "ops-system@example.com",
        note: "system repository path",
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(writeCalled, false);
    assert.equal(savedSystemEventOptions.organizationId, "org_ops_system_repo");
    assert.equal(savedSystemEventOptions.eventId, "evt_ops_system_repo_warning");
    assert.equal(body.event.source_type, "system_event");
    assert.equal(body.event.metadata.triage_status, "processing");
    assert.equal(body.event.metadata.assignee, "ops-system@example.com");
    assert.equal(data.audit_logs[0].target_type, "system_event");
  } finally {
    await new Promise((resolve) => opsServer.close(resolve));
  }
});

test("feedback APIs use repository hooks when available", async () => {
  const now = new Date().toISOString();
  const token = `feedback-repo-${crypto.randomUUID()}`;
  const data = normalizeData({
    users: [{
      id: "usr_feedback_repo",
      email: "feedback-repo@example.com",
      name: "Feedback Repo",
      password_hash: "unused",
      email_verified_at: now,
      created_at: now,
      updated_at: now,
    }],
    organizations: [{
      id: "org_feedback_repo",
      name: "Feedback Repo Org",
      slug: "feedback-repo-org",
      plan: "free",
      created_by: "usr_feedback_repo",
      created_at: now,
      updated_at: now,
    }],
    memberships: [{
      id: "mem_feedback_repo",
      organization_id: "org_feedback_repo",
      user_id: "usr_feedback_repo",
      role: "admin",
      created_at: now,
    }],
    sessions: [{
      id: "ses_feedback_repo",
      user_id: "usr_feedback_repo",
      token_hash: sha256(token),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      created_at: now,
    }],
  });
  let writeCalled = false;
  const hookCalls = [];
  const store = {
    async init() {},
    async read() {
      return data;
    },
    async write(mutator) {
      writeCalled = true;
      return mutator(data);
    },
    async createFeedback(options) {
      hookCalls.push(["create", options]);
      const event = {
        id: data.system_events.length ? "evt_feedback_repo_2" : "evt_feedback_repo_1",
        organization_id: options.organizationId,
        user_id: options.userId,
        level: "info",
        type: "user.feedback",
        message: options.message.slice(0, 4000),
        metadata: { source: options.source },
        created_at: now,
      };
      data.system_events.push(event);
      return event;
    },
    async updateFeedbackStatus(options) {
      hookCalls.push(["update", options]);
      const event = data.system_events.find((item) => item.id === options.feedbackId);
      event.metadata = {
        ...(event.metadata || {}),
        status: options.status,
        ...(options.metadataPatch || {}),
        handled_by: options.userId,
        handled_at: now,
      };
      data.audit_logs.push({
        id: "aud_feedback_repo_update",
        organization_id: options.organizationId,
        user_id: options.userId,
        action: "feedback.status.update",
        target_type: "feedback",
        target_id: options.feedbackId,
        metadata: { status: options.status },
        created_at: now,
      });
      return event;
    },
    async updateFeedbackBatchStatus(options) {
      hookCalls.push(["batch", options]);
      const feedbacks = data.system_events.filter((item) => options.feedbackIds.includes(item.id));
      feedbacks.forEach((event) => {
        event.metadata = {
          ...(event.metadata || {}),
          status: options.status,
          ...(options.metadataPatch || {}),
          handled_by: options.userId,
          handled_at: now,
        };
      });
      data.audit_logs.push({
        id: "aud_feedback_repo_batch",
        organization_id: options.organizationId,
        user_id: options.userId,
        action: "feedback.status.batch_update",
        target_type: "feedback",
        target_id: "batch",
        metadata: { status: options.status, count: feedbacks.length },
        created_at: now,
      });
      return feedbacks;
    },
  };
  const feedbackServer = createApp({
    env: {
      APP_ENCRYPTION_SECRET: "test-encryption-secret-with-enough-length",
      SESSION_SECRET: "test-session-secret-with-enough-length",
      AI_PROXY_MODE: "mock",
    },
    store,
  });
  await new Promise((resolve) => feedbackServer.listen(0, "127.0.0.1", resolve));
  const address = feedbackServer.address();
  const feedbackBaseUrl = `http://127.0.0.1:${address.port}`;
  const headers = {
    "Content-Type": "application/json",
    Cookie: `mowen_session=${encodeURIComponent(token)}`,
  };
  try {
    const created = await fetch(`${feedbackBaseUrl}/api/feedback`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message: "需要批量导出", source: "admin_panel" }),
    });
    const createdBody = await created.json();
    assert.equal(created.status, 201, JSON.stringify(createdBody));
    assert.equal(data.system_events.length, 1);

    const updated = await fetch(`${feedbackBaseUrl}/api/feedback/${data.system_events[0].id}/status`, {
      method: "POST",
      headers,
      body: JSON.stringify({ status: "processing", assignee: "ops@example.com", sla_at: "2026-05-30" }),
    });
    const updatedBody = await updated.json();
    assert.equal(updated.status, 200, JSON.stringify(updatedBody));
    assert.equal(updatedBody.feedback.metadata.status, "processing");
    assert.equal(updatedBody.feedback.metadata.assignee, "ops@example.com");

    await store.createFeedback({
      organizationId: "org_feedback_repo",
      userId: "usr_feedback_repo",
      message: "第二条反馈",
      source: "admin_panel",
    });
    const batched = await fetch(`${feedbackBaseUrl}/api/feedback/batch-status`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        feedback_ids: data.system_events.map((item) => item.id),
        status: "resolved",
        note: "统一处理",
      }),
    });
    const batchedBody = await batched.json();
    assert.equal(batched.status, 200, JSON.stringify(batchedBody));
    assert.equal(batchedBody.count, 2);
    assert.ok(batchedBody.feedbacks.every((item) => item.metadata.status === "resolved"));

    assert.equal(writeCalled, false);
    assert.deepEqual(hookCalls.map((item) => item[0]), ["create", "update", "create", "batch"]);
    assert.equal(hookCalls[0][1].organizationId, "org_feedback_repo");
    assert.equal(hookCalls[1][1].feedbackId, "evt_feedback_repo_1");
    assert.deepEqual(hookCalls[3][1].feedbackIds, ["evt_feedback_repo_1", "evt_feedback_repo_2"]);
    assert.ok(data.audit_logs.some((item) => item.action === "feedback.status.batch_update"));
  } finally {
    await new Promise((resolve) => feedbackServer.close(resolve));
  }
});

test("writer APIs use repository hooks when available", async () => {
  const now = new Date().toISOString();
  const token = `writer-repo-${crypto.randomUUID()}`;
  const data = normalizeData({
    users: [{
      id: "usr_writer_repo",
      email: "writer-repo@example.com",
      name: "Writer Repo",
      password_hash: "unused",
      email_verified_at: now,
      created_at: now,
      updated_at: now,
    }],
    organizations: [{
      id: "org_writer_repo",
      name: "Writer Repo Org",
      slug: "writer-repo-org",
      plan: "free",
      created_by: "usr_writer_repo",
      created_at: now,
      updated_at: now,
    }],
    memberships: [{
      id: "mem_writer_repo",
      organization_id: "org_writer_repo",
      user_id: "usr_writer_repo",
      role: "admin",
      created_at: now,
    }],
    sessions: [{
      id: "ses_writer_repo",
      user_id: "usr_writer_repo",
      token_hash: sha256(token),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      created_at: now,
    }],
  });
  let writeCalled = false;
  const calls = [];
  let writer = {
    id: "wrt_repo",
    organization_id: "org_writer_repo",
    owner_id: "usr_writer_repo",
    name: "仓储执笔人",
    handle: "repo_writer",
    category: "公文写作",
    description: "",
    enabled: true,
    summary_md: "v1",
    skill_json: {},
    quality_report: {},
    version: 1,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  const store = {
    async init() {},
    async read() {
      return data;
    },
    async write(mutator) {
      writeCalled = true;
      return mutator(data);
    },
    async listWriterProfiles(options) {
      calls.push(["list", options]);
      return [writer];
    },
    async getWriterProfile(options) {
      calls.push(["get", options]);
      return writer;
    },
    async createWriterProfile(options) {
      calls.push(["create", options]);
      writer = { ...writer, ...options.draft, organization_id: options.organizationId, owner_id: options.userId };
      return writer;
    },
    async updateWriterProfile(options) {
      calls.push(["update", options]);
      writer = { ...writer, ...options.draft, version: 2, updated_at: now };
      return writer;
    },
    async deleteWriterProfile(options) {
      calls.push(["delete", options]);
      writer = { ...writer, deleted_at: now };
      return writer;
    },
    async listWriterVersions(options) {
      calls.push(["versions", options]);
      return [{ id: "ver_repo_1", writer_profile_id: options.writerId, version: 1, summary_md: "v1", skill_json: {}, quality_report: {}, created_by: "usr_writer_repo", created_at: now }];
    },
    async restoreWriterVersion(options) {
      calls.push(["restore", options]);
      writer = { ...writer, summary_md: "restored", version: 3, deleted_at: null };
      return writer;
    },
  };
  const writerServer = createApp({
    env: {
      APP_ENCRYPTION_SECRET: "test-encryption-secret-with-enough-length",
      SESSION_SECRET: "test-session-secret-with-enough-length",
      AI_PROXY_MODE: "mock",
    },
    store,
  });
  await new Promise((resolve) => writerServer.listen(0, "127.0.0.1", resolve));
  const address = writerServer.address();
  const writerBaseUrl = `http://127.0.0.1:${address.port}`;
  const headers = {
    "Content-Type": "application/json",
    Cookie: `mowen_session=${encodeURIComponent(token)}`,
  };
  try {
    const created = await fetch(`${writerBaseUrl}/api/writers`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "新执笔人", handle: "new_writer", summary_md: "v1" }),
    });
    const createdBody = await created.json();
    assert.equal(created.status, 201, JSON.stringify(createdBody));
    assert.equal(createdBody.writer.handle, "new_writer");

    const listed = await fetch(`${writerBaseUrl}/api/writers`, { headers });
    const listedBody = await listed.json();
    assert.equal(listed.status, 200, JSON.stringify(listedBody));
    assert.equal(listedBody.writers.length, 1);

    const updated = await fetch(`${writerBaseUrl}/api/writers/${writer.id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ summary_md: "v2", expected_version: 1 }),
    });
    const updatedBody = await updated.json();
    assert.equal(updated.status, 200, JSON.stringify(updatedBody));
    assert.equal(updatedBody.writer.version, 2);

    const versions = await fetch(`${writerBaseUrl}/api/writers/${writer.id}/versions`, { headers });
    const versionsBody = await versions.json();
    assert.equal(versions.status, 200, JSON.stringify(versionsBody));
    assert.equal(versionsBody.versions[0].id, "ver_repo_1");

    const restored = await fetch(`${writerBaseUrl}/api/writers/${writer.id}/versions/ver_repo_1/restore`, {
      method: "POST",
      headers,
    });
    const restoredBody = await restored.json();
    assert.equal(restored.status, 200, JSON.stringify(restoredBody));
    assert.equal(restoredBody.writer.summary_md, "restored");

    const deleted = await fetch(`${writerBaseUrl}/api/writers/${writer.id}`, {
      method: "DELETE",
      headers,
    });
    const deletedBody = await deleted.json();
    assert.equal(deleted.status, 200, JSON.stringify(deletedBody));
    assert.ok(deletedBody.writer.deleted_at);

    assert.equal(writeCalled, false);
    assert.deepEqual(calls.map((item) => item[0]), ["create", "list", "get", "update", "versions", "restore", "delete"]);
    assert.equal(calls[0][1].organizationId, "org_writer_repo");
    assert.equal(calls[2][1].writerId, "wrt_repo");
    assert.equal(calls[3][1].expectedVersion, 1);
  } finally {
    await new Promise((resolve) => writerServer.close(resolve));
  }
});

test("AI chat usage uses repository hook when available", async () => {
  const now = new Date().toISOString();
  const token = `usage-repo-${crypto.randomUUID()}`;
  const data = normalizeData({
    users: [{
      id: "usr_usage_repo",
      email: "usage-repo@example.com",
      name: "Usage Repo",
      password_hash: "unused",
      email_verified_at: now,
      created_at: now,
      updated_at: now,
    }],
    organizations: [{
      id: "org_usage_repo",
      name: "Usage Repo Org",
      slug: "usage-repo-org",
      plan: "free",
      created_by: "usr_usage_repo",
      created_at: now,
      updated_at: now,
    }],
    memberships: [{
      id: "mem_usage_repo",
      organization_id: "org_usage_repo",
      user_id: "usr_usage_repo",
      role: "admin",
      created_at: now,
    }],
    sessions: [{
      id: "ses_usage_repo",
      user_id: "usr_usage_repo",
      token_hash: sha256(token),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      created_at: now,
    }],
  });
  let writeCount = 0;
  let recordedUsageOptions = null;
  const store = {
    async init() {},
    async read() {
      return data;
    },
    async write(mutator) {
      writeCount += 1;
      return mutator(data);
    },
    async recordAiUsage(options) {
      recordedUsageOptions = options;
      const record = options.usage;
      data.ai_usage.push(record);
      data.audit_logs.push({
        id: "aud_usage_repo",
        organization_id: record.organization_id,
        user_id: record.user_id,
        action: "ai.chat",
        target_type: "ai_usage",
        target_id: record.id,
        metadata: {
          provider: record.provider,
          model: record.model,
          status: record.status,
          task_type: record.task_type,
        },
        created_at: record.created_at,
      });
      return record;
    },
  };
  const usageServer = createApp({
    env: {
      APP_ENCRYPTION_SECRET: "test-encryption-secret-with-enough-length",
      SESSION_SECRET: "test-session-secret-with-enough-length",
      AI_PROXY_MODE: "mock",
      AI_COST_RATES: JSON.stringify({ default: { prompt_per_1k: 0.01, completion_per_1k: 0.02 } }),
    },
    store,
  });
  await new Promise((resolve) => usageServer.listen(0, "127.0.0.1", resolve));
  const address = usageServer.address();
  const usageBaseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetch(`${usageBaseUrl}/api/ai/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `mowen_session=${encodeURIComponent(token)}`,
      },
      body: JSON.stringify({
        task_type: "draft",
        messages: [{ role: "user", content: "hello repository usage" }],
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(writeCount, 1);
    assert.equal(data.rate_limits.length, 1);
    assert.equal(data.ai_usage.length, 1);
    assert.equal(data.audit_logs.length, 1);
    assert.equal(recordedUsageOptions.usage.organization_id, "org_usage_repo");
    assert.equal(recordedUsageOptions.usage.user_id, "usr_usage_repo");
    assert.equal(recordedUsageOptions.usage.task_type, "draft");
    assert.equal(recordedUsageOptions.usage.status, "success");
    assert.equal(body.usage.id, recordedUsageOptions.usage.id);
    assert.ok(recordedUsageOptions.usage.estimated_cost > 0);
  } finally {
    await new Promise((resolve) => usageServer.close(resolve));
  }
});

test("AI overage credit spend uses repository hook when available", async () => {
  const now = new Date().toISOString();
  const token = `credit-spend-repo-${crypto.randomUUID()}`;
  const data = normalizeData({
    users: [{
      id: "usr_credit_repo",
      email: "credit-repo@example.com",
      name: "Credit Repo",
      password_hash: "unused",
      email_verified_at: now,
      created_at: now,
      updated_at: now,
    }],
    organizations: [{
      id: "org_credit_repo",
      name: "Credit Repo Org",
      slug: "credit-repo-org",
      plan: "free",
      created_by: "usr_credit_repo",
      created_at: now,
      updated_at: now,
    }],
    memberships: [{
      id: "mem_credit_repo",
      organization_id: "org_credit_repo",
      user_id: "usr_credit_repo",
      role: "admin",
      created_at: now,
    }],
    sessions: [{
      id: "ses_credit_repo",
      user_id: "usr_credit_repo",
      token_hash: sha256(token),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      created_at: now,
    }],
    ai_usage: [{
      id: "use_existing_limit",
      organization_id: "org_credit_repo",
      user_id: "usr_credit_repo",
      provider: "mock",
      model: "mock",
      task_type: "draft",
      prompt_tokens: 1,
      completion_tokens: 0,
      total_tokens: 1,
      estimated_cost: 0,
      status: "success",
      error: "",
      created_at: now,
    }],
    credit_accounts: [{
      id: "crd_credit_repo",
      organization_id: "org_credit_repo",
      user_id: "usr_credit_repo",
      balance: 2,
      updated_at: now,
    }],
  });
  let writeCount = 0;
  let recordedUsageOptions = null;
  let spendOptions = null;
  const store = {
    async init() {},
    async read() {
      return data;
    },
    async write(mutator) {
      writeCount += 1;
      return mutator(data);
    },
    async recordAiUsage(options) {
      recordedUsageOptions = options;
      data.ai_usage.push(options.usage);
      data.audit_logs.push({
        id: "aud_credit_usage",
        organization_id: options.usage.organization_id,
        user_id: options.usage.user_id,
        action: "ai.chat",
        target_type: "ai_usage",
        target_id: options.usage.id,
        metadata: { status: options.usage.status },
        created_at: options.usage.created_at,
      });
      return options.usage;
    },
    async spendCreditsForUsage(options) {
      spendOptions = options;
      const account = data.credit_accounts.find((item) => item.organization_id === options.organizationId && item.user_id === options.userId);
      account.balance -= Number(options.amount || 1);
      account.updated_at = now;
      data.credit_ledger.push({
        id: "led_credit_spend",
        organization_id: options.organizationId,
        user_id: options.userId,
        order_id: null,
        usage_id: options.usageId,
        direction: "out",
        amount: Number(options.amount || 1),
        balance_after: account.balance,
        reason: "ai_quota_overage",
        created_at: now,
      });
      data.audit_logs.push({
        id: "aud_credit_spend",
        organization_id: options.organizationId,
        user_id: options.userId,
        action: "billing.credit.spend",
        target_type: "ai_usage",
        target_id: options.usageId,
        metadata: { amount: Number(options.amount || 1), balance_after: account.balance },
        created_at: now,
      });
      return account;
    },
  };
  const creditServer = createApp({
    env: {
      APP_ENCRYPTION_SECRET: "test-encryption-secret-with-enough-length",
      SESSION_SECRET: "test-session-secret-with-enough-length",
      AI_PROXY_MODE: "mock",
      DAILY_USER_REQUEST_LIMIT: "1",
      DAILY_ORG_REQUEST_LIMIT: "10",
    },
    store,
  });
  await new Promise((resolve) => creditServer.listen(0, "127.0.0.1", resolve));
  const address = creditServer.address();
  const creditBaseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetch(`${creditBaseUrl}/api/ai/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `mowen_session=${encodeURIComponent(token)}`,
      },
      body: JSON.stringify({
        task_type: "draft",
        messages: [{ role: "user", content: "hello credit spend" }],
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(writeCount, 1);
    assert.equal(data.rate_limits.length, 1);
    assert.equal(recordedUsageOptions.usage.id, body.usage.id);
    assert.equal(spendOptions.organizationId, "org_credit_repo");
    assert.equal(spendOptions.userId, "usr_credit_repo");
    assert.equal(spendOptions.usageId, body.usage.id);
    assert.equal(spendOptions.amount, 1);
    assert.equal(data.credit_accounts[0].balance, 1);
    assert.equal(data.credit_ledger[0].usage_id, body.usage.id);
    assert.ok(data.audit_logs.some((item) => item.action === "billing.credit.spend"));
  } finally {
    await new Promise((resolve) => creditServer.close(resolve));
  }
});

test("manual payment APIs use repository hooks when available", async () => {
  const now = new Date().toISOString();
  const token = `manual-payment-repo-${crypto.randomUUID()}`;
  const data = normalizeData({
    users: [{
      id: "usr_manual_repo",
      email: "manual-repo@example.com",
      name: "Manual Repo",
      password_hash: "unused",
      email_verified_at: now,
      created_at: now,
      updated_at: now,
    }],
    organizations: [{
      id: "org_manual_repo",
      name: "Manual Repo Org",
      slug: "manual-repo-org",
      plan: "free",
      created_by: "usr_manual_repo",
      created_at: now,
      updated_at: now,
    }],
    memberships: [{
      id: "mem_manual_repo",
      organization_id: "org_manual_repo",
      user_id: "usr_manual_repo",
      role: "admin",
      created_at: now,
    }],
    sessions: [{
      id: "ses_manual_repo",
      user_id: "usr_manual_repo",
      token_hash: sha256(token),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      created_at: now,
    }],
  });
  let writeCount = 0;
  const hookCalls = [];
  const store = {
    async init() {},
    async read() {
      return data;
    },
    async write(mutator) {
      writeCount += 1;
      return mutator(data);
    },
    async createManualPaymentOrder(options) {
      hookCalls.push(["create", options]);
      const order = {
        id: "mop_repo",
        organization_id: options.organizationId,
        user_id: options.userId,
        package_id: options.paymentPackage.id,
        package_type: options.paymentPackage.type,
        title: options.paymentPackage.title,
        amount_cny: options.paymentPackage.amount_cny,
        credits: options.paymentPackage.credits,
        plan: options.paymentPackage.plan,
        duration_days: options.paymentPackage.duration_days,
        payment_channel: options.paymentChannel,
        payer_note: options.payerNote,
        proof_text: options.proofText,
        status: "pending",
        reviewed_by: null,
        reviewed_at: null,
        review_note: "",
        created_at: now,
        updated_at: now,
      };
      data.manual_payment_orders.push(order);
      data.audit_logs.push({
        id: "aud_manual_create",
        organization_id: options.organizationId,
        user_id: options.userId,
        action: "billing.manual_order.create",
        target_type: "manual_payment_order",
        target_id: order.id,
        metadata: { proof_submitted: true },
        created_at: now,
      });
      data.system_events.push({
        id: "evt_manual_pending",
        organization_id: options.organizationId,
        user_id: options.userId,
        level: "info",
        type: "billing.manual_order.pending",
        message: "pending",
        metadata: { order_id: order.id },
        created_at: now,
      });
      return order;
    },
    async reviewManualPaymentOrder(options) {
      hookCalls.push(["review", options]);
      const order = data.manual_payment_orders.find((item) => item.id === options.orderId);
      order.status = options.approved ? "approved" : "rejected";
      order.reviewed_by = options.userId;
      order.reviewed_at = now;
      order.review_note = options.reviewNote;
      order.updated_at = now;
      const creditAccount = {
        id: "crd_manual_repo",
        organization_id: options.organizationId,
        user_id: order.user_id,
        balance: Number(order.credits || 0),
        updated_at: now,
      };
      data.credit_accounts.push(creditAccount);
      data.credit_ledger.push({
        id: "led_manual_repo",
        organization_id: options.organizationId,
        user_id: order.user_id,
        order_id: order.id,
        usage_id: null,
        direction: "in",
        amount: Number(order.credits || 0),
        balance_after: creditAccount.balance,
        reason: "manual_payment_approved",
        created_at: now,
      });
      data.audit_logs.push({
        id: "aud_manual_review",
        organization_id: options.organizationId,
        user_id: options.userId,
        action: "billing.manual_order.approve",
        target_type: "manual_payment_order",
        target_id: order.id,
        metadata: { review_note: options.reviewNote },
        created_at: now,
      });
      data.system_events.push({
        id: "evt_manual_approved",
        organization_id: options.organizationId,
        user_id: order.user_id,
        level: "info",
        type: "billing.manual_order.approved",
        message: "approved",
        metadata: { order_id: order.id },
        created_at: now,
      });
      return { order, creditAccount, planOrganization: null };
    },
  };
  const manualServer = createApp({
    env: {
      APP_ENCRYPTION_SECRET: "test-encryption-secret-with-enough-length",
      SESSION_SECRET: "test-session-secret-with-enough-length",
      AI_PROXY_MODE: "mock",
    },
    store,
  });
  await new Promise((resolve) => manualServer.listen(0, "127.0.0.1", resolve));
  const address = manualServer.address();
  const manualBaseUrl = `http://127.0.0.1:${address.port}`;
  const headers = {
    "Content-Type": "application/json",
    Cookie: `mowen_session=${encodeURIComponent(token)}`,
  };
  try {
    const created = await fetch(`${manualBaseUrl}/api/billing/manual-orders`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        package_id: "credits_1000",
        payment_channel: "wechat",
        payer_note: "尾号 1234",
        proof_text: "已付款",
      }),
    });
    const createdBody = await created.json();
    assert.equal(created.status, 201, JSON.stringify(createdBody));
    assert.equal(createdBody.order.status, "pending");

    const reviewed = await fetch(`${manualBaseUrl}/api/billing/manual-orders/${createdBody.order.id}/review`, {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "approve", review_note: "repository path" }),
    });
    const reviewedBody = await reviewed.json();
    assert.equal(reviewed.status, 200, JSON.stringify(reviewedBody));
    assert.equal(reviewedBody.order.status, "approved");
    assert.equal(reviewedBody.credits.balance, 1000);
    assert.ok(reviewedBody.credit_ledger.some((item) => item.order_id === createdBody.order.id && item.direction === "in"));

    assert.equal(writeCount, 0);
    assert.deepEqual(hookCalls.map((item) => item[0]), ["create", "review"]);
    assert.equal(hookCalls[0][1].organizationId, "org_manual_repo");
    assert.equal(hookCalls[0][1].userId, "usr_manual_repo");
    assert.equal(hookCalls[1][1].approved, true);
    assert.ok(data.audit_logs.some((item) => item.action === "billing.manual_order.approve"));
    assert.ok(data.system_events.some((item) => item.type === "billing.manual_order.approved"));
  } finally {
    await new Promise((resolve) => manualServer.close(resolve));
  }
});

async function register(email, options = {}) {
  const response = await api("/api/auth/register", {
    method: "POST",
    body: { email, password: "password123", name: "Tester" },
  });
  assert.equal(response.status, 201, JSON.stringify(response.json));
  if (options.verify !== false && response.json.email_verification_token) {
    const verified = await api("/api/auth/verify-email", {
      method: "POST",
      cookie: response.cookie,
      body: { email, token: response.json.email_verification_token },
    });
    assert.equal(verified.status, 200, JSON.stringify(verified.json));
  }
  return {
    cookie: response.cookie,
    orgId: response.json.active_organization.id,
    userId: response.json.user.id,
  };
}

async function api(pathname, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const cookie = response.headers.get("set-cookie") || options.cookie || "";
  return {
    status: response.status,
    headers: response.headers,
    cookie,
    json: text ? JSON.parse(text) : null,
  };
}
