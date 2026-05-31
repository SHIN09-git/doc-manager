import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createServer as createHttpServer } from "node:http";
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
  const receiver = createHttpServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    emails.push(JSON.parse(body));
    response.writeHead(202, { "Content-Type": "application/json" });
    response.end("{}");
  });
  await new Promise((resolve) => receiver.listen(0, "127.0.0.1", resolve));
  const receiverUrl = `http://127.0.0.1:${receiver.address().port}`;
  const temp = await mkdtemp(path.join(os.tmpdir(), "mowen-email-api-"));
  const emailServer = createApp({
    env: {
      NODE_ENV: "production",
      DATA_DIR: temp,
      APP_ENCRYPTION_SECRET: "production-encryption-secret-with-enough-length",
      SESSION_SECRET: "production-session-secret-with-enough-length",
      CORS_ORIGIN: "http://127.0.0.1:4173",
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
    await new Promise((resolve) => emailServer.close(resolve));
    await new Promise((resolve) => receiver.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
});

test("production email mode can send through Resend adapter", async () => {
  const emails = [];
  const receiver = createHttpServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    emails.push({ headers: request.headers, body: JSON.parse(body) });
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ id: "resend_email_123" }));
  });
  await new Promise((resolve) => receiver.listen(0, "127.0.0.1", resolve));
  const receiverUrl = `http://127.0.0.1:${receiver.address().port}`;
  const temp = await mkdtemp(path.join(os.tmpdir(), "mowen-resend-api-"));
  const emailServer = createApp({
    env: {
      NODE_ENV: "production",
      DATA_DIR: temp,
      APP_ENCRYPTION_SECRET: "production-encryption-secret-with-enough-length",
      SESSION_SECRET: "production-session-secret-with-enough-length",
      CORS_ORIGIN: "http://127.0.0.1:4173",
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
    await new Promise((resolve) => emailServer.close(resolve));
    await new Promise((resolve) => receiver.close(resolve));
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
    cookie,
    json: text ? JSON.parse(text) : null,
  };
}
