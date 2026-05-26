import { createServer } from "node:http";
import { loadEnv } from "./config/env.js";
import { createStore } from "./db/storeFactory.js";
import { normalizeAuditFiltersFromUrl } from "./db/repositories/auditRepository.js";
import { normalizeDocumentListFiltersFromUrl } from "./db/repositories/documentRepository.js";
import { normalizeUsageFiltersFromUrl } from "./db/repositories/usageRepository.js";
import {
  createId,
  decryptSecret,
  encryptSecret,
  hashPassword,
  hmacSha256,
  randomToken,
  secretHint,
  sha256,
  timingSafeEqual,
  verifyPassword,
} from "./utils/crypto.js";
import {
  HttpError,
  clearSessionCookie,
  createSessionCookie,
  parseCookies,
  readJsonBody,
  readRawBody,
  sendJson,
  sendNoContent,
  setSecurityHeaders,
} from "./utils/http.js";

const SESSION_COOKIE = "mowen_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const EMAIL_TOKEN_TTL_MS = 1000 * 60 * 60 * 24;
const PASSWORD_RESET_TTL_MS = 1000 * 60 * 30;
const LOGIN_FAIL_WINDOW_MS = 1000 * 60 * 15;
const LOGIN_FAIL_LIMIT = 5;
const EMAIL_REQUEST_WINDOW_MS = 1000 * 60 * 10;
const EMAIL_REQUEST_LIMIT = 3;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ADMIN_ROLES = new Set(["owner", "admin"]);

export function createApp(options = {}) {
  const env = loadEnv(options.env || process.env);
  const store = options.store || createStore(env);

  const server = createServer(async (request, response) => {
    const startedAt = Date.now();
    setSecurityHeaders(response, env);
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Organization-Id",
      });
      response.end();
      return;
    }

    let context = null;
    try {
      await store.init();
      const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
      context = {
        env,
        request,
        response,
        store,
        url,
        auth: await resolveAuth(request, store),
      };
      await route(context);
    } catch (error) {
      await recordRequestError(store, context, request, error).catch(() => null);
      handleError(response, error);
    } finally {
      logRequest(env, request, response, startedAt);
    }
  });

  server.store = store;
  server.env = env;
  return server;
}

async function route(ctx) {
  const { request, response, url } = ctx;
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "GET" && path === "/api/health") {
    sendJson(response, 200, { ok: true, service: "mowen-commercial-api", time: new Date().toISOString() });
    return;
  }
  if (request.method === "GET" && path === "/api/ready") return readiness(ctx);

  if (request.method === "POST" && path === "/api/auth/register") return register(ctx);
  if (request.method === "POST" && path === "/api/auth/login") return login(ctx);
  if (request.method === "POST" && path === "/api/auth/logout") return logout(ctx);
  if (request.method === "POST" && path === "/api/auth/request-email-verification") return requestEmailVerification(ctx);
  if (request.method === "POST" && path === "/api/auth/verify-email") return verifyEmail(ctx);
  if (request.method === "POST" && path === "/api/auth/request-password-reset") return requestPasswordReset(ctx);
  if (request.method === "POST" && path === "/api/auth/reset-password") return resetPassword(ctx);
  if (request.method === "POST" && path === "/api/webhooks/payments") return paymentWebhook(ctx);
  if (request.method === "POST" && path === "/api/webhooks/email") return emailWebhook(ctx);
  if (request.method === "GET" && path === "/api/me") return currentUser(ctx);

  requireAuth(ctx);

  if (request.method === "POST" && path === "/api/auth/logout-all") return logoutAll(ctx);
  if (request.method === "GET" && path === "/api/me/export") return exportOwnData(ctx);
  if (request.method === "DELETE" && path === "/api/me") return deleteOwnAccount(ctx);

  if (request.method === "GET" && path === "/api/orgs") return listOrganizations(ctx);
  if (request.method === "POST" && path === "/api/orgs") return createOrganization(ctx);
  if (request.method === "GET" && /^\/api\/orgs\/[^/]+\/members$/.test(path)) {
    const orgId = path.split("/")[3];
    return listOrganizationMembers(ctx, orgId);
  }
  if (/^\/api\/orgs\/[^/]+\/members\/[^/]+$/.test(path)) {
    const [, , , orgId, , memberId] = path.split("/");
    if (request.method === "PUT") return updateOrganizationMember(ctx, orgId, memberId);
    if (request.method === "DELETE") return removeOrganizationMember(ctx, orgId, memberId);
  }
  if (/^\/api\/orgs\/[^/]+\/invitations$/.test(path)) {
    const orgId = path.split("/")[3];
    if (request.method === "GET") return listOrganizationInvitations(ctx, orgId);
    if (request.method === "POST") return createOrganizationInvitation(ctx, orgId);
  }
  if (/^\/api\/orgs\/[^/]+\/invitations\/[^/]+\/(revoke|resend)$/.test(path)) {
    const [, , , orgId, , invitationId, action] = path.split("/");
    if (request.method === "POST" && action === "revoke") return revokeOrganizationInvitation(ctx, orgId, invitationId);
    if (request.method === "POST" && action === "resend") return resendOrganizationInvitation(ctx, orgId, invitationId);
  }
  if (request.method === "POST" && /^\/api\/orgs\/[^/]+\/invitations\/[^/]+\/accept$/.test(path)) {
    const [, , , orgId, , invitationId] = path.split("/");
    return acceptOrganizationInvitation(ctx, orgId, invitationId);
  }
  if (/^\/api\/orgs\/[^/]+$/.test(path)) {
    const orgId = path.split("/").at(-1);
    if (request.method === "GET") return getOrganization(ctx, orgId);
    if (request.method === "PUT") return updateOrganization(ctx, orgId);
  }
  if (request.method === "GET" && /^\/api\/orgs\/[^/]+\/export$/.test(path)) {
    return exportOrganizationData(ctx, path.split("/")[3]);
  }
  if (request.method === "POST" && /^\/api\/orgs\/[^/]+\/deletion-request$/.test(path)) {
    return requestOrganizationDeletion(ctx, path.split("/")[3]);
  }

  if (request.method === "GET" && path === "/api/documents") return listDocuments(ctx);
  if (request.method === "POST" && path === "/api/documents") return createDocument(ctx);
  if (/^\/api\/documents\/[^/]+$/.test(path)) {
    const id = path.split("/").at(-1);
    if (request.method === "GET") return getDocument(ctx, id);
    if (request.method === "PUT") return updateDocument(ctx, id);
    if (request.method === "DELETE") return deleteDocument(ctx, id);
  }

  if (request.method === "GET" && path === "/api/writers") return listWriters(ctx);
  if (request.method === "POST" && path === "/api/writers") return createWriter(ctx);
  if (/^\/api\/writers\/[^/]+\/versions\/[^/]+\/restore$/.test(path) && request.method === "POST") {
    const [, , , writerId, , versionId] = path.split("/");
    return restoreWriterVersion(ctx, writerId, versionId);
  }
  if (/^\/api\/writers\/[^/]+\/versions$/.test(path) && request.method === "GET") {
    const writerId = path.split("/")[3];
    return listWriterVersions(ctx, writerId);
  }
  if (/^\/api\/writers\/[^/]+$/.test(path)) {
    const id = path.split("/").at(-1);
    if (request.method === "GET") return getWriter(ctx, id);
    if (request.method === "PUT") return updateWriter(ctx, id);
    if (request.method === "DELETE") return deleteWriter(ctx, id);
  }

  if (request.method === "GET" && path === "/api/api-keys") return listApiKeys(ctx);
  if (request.method === "POST" && path === "/api/api-keys") return saveApiKey(ctx);
  if (request.method === "DELETE" && /^\/api\/api-keys\/[^/]+$/.test(path)) return deleteApiKey(ctx, path.split("/").at(-1));

  if (request.method === "POST" && path === "/api/ai/chat") return chatProxy(ctx);
  if (request.method === "GET" && path === "/api/usage/current") return currentUsage(ctx);
  if (request.method === "GET" && path === "/api/usage/history") return usageHistory(ctx);
  if (request.method === "GET" && path === "/api/billing/summary") return billingSummary(ctx);
  if (request.method === "POST" && path === "/api/billing/checkout") return createBillingCheckout(ctx);
  if (request.method === "GET" && path === "/api/billing/manual-orders") return listManualPaymentOrders(ctx);
  if (request.method === "POST" && path === "/api/billing/manual-orders") return createManualPaymentOrder(ctx);
  if (request.method === "POST" && /^\/api\/billing\/manual-orders\/[^/]+\/review$/.test(path)) {
    return reviewManualPaymentOrder(ctx, path.split("/")[4]);
  }
  if (request.method === "GET" && path === "/api/audit") return auditHistory(ctx);
  if (request.method === "GET" && path === "/api/ops/recent-errors") return recentErrors(ctx);
  if (request.method === "POST" && /^\/api\/ops\/events\/[^/]+\/triage$/.test(path)) return updateOpsEventTriage(ctx, path.split("/")[4]);
  if (request.method === "GET" && path === "/api/admin/dashboard") return adminDashboard(ctx);
  if (request.method === "GET" && path === "/api/admin/preferences") return getAdminPreferences(ctx);
  if (request.method === "PUT" && path === "/api/admin/preferences") return updateAdminPreferences(ctx);
  if (request.method === "DELETE" && path === "/api/admin/preferences") return deleteAdminPreferences(ctx);
  if (request.method === "POST" && path === "/api/feedback") return createFeedback(ctx);
  if (request.method === "POST" && path === "/api/feedback/batch-status") return updateFeedbackBatchStatus(ctx);
  if (request.method === "POST" && /^\/api\/feedback\/[^/]+\/status$/.test(path)) return updateFeedbackStatus(ctx, path.split("/")[3]);

  throw new HttpError(404, "接口不存在", "not_found");
}

async function readiness(ctx) {
  const details = {
    ok: true,
    service: "mowen-commercial-api",
    store_driver: ctx.env.storeDriver,
    node_env: ctx.env.nodeEnv,
    time: new Date().toISOString(),
  };
  if (typeof ctx.store.health === "function") {
    details.store = await ctx.store.health();
  }
  sendJson(ctx.response, 200, details);
}

async function register(ctx) {
  const body = await readJsonBody(ctx.request, ctx.env.maxJsonBodyBytes);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const name = String(body.name || "").trim() || email.split("@")[0];
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "请输入有效邮箱", "invalid_email");
  if (password.length < 8) throw new HttpError(400, "密码至少需要 8 位", "weak_password");

  const payload = await ctx.store.write((data) => {
    if (data.users.some((user) => user.email === email && !user.disabled_at)) {
      throw new HttpError(409, "该邮箱已注册", "email_exists");
    }
    const now = new Date().toISOString();
    const user = {
      id: createId("usr"),
      email,
      name,
      avatar_url: "",
      password_hash: hashPassword(password),
      email_verified_at: null,
      created_at: now,
      updated_at: now,
      last_login_at: now,
      disabled_at: null,
    };
    const organization = {
      id: createId("org"),
      name: `${name}的工作区`,
      slug: createSlug(name),
      plan: "free",
      created_by: user.id,
      created_at: now,
      updated_at: now,
    };
    const membership = {
      id: createId("mem"),
      organization_id: organization.id,
      user_id: user.id,
      role: "owner",
      created_at: now,
    };
    data.users.push(user);
    data.organizations.push(organization);
    data.memberships.push(membership);
    const session = createSession(data, user.id);
    const verification = createEmailVerification(data, user.id);
    addAudit(data, organization.id, user.id, "auth.register", "user", user.id, {});
    return { user, organization, membership, session, verification };
  });

  setSession(ctx.response, ctx.env, payload.session.token);
  await deliverTransactionalEmail(ctx, {
    userId: payload.user.id,
    email: payload.user.email,
    template: "email_verification",
    token: payload.verification.token,
    metadata: { verification_id: payload.verification.id },
  });
  sendJson(ctx.response, 201, {
    ...mePayload(payload.user, [payload.organization], payload.organization, payload.membership),
    email_verification_token: exposeDevelopmentToken(ctx.env, payload.verification.token),
  });
}

async function login(ctx) {
  const body = await readJsonBody(ctx.request, ctx.env.maxJsonBodyBytes);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const ipHash = hashClientIp(ctx);
  const payload = await ctx.store.write((data) => {
    assertLoginNotThrottled(data, email, ipHash);
    const user = data.users.find((item) => item.email === email && !item.disabled_at);
    if (!user || !verifyPassword(password, user.password_hash)) {
      recordLoginAttempt(data, email, ipHash, false);
      addSystemEvent(data, null, user?.id || null, "warn", "auth.login.failed", "邮箱或密码不正确", { email });
      throw new HttpError(401, "邮箱或密码不正确", "invalid_credentials");
    }
    recordLoginAttempt(data, email, ipHash, true);
    user.last_login_at = new Date().toISOString();
    user.updated_at = user.last_login_at;
    const memberships = data.memberships.filter((item) => item.user_id === user.id);
    const organizations = memberships
      .map((membership) => data.organizations.find((org) => org.id === membership.organization_id))
      .filter(Boolean);
    const organization = organizations[0] || null;
    const membership = memberships.find((item) => item.organization_id === organization?.id) || null;
    const session = createSession(data, user.id);
    addAudit(data, organization?.id || null, user.id, "auth.login", "user", user.id, {});
    return { user, organizations, organization, membership, session };
  });

  setSession(ctx.response, ctx.env, payload.session.token);
  sendJson(ctx.response, 200, mePayload(payload.user, payload.organizations, payload.organization, payload.membership));
}

async function logout(ctx) {
  const token = getSessionToken(ctx.request);
  if (token) {
    const tokenHash = sha256(token);
    await ctx.store.write((data) => {
      data.sessions = data.sessions.filter((session) => session.token_hash !== tokenHash);
    });
  }
  ctx.response.setHeader("Set-Cookie", clearSessionCookie(SESSION_COOKIE, { secure: ctx.env.sessionSecure }));
  sendNoContent(ctx.response);
}

async function logoutAll(ctx) {
  await ctx.store.write((data) => {
    data.sessions = data.sessions.filter((session) => session.user_id !== ctx.auth.user.id);
    addAudit(data, null, ctx.auth.user.id, "auth.logout_all", "user", ctx.auth.user.id, {});
  });
  ctx.response.setHeader("Set-Cookie", clearSessionCookie(SESSION_COOKIE, { secure: ctx.env.sessionSecure }));
  sendNoContent(ctx.response);
}

async function requestEmailVerification(ctx) {
  const body = await readJsonBody(ctx.request, ctx.env.maxJsonBodyBytes);
  const email = normalizeEmail(body.email || ctx.auth?.user?.email);
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "请输入有效邮箱", "invalid_email");
  const payload = await ctx.store.write((data) => {
    const user = data.users.find((item) => item.email === email && !item.disabled_at);
    if (!user) return { token: "" };
    if (user.email_verified_at) return { verified: true, token: "" };
    assertEmailRequestAllowed(data, email, "email_verification");
    const verification = createEmailVerification(data, user.id);
    addAudit(data, null, user.id, "auth.email_verification.request", "user", user.id, {});
    return verification;
  });
  if (payload.token) {
    await deliverTransactionalEmail(ctx, {
      userId: payload.user_id || ctx.auth?.user?.id || null,
      email,
      template: "email_verification",
      token: payload.token,
      metadata: { verification_id: payload.id },
    });
  }
  sendJson(ctx.response, 200, {
    ok: true,
    verified: Boolean(payload.verified),
    email_verification_token: exposeDevelopmentToken(ctx.env, payload.token),
  });
}

async function verifyEmail(ctx) {
  const body = await readJsonBody(ctx.request, ctx.env.maxJsonBodyBytes);
  const email = normalizeEmail(body.email || ctx.auth?.user?.email);
  const tokenHash = body.token ? sha256(String(body.token)) : "";
  if (!EMAIL_RE.test(email) || !tokenHash) throw new HttpError(400, "请填写邮箱和验证码", "missing_verification_token");
  const payload = await ctx.store.write((data) => {
    const user = data.users.find((item) => item.email === email && !item.disabled_at);
    if (!user) throw new HttpError(404, "账号不存在", "not_found");
    const verification = data.email_verifications.find((item) =>
      item.user_id === user.id &&
      item.token_hash === tokenHash &&
      !item.used_at &&
      item.expires_at > new Date().toISOString());
    if (!verification) throw new HttpError(400, "验证码无效或已过期", "invalid_verification_token");
    const now = new Date().toISOString();
    verification.used_at = now;
    user.email_verified_at = now;
    user.updated_at = now;
    addAudit(data, null, user.id, "auth.email.verify", "user", user.id, {});
    return { user };
  });
  sendJson(ctx.response, 200, { user: publicUser(payload.user) });
}

async function requestPasswordReset(ctx) {
  const body = await readJsonBody(ctx.request, ctx.env.maxJsonBodyBytes);
  const email = normalizeEmail(body.email);
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "请输入有效邮箱", "invalid_email");
  const payload = await ctx.store.write((data) => {
    const user = data.users.find((item) => item.email === email && !item.disabled_at);
    if (!user) return { token: "" };
    assertEmailRequestAllowed(data, email, "password_reset");
    const reset = createPasswordReset(data, user.id);
    addSystemEvent(data, null, user.id, "info", "auth.password_reset.request", "用户请求重置密码", { email });
    return reset;
  });
  if (payload.token) {
    await deliverTransactionalEmail(ctx, {
      userId: payload.user_id || null,
      email,
      template: "password_reset",
      token: payload.token,
      metadata: { reset_id: payload.id },
    });
  }
  sendJson(ctx.response, 200, {
    ok: true,
    reset_token: exposeDevelopmentToken(ctx.env, payload.token),
  });
}

async function resetPassword(ctx) {
  const body = await readJsonBody(ctx.request, ctx.env.maxJsonBodyBytes);
  const email = normalizeEmail(body.email);
  const password = String(body.password || body.new_password || "");
  const tokenHash = body.token ? sha256(String(body.token)) : "";
  if (!EMAIL_RE.test(email) || !tokenHash) throw new HttpError(400, "请填写邮箱和重置码", "missing_reset_token");
  if (password.length < 8) throw new HttpError(400, "密码至少需要 8 位", "weak_password");
  await ctx.store.write((data) => {
    const user = data.users.find((item) => item.email === email && !item.disabled_at);
    if (!user) throw new HttpError(404, "账号不存在", "not_found");
    const reset = data.password_resets.find((item) =>
      item.user_id === user.id &&
      item.token_hash === tokenHash &&
      !item.used_at &&
      item.expires_at > new Date().toISOString());
    if (!reset) throw new HttpError(400, "重置码无效或已过期", "invalid_reset_token");
    const now = new Date().toISOString();
    reset.used_at = now;
    user.password_hash = hashPassword(password);
    user.updated_at = now;
    data.sessions = data.sessions.filter((session) => session.user_id !== user.id);
    addAudit(data, null, user.id, "auth.password_reset.complete", "user", user.id, {});
  });
  sendNoContent(ctx.response);
}

async function paymentWebhook(ctx) {
  if (!ctx.env.paymentWebhookSecret) throw new HttpError(503, "支付 webhook 尚未配置", "webhook_not_configured");
  const timestamp = String(ctx.request.headers["x-webhook-timestamp"] || "");
  const signature = String(ctx.request.headers["x-webhook-signature"] || "");
  const rawBody = await readRawBody(ctx.request, ctx.env.maxJsonBodyBytes);
  assertWebhookSignature(ctx.env, timestamp, signature, rawBody);
  let body;
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    throw new HttpError(400, "请求 JSON 格式不正确", "invalid_json");
  }
  const provider = String(body.provider || "manual").trim().slice(0, 80);
  const eventId = String(body.event_id || body.id || "").trim().slice(0, 160);
  const eventType = String(body.event_type || body.type || "").trim().slice(0, 120);
  if (!eventId || !eventType) throw new HttpError(400, "webhook 缺少事件 ID 或类型", "invalid_webhook");
  const normalized = normalizePaymentEvent({ ...body, provider, event_id: eventId, event_type: eventType }, ctx.env);
  const item = await ctx.store.write((data) => {
    const duplicate = data.payment_webhooks.find((event) => event.provider === provider && event.event_id === eventId);
    if (duplicate) return duplicate;
    const organizationId = normalized.organization_id || null;
    const organization = organizationId ? data.organizations.find((item) => item.id === organizationId) : null;
    const now = new Date().toISOString();
    const next = {
      id: createId("pay"),
      provider,
      event_id: eventId,
      organization_id: organizationId,
      event_type: eventType,
      payload: normalizeJsonField({ ...body, normalized }),
      processed_at: now,
      created_at: now,
    };
    data.payment_webhooks.push(next);
    if (organization && normalized.action === "activate_plan" && normalized.plan) {
      organization.plan = normalized.plan;
      organization.plan_expires_at = null;
      organization.updated_at = now;
      addAudit(data, organization.id, null, "billing.plan.update", "organization", organization.id, { provider, event_id: eventId, plan: normalized.plan });
    } else if (organization && normalized.action === "downgrade_plan") {
      organization.plan = "free";
      organization.plan_expires_at = null;
      organization.updated_at = now;
      addAudit(data, organization.id, null, "billing.plan.update", "organization", organization.id, { provider, event_id: eventId, plan: "free" });
    }
    const level = normalized.action === "payment_failed" || normalized.action === "refund_recorded" ? "warn" : "info";
    addSystemEvent(data, organizationId, null, level, normalized.event_name, normalized.message, {
      provider,
      event_id: eventId,
      event_type: eventType,
      plan: normalized.plan || "",
    });
    return next;
  });
  sendJson(ctx.response, 200, { webhook: item });
}

async function emailWebhook(ctx) {
  if (!ctx.env.emailCallbackToken) throw new HttpError(503, "邮件回调尚未配置", "email_callback_not_configured");
  assertEmailCallbackToken(ctx);
  const body = await readJsonBody(ctx.request, ctx.env.maxJsonBodyBytes);
  const callbackData = body.data && typeof body.data === "object" ? body.data : {};
  const callbackTags = normalizeEmailCallbackTags(body);
  const status = normalizeEmailDeliveryStatus(body.status || body.event || body.type || callbackData.status || callbackData.event);
  if (!status) throw new HttpError(400, "邮件回调状态无效", "invalid_email_callback_status");
  const deliveryId = String(body.delivery_id || body.deliveryId || body.metadata?.delivery_id || callbackTags.delivery_id || "").trim();
  const providerEventId = String(body.event_id || body.eventId || body.id || "").trim().slice(0, 160);
  const messageId = String(body.message_id || body.messageId || body.provider_message_id || body.metadata?.message_id || callbackData.email_id || callbackData.message_id || "").trim().slice(0, 160);
  const errorMessage = String(body.error || body.reason || body.message || callbackData.reason || callbackData.bounce?.message || "").trim().slice(0, 1000);
  const now = new Date().toISOString();
  const result = await ctx.store.write((data) => {
    const delivery = findEmailDeliveryForCallback(data, { deliveryId, messageId, body });
    if (!delivery) {
      addSystemEvent(data, null, null, "warn", "email.delivery.callback.unmatched", "邮件服务商回调未匹配到投递记录", {
        status,
        delivery_id: deliveryId,
        message_id: messageId,
        provider_event_id: providerEventId,
        email: extractEmailCallbackEmail(body),
        template: extractEmailCallbackTemplate(body),
      });
      return { matched: false, delivery: null };
    }
    delivery.status = status;
    delivery.error = ["failed", "bounced"].includes(status) ? errorMessage || "邮件投递失败" : "";
    delivery.metadata = {
      ...(delivery.metadata || {}),
      callback_status: status,
      callback_at: now,
      provider_event_id: providerEventId,
      message_id: messageId || delivery.metadata?.message_id || "",
    };
    delivery.updated_at = now;
    addSystemEvent(data, null, delivery.user_id || null, ["failed", "bounced"].includes(status) ? "warn" : "info", "email.delivery.callback", "邮件投递状态已更新", {
      delivery_id: delivery.id,
      status,
      template: delivery.template,
      email: delivery.email,
    });
    return { matched: true, delivery };
  });
  sendJson(ctx.response, result.matched ? 200 : 202, {
    matched: result.matched,
    delivery: result.delivery ? publicEmailDelivery(result.delivery) : null,
  });
}

async function currentUser(ctx) {
  if (!ctx.auth) {
    sendJson(ctx.response, 200, { authenticated: false, mode: "local" });
    return;
  }
  const data = await ctx.store.read();
  const organizations = getUserOrganizations(data, ctx.auth.user.id);
  const organization = resolveOrganization(ctx, data, false) || organizations[0] || null;
  const membership = organization ? getMembership(data, ctx.auth.user.id, organization.id) : null;
  sendJson(ctx.response, 200, mePayload(ctx.auth.user, organizations, organization, membership));
}

async function listOrganizations(ctx) {
  const data = await ctx.store.read();
  sendJson(ctx.response, 200, { organizations: getUserOrganizations(data, ctx.auth.user.id) });
}

async function createOrganization(ctx) {
  const body = await readJsonBody(ctx.request, ctx.env.maxJsonBodyBytes);
  const name = String(body.name || "").trim();
  if (!name) throw new HttpError(400, "请输入组织名称", "missing_name");
  const payload = await ctx.store.write((data) => {
    const now = new Date().toISOString();
    const organization = {
      id: createId("org"),
      name,
      slug: createSlug(name),
      plan: "free",
      created_by: ctx.auth.user.id,
      created_at: now,
      updated_at: now,
    };
    const membership = {
      id: createId("mem"),
      organization_id: organization.id,
      user_id: ctx.auth.user.id,
      role: "owner",
      created_at: now,
    };
    data.organizations.push(organization);
    data.memberships.push(membership);
    addAudit(data, organization.id, ctx.auth.user.id, "organization.create", "organization", organization.id, { name });
    return { organization, membership };
  });
  sendJson(ctx.response, 201, payload);
}

async function getOrganization(ctx, organizationId) {
  const data = await ctx.store.read();
  const membership = getMembership(data, ctx.auth.user.id, organizationId);
  if (!membership) throw new HttpError(404, "组织不存在", "not_found");
  const organization = data.organizations.find((item) => item.id === organizationId);
  sendJson(ctx.response, 200, { organization, membership });
}

async function updateOrganization(ctx, organizationId) {
  requireVerifiedUser(ctx);
  const body = await readJsonBody(ctx.request, ctx.env.maxJsonBodyBytes);
  const name = String(body.name || "").trim();
  if (!name) throw new HttpError(400, "请输入组织名称", "missing_name");
  const organization = await ctx.store.write((data) => {
    requireOrganizationRole(data, ctx.auth.user.id, organizationId, ["owner", "admin"]);
    const existing = data.organizations.find((item) => item.id === organizationId);
    if (!existing) throw new HttpError(404, "组织不存在", "not_found");
    existing.name = name.slice(0, 120);
    existing.slug = createSlug(existing.name);
    existing.updated_at = new Date().toISOString();
    addAudit(data, organizationId, ctx.auth.user.id, "organization.update", "organization", organizationId, { name: existing.name });
    return existing;
  });
  sendJson(ctx.response, 200, { organization });
}

async function listOrganizationMembers(ctx, organizationId) {
  const data = await ctx.store.read();
  requireOrganizationRole(data, ctx.auth.user.id, organizationId, ["owner", "admin", "member"]);
  const members = data.memberships
    .filter((membership) => membership.organization_id === organizationId)
    .map((membership) => ({
      ...membership,
      user: publicUser(data.users.find((user) => user.id === membership.user_id) || {}),
    }));
  sendJson(ctx.response, 200, { members });
}

async function listOrganizationInvitations(ctx, organizationId) {
  requireVerifiedUser(ctx);
  const data = await ctx.store.read();
  requireOrganizationRole(data, ctx.auth.user.id, organizationId, ["owner", "admin"]);
  const invitations = data.organization_invitations
    .filter((invitation) => invitation.organization_id === organizationId && !invitation.revoked_at)
    .map((invitation) => publicInvitation(invitation));
  sendJson(ctx.response, 200, { invitations });
}

async function createOrganizationInvitation(ctx, organizationId) {
  requireVerifiedUser(ctx);
  const body = await readJsonBody(ctx.request, ctx.env.maxJsonBodyBytes);
  const email = normalizeEmail(body.email);
  const role = normalizeInviteRole(body.role);
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "请输入有效邮箱", "invalid_email");
  const payload = await ctx.store.write((data) => {
    requireOrganizationRole(data, ctx.auth.user.id, organizationId, ["owner", "admin"]);
    const alreadyMember = data.memberships.some((item) =>
      item.organization_id === organizationId &&
      data.users.find((user) => user.id === item.user_id)?.email === email);
    if (alreadyMember) throw new HttpError(409, "该用户已是组织成员", "member_exists");
    const token = randomToken(32);
    const now = new Date().toISOString();
    const invitation = {
      id: createId("inv"),
      organization_id: organizationId,
      email,
      role,
      token_hash: sha256(token),
      invited_by: ctx.auth.user.id,
      created_at: now,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
      accepted_at: null,
      revoked_at: null,
    };
    data.organization_invitations.push(invitation);
    addAudit(data, organizationId, ctx.auth.user.id, "organization.invite", "organization_invitation", invitation.id, { email, role });
    return { invitation, token };
  });
  sendJson(ctx.response, 201, { invitation: publicInvitation(payload.invitation, payload.token) });
}

async function acceptOrganizationInvitation(ctx, organizationId, invitationId) {
  const body = await readJsonBody(ctx.request, ctx.env.maxJsonBodyBytes);
  const tokenHash = body.token ? sha256(String(body.token)) : "";
  const membership = await ctx.store.write((data) => {
    const invitation = data.organization_invitations.find((item) =>
      item.id === invitationId &&
      item.organization_id === organizationId &&
      !item.accepted_at &&
      !item.revoked_at);
    if (!invitation || invitation.expires_at < new Date().toISOString()) {
      throw new HttpError(404, "邀请不存在或已过期", "invitation_not_found");
    }
    if (invitation.email !== ctx.auth.user.email) throw new HttpError(403, "该邀请不属于当前用户", "forbidden");
    if (!tokenHash || tokenHash !== invitation.token_hash) throw new HttpError(403, "邀请码不正确", "invalid_invitation_token");
    const existing = getMembership(data, ctx.auth.user.id, organizationId);
    if (existing) return existing;
    const now = new Date().toISOString();
    const next = {
      id: createId("mem"),
      organization_id: organizationId,
      user_id: ctx.auth.user.id,
      role: invitation.role,
      created_at: now,
    };
    data.memberships.push(next);
    invitation.accepted_at = now;
    addAudit(data, organizationId, ctx.auth.user.id, "organization.invite.accept", "membership", next.id, { invitation_id: invitation.id });
    return next;
  });
  const data = await ctx.store.read();
  const organization = data.organizations.find((item) => item.id === organizationId);
  sendJson(ctx.response, 200, { organization, membership });
}

async function revokeOrganizationInvitation(ctx, organizationId, invitationId) {
  requireVerifiedUser(ctx);
  const invitation = await ctx.store.write((data) => {
    requireOrganizationRole(data, ctx.auth.user.id, organizationId, ["owner", "admin"]);
    const existing = data.organization_invitations.find((item) =>
      item.id === invitationId &&
      item.organization_id === organizationId &&
      !item.revoked_at &&
      !item.accepted_at);
    if (!existing) throw new HttpError(404, "邀请不存在或无法撤销", "not_found");
    existing.revoked_at = new Date().toISOString();
    addAudit(data, organizationId, ctx.auth.user.id, "organization.invite.revoke", "organization_invitation", existing.id, { email: existing.email });
    return existing;
  });
  sendJson(ctx.response, 200, { invitation: publicInvitation(invitation) });
}

async function resendOrganizationInvitation(ctx, organizationId, invitationId) {
  requireVerifiedUser(ctx);
  const payload = await ctx.store.write((data) => {
    requireOrganizationRole(data, ctx.auth.user.id, organizationId, ["owner", "admin"]);
    const existing = data.organization_invitations.find((item) =>
      item.id === invitationId &&
      item.organization_id === organizationId &&
      !item.revoked_at &&
      !item.accepted_at);
    if (!existing) throw new HttpError(404, "邀请不存在或无法重发", "not_found");
    const token = randomToken();
    existing.token_hash = sha256(token);
    existing.expires_at = new Date(Date.now() + EMAIL_TOKEN_TTL_MS * 7).toISOString();
    addAudit(data, organizationId, ctx.auth.user.id, "organization.invite.resend", "organization_invitation", existing.id, { email: existing.email });
    return { invitation: existing, token };
  });
  sendJson(ctx.response, 200, { invitation: publicInvitation(payload.invitation, payload.token) });
}

async function updateOrganizationMember(ctx, organizationId, memberId) {
  requireVerifiedUser(ctx);
  const body = await readJsonBody(ctx.request, ctx.env.maxJsonBodyBytes);
  const role = normalizeMemberRole(body.role);
  const membership = await ctx.store.write((data) => {
    requireOrganizationRole(data, ctx.auth.user.id, organizationId, ["owner", "admin"]);
    const existing = data.memberships.find((item) => item.id === memberId && item.organization_id === organizationId);
    if (!existing) throw new HttpError(404, "成员不存在", "not_found");
    if (existing.role === "owner") throw new HttpError(403, "不能修改拥有者角色", "forbidden");
    existing.role = role;
    addAudit(data, organizationId, ctx.auth.user.id, "organization.member.update", "membership", existing.id, { role });
    return existing;
  });
  sendJson(ctx.response, 200, { membership });
}

async function removeOrganizationMember(ctx, organizationId, memberId) {
  requireVerifiedUser(ctx);
  const removed = await ctx.store.write((data) => {
    requireOrganizationRole(data, ctx.auth.user.id, organizationId, ["owner", "admin"]);
    const existing = data.memberships.find((item) => item.id === memberId && item.organization_id === organizationId);
    if (!existing) throw new HttpError(404, "成员不存在", "not_found");
    if (existing.role === "owner") throw new HttpError(403, "不能移除拥有者", "forbidden");
    data.memberships = data.memberships.filter((item) => item.id !== existing.id);
    data.sessions = data.sessions.filter((session) => session.user_id !== existing.user_id);
    addAudit(data, organizationId, ctx.auth.user.id, "organization.member.remove", "membership", existing.id, { user_id: existing.user_id });
    return existing;
  });
  sendJson(ctx.response, 200, { membership: removed });
}

async function listDocuments(ctx) {
  const { data, organization } = await loadOrg(ctx);
  const includeDeleted = ctx.url.searchParams.get("include_deleted") === "true";
  if (typeof ctx.store.listDocumentsByOrganization === "function") {
    const result = await ctx.store.listDocumentsByOrganization({
      organizationId: organization.id,
      filters: normalizeDocumentListFiltersFromUrl(ctx.url),
      limit: getQueryLimit(ctx.url, 200, 1000),
    });
    sendJson(ctx.response, 200, result);
    return;
  }
  const documents = data.documents.filter((doc) => doc.organization_id === organization.id && (includeDeleted || !doc.deleted_at));
  sendJson(ctx.response, 200, { documents });
}

async function createDocument(ctx) {
  const body = await readJsonBody(ctx.request, ctx.env.maxJsonBodyBytes);
  const { organization, membership } = await loadOrg(ctx);
  const document = await ctx.store.write((data) => {
    const now = new Date().toISOString();
    const doc = normalizeDocumentInput(body, ctx.env.maxDocumentChars);
    const next = {
      id: createId("doc"),
      organization_id: organization.id,
      owner_id: ctx.auth.user.id,
      title: doc.title,
      type: doc.type,
      folder_id: doc.folder_id,
      content: doc.content,
      source: doc.source || "cloud",
      local_id: doc.local_id || "",
      metadata: doc.metadata,
      version: 1,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
    data.documents.push(next);
    addAudit(data, organization.id, ctx.auth.user.id, "document.create", "document", next.id, { title: next.title, role: membership.role });
    return next;
  });
  sendJson(ctx.response, 201, { document });
}

async function getDocument(ctx, id) {
  const { data, organization } = await loadOrg(ctx);
  const document = data.documents.find((doc) => doc.id === id && doc.organization_id === organization.id);
  if (!document || document.deleted_at) throw new HttpError(404, "文档不存在", "not_found");
  sendJson(ctx.response, 200, { document });
}

async function updateDocument(ctx, id) {
  const body = await readJsonBody(ctx.request, ctx.env.maxJsonBodyBytes);
  const { organization } = await loadOrg(ctx);
  const document = await ctx.store.write((data) => {
    const existing = data.documents.find((doc) => doc.id === id && doc.organization_id === organization.id);
    if (!existing || existing.deleted_at) throw new HttpError(404, "文档不存在", "not_found");
    assertExpectedVersion(existing, body);
    const next = normalizeDocumentInput({ ...existing, ...body }, ctx.env.maxDocumentChars);
    Object.assign(existing, {
      title: next.title,
      type: next.type,
      folder_id: next.folder_id,
      content: next.content,
      source: next.source || existing.source,
      local_id: next.local_id || existing.local_id,
      metadata: next.metadata,
      version: Number(existing.version || 1) + 1,
      updated_at: new Date().toISOString(),
    });
    addAudit(data, organization.id, ctx.auth.user.id, "document.update", "document", existing.id, { title: existing.title });
    return existing;
  });
  sendJson(ctx.response, 200, { document });
}

async function deleteDocument(ctx, id) {
  const { organization } = await loadOrg(ctx);
  const deleted = await ctx.store.write((data) => {
    const existing = data.documents.find((doc) => doc.id === id && doc.organization_id === organization.id);
    if (!existing || existing.deleted_at) throw new HttpError(404, "文档不存在", "not_found");
    existing.deleted_at = new Date().toISOString();
    existing.updated_at = existing.deleted_at;
    addAudit(data, organization.id, ctx.auth.user.id, "document.delete", "document", existing.id, { title: existing.title });
    return existing;
  });
  sendJson(ctx.response, 200, { document: deleted });
}

async function listWriters(ctx) {
  const { data, organization } = await loadOrg(ctx);
  const includeDeleted = ctx.url.searchParams.get("include_deleted") === "true";
  const writers = data.writer_profiles.filter((writer) => writer.organization_id === organization.id && (includeDeleted || !writer.deleted_at));
  sendJson(ctx.response, 200, { writers });
}

async function createWriter(ctx) {
  const body = await readJsonBody(ctx.request, ctx.env.maxJsonBodyBytes);
  const { organization } = await loadOrg(ctx);
  const writer = await ctx.store.write((data) => {
    const now = new Date().toISOString();
    const draft = normalizeWriterInput(body);
    ensureUniqueWriterHandle(data, organization.id, draft.handle);
    const next = {
      id: createId("wrt"),
      organization_id: organization.id,
      owner_id: ctx.auth.user.id,
      name: draft.name,
      handle: draft.handle,
      category: draft.category,
      description: draft.description,
      enabled: draft.enabled,
      summary_md: draft.summary_md,
      skill_json: draft.skill_json,
      quality_report: draft.quality_report,
      version: 1,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
    data.writer_profiles.push(next);
    createWriterVersion(data, next, ctx.auth.user.id);
    addAudit(data, organization.id, ctx.auth.user.id, "writer.create", "writer", next.id, { handle: next.handle });
    return next;
  });
  sendJson(ctx.response, 201, { writer });
}

async function getWriter(ctx, id) {
  const { data, organization } = await loadOrg(ctx);
  const writer = data.writer_profiles.find((item) => item.id === id && item.organization_id === organization.id);
  if (!writer || writer.deleted_at) throw new HttpError(404, "执笔人不存在", "not_found");
  sendJson(ctx.response, 200, { writer });
}

async function updateWriter(ctx, id) {
  const body = await readJsonBody(ctx.request, ctx.env.maxJsonBodyBytes);
  const { organization } = await loadOrg(ctx);
  const writer = await ctx.store.write((data) => {
    const existing = data.writer_profiles.find((item) => item.id === id && item.organization_id === organization.id);
    if (!existing || existing.deleted_at) throw new HttpError(404, "执笔人不存在", "not_found");
    assertExpectedVersion(existing, body);
    const draft = normalizeWriterInput({ ...existing, ...body });
    ensureUniqueWriterHandle(data, organization.id, draft.handle, existing.id);
    Object.assign(existing, {
      name: draft.name,
      handle: draft.handle,
      category: draft.category,
      description: draft.description,
      enabled: draft.enabled,
      summary_md: draft.summary_md,
      skill_json: draft.skill_json,
      quality_report: draft.quality_report,
      version: Number(existing.version || 1) + 1,
      updated_at: new Date().toISOString(),
    });
    createWriterVersion(data, existing, ctx.auth.user.id);
    addAudit(data, organization.id, ctx.auth.user.id, "writer.update", "writer", existing.id, { handle: existing.handle });
    return existing;
  });
  sendJson(ctx.response, 200, { writer });
}

async function deleteWriter(ctx, id) {
  const { organization } = await loadOrg(ctx);
  const writer = await ctx.store.write((data) => {
    const existing = data.writer_profiles.find((item) => item.id === id && item.organization_id === organization.id);
    if (!existing || existing.deleted_at) throw new HttpError(404, "执笔人不存在", "not_found");
    existing.deleted_at = new Date().toISOString();
    existing.updated_at = existing.deleted_at;
    addAudit(data, organization.id, ctx.auth.user.id, "writer.delete", "writer", existing.id, { handle: existing.handle });
    return existing;
  });
  sendJson(ctx.response, 200, { writer });
}

async function listWriterVersions(ctx, writerId) {
  const { data, organization } = await loadOrg(ctx);
  const writer = data.writer_profiles.find((item) => item.id === writerId && item.organization_id === organization.id);
  if (!writer || writer.deleted_at) throw new HttpError(404, "执笔人不存在", "not_found");
  const versions = data.writer_versions.filter((version) => version.writer_profile_id === writerId);
  sendJson(ctx.response, 200, { versions });
}

async function restoreWriterVersion(ctx, writerId, versionId) {
  const { organization } = await loadOrg(ctx);
  const writer = await ctx.store.write((data) => {
    const existing = data.writer_profiles.find((item) => item.id === writerId && item.organization_id === organization.id);
    if (!existing || existing.deleted_at) throw new HttpError(404, "执笔人不存在", "not_found");
    const version = data.writer_versions.find((item) => item.id === versionId && item.writer_profile_id === writerId);
    if (!version) throw new HttpError(404, "版本不存在", "not_found");
    Object.assign(existing, {
      summary_md: version.summary_md,
      skill_json: version.skill_json,
      quality_report: version.quality_report,
      version: Number(existing.version || 1) + 1,
      updated_at: new Date().toISOString(),
    });
    createWriterVersion(data, existing, ctx.auth.user.id);
    addAudit(data, organization.id, ctx.auth.user.id, "writer.version.restore", "writer", writerId, { version_id: versionId });
    return existing;
  });
  sendJson(ctx.response, 200, { writer });
}

async function listApiKeys(ctx) {
  requireVerifiedUser(ctx);
  const { data, organization } = await loadOrg(ctx);
  const keys = data.api_keys
    .filter((key) => key.organization_id === organization.id && !key.disabled_at)
    .map(publicApiKey);
  sendJson(ctx.response, 200, { api_keys: keys });
}

async function saveApiKey(ctx) {
  requireVerifiedUser(ctx);
  const body = await readJsonBody(ctx.request, ctx.env.maxJsonBodyBytes);
  const { organization, membership } = await loadOrg(ctx);
  if (!ADMIN_ROLES.has(membership.role)) throw new HttpError(403, "只有管理员可以配置组织接口", "forbidden");
  const provider = String(body.provider || "openai-compatible").trim();
  const rawKey = String(body.api_key || "").trim();
  if (!rawKey) throw new HttpError(400, "请输入 API Key", "missing_api_key");
  const saved = await ctx.store.write((data) => {
    const now = new Date().toISOString();
    const existing = data.api_keys.find((key) => key.organization_id === organization.id && key.provider === provider && !key.disabled_at);
    if (existing) {
      existing.encrypted_key = encryptSecret(rawKey, ctx.env.encryptionSecret);
      existing.key_hint = secretHint(rawKey);
      existing.updated_at = now;
      addAudit(data, organization.id, ctx.auth.user.id, "api_key.update", "api_key", existing.id, { provider });
      return existing;
    }
    const next = {
      id: createId("key"),
      organization_id: organization.id,
      user_id: ctx.auth.user.id,
      provider,
      scope: "organization",
      encrypted_key: encryptSecret(rawKey, ctx.env.encryptionSecret),
      key_hint: secretHint(rawKey),
      created_at: now,
      updated_at: now,
      disabled_at: null,
    };
    data.api_keys.push(next);
    addAudit(data, organization.id, ctx.auth.user.id, "api_key.create", "api_key", next.id, { provider });
    return next;
  });
  sendJson(ctx.response, 201, { api_key: publicApiKey(saved) });
}

async function deleteApiKey(ctx, id) {
  requireVerifiedUser(ctx);
  const { organization, membership } = await loadOrg(ctx);
  if (!ADMIN_ROLES.has(membership.role)) throw new HttpError(403, "只有管理员可以删除组织接口", "forbidden");
  const deleted = await ctx.store.write((data) => {
    const existing = data.api_keys.find((key) => key.id === id && key.organization_id === organization.id && !key.disabled_at);
    if (!existing) throw new HttpError(404, "接口配置不存在", "not_found");
    existing.disabled_at = new Date().toISOString();
    existing.updated_at = existing.disabled_at;
    addAudit(data, organization.id, ctx.auth.user.id, "api_key.delete", "api_key", existing.id, { provider: existing.provider });
    return existing;
  });
  sendJson(ctx.response, 200, { api_key: publicApiKey(deleted) });
}

async function chatProxy(ctx) {
  const body = await readJsonBody(ctx.request, ctx.env.maxJsonBodyBytes);
  const { data, organization } = await loadOrg(ctx);
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) throw new HttpError(400, "messages 不能为空", "missing_messages");
  const provider = String(body.provider || "openai-compatible");
  const model = String(body.model || ctx.env.aiModel || "default").trim();
  const taskType = String(body.task_type || "chat").slice(0, 80);
  const promptTokens = estimateTokens(messages.map((item) => item.content || "").join("\n"));
  const quotaDecision = await enforceRateLimit(ctx, organization.id);

  const startedAt = new Date().toISOString();
  let usageRecord = null;
  try {
    const providerKey = getProviderKey(data, organization.id, provider, ctx.env);
    const result = await callAiProvider({ env: ctx.env, providerKey, body: { ...body, messages, model } });
    usageRecord = await recordUsage(ctx, {
      organization_id: organization.id,
      user_id: ctx.auth.user.id,
      provider,
      model,
      task_type: taskType,
      prompt_tokens: result.usage?.prompt_tokens ?? promptTokens,
      completion_tokens: result.usage?.completion_tokens ?? estimateTokens(result.reply),
      total_tokens: result.usage?.total_tokens ?? promptTokens + estimateTokens(result.reply),
      status: "success",
      error: "",
      created_at: startedAt,
    });
    if (quotaDecision.source === "credit") {
      await spendCreditsForUsage(ctx, organization.id, ctx.auth.user.id, usageRecord.id, 1);
    }
    sendJson(ctx.response, 200, { reply: result.reply, mocked: result.mocked, usage: publicUsage(usageRecord) });
  } catch (error) {
    usageRecord = await recordUsage(ctx, {
      organization_id: organization.id,
      user_id: ctx.auth.user.id,
      provider,
      model,
      task_type: taskType,
      prompt_tokens: promptTokens,
      completion_tokens: 0,
      total_tokens: promptTokens,
      status: "failed",
      error: error.message || "AI 调用失败",
      created_at: startedAt,
    });
    await ctx.store.write((data) => {
      addSystemEvent(data, organization.id, ctx.auth.user.id, "warn", "ai.proxy.failed", error.message || "AI 调用失败", {
        provider,
        model,
        task_type: taskType,
        usage_id: usageRecord.id,
      });
    });
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, friendlyAiError(error), "ai_proxy_failed");
  }
}

async function currentUsage(ctx) {
  const { data, organization } = await loadOrg(ctx);
  const today = todayKey();
  const usage = data.ai_usage.filter((item) => item.organization_id === organization.id && item.created_at?.startsWith(today));
  const plan = getEffectivePlan(organization);
  const limits = getPlanLimits(plan, ctx.env);
  const credits = getCreditAccount(data, organization.id, ctx.auth.user.id);
  sendJson(ctx.response, 200, {
    usage: summarizeUsage(usage),
    limits: { user_daily: limits.userDaily, org_daily: limits.orgDaily, plan },
    credits: publicCreditAccount(credits),
  });
}

async function usageHistory(ctx) {
  const { data, organization } = await loadOrg(ctx);
  const limit = getQueryLimit(ctx.url, 200, 1000);
  const usageItems = typeof ctx.store.listUsageByOrganization === "function"
    ? await ctx.store.listUsageByOrganization({
      organizationId: organization.id,
      filters: normalizeUsageFiltersFromUrl(ctx.url),
      limit,
    })
    : filterByQuery(data.ai_usage.filter((item) => item.organization_id === organization.id), ctx.url)
      .slice(-limit);
  const usage = usageItems.map(publicUsage);
  sendJson(ctx.response, 200, { usage });
}

async function billingSummary(ctx) {
  const { data, organization, membership } = await loadOrg(ctx);
  if (!ADMIN_ROLES.has(membership.role)) throw new HttpError(403, "只有管理员可以查看套餐信息", "forbidden");
  const today = todayKey();
  const usage = data.ai_usage.filter((item) => item.organization_id === organization.id && item.created_at?.startsWith(today));
  const plan = getEffectivePlan(organization);
  const limits = getPlanLimits(plan, ctx.env);
  const webhooks = data.payment_webhooks
    .filter((item) => item.organization_id === organization.id)
    .slice(-20);
  const orders = data.manual_payment_orders
    .filter((item) => item.organization_id === organization.id)
    .slice(-20);
  const credits = getCreditAccount(data, organization.id, ctx.auth.user.id);
  sendJson(ctx.response, 200, {
    organization: { id: organization.id, name: organization.name, plan, stored_plan: organization.plan, plan_expires_at: organization.plan_expires_at || null },
    limits: { user_daily: limits.userDaily, org_daily: limits.orgDaily },
    credits: publicCreditAccount(credits),
    usage: summarizeUsage(usage),
    budget: summarizeUsageBudget(
      usage,
      data.ai_usage.filter((item) => item.organization_id === organization.id && item.created_at?.startsWith(monthKey())),
      ctx.env,
    ),
    payment_webhooks: webhooks,
    manual_orders: orders.map((item) => publicManualPaymentOrder(item, { admin: true })),
    checkout: {
      mode: ctx.env.paymentCheckoutMode,
      enabled: ctx.env.paymentCheckoutMode !== "disabled",
      available_plans: getCheckoutPlanOptions(ctx.env),
    },
    manual_payment: getManualPaymentSummary(ctx.env),
  });
}

async function createBillingCheckout(ctx) {
  const body = await readJsonBody(ctx.request, ctx.env.maxJsonBodyBytes);
  const { organization, membership } = await loadOrg(ctx);
  if (!ADMIN_ROLES.has(membership.role)) throw new HttpError(403, "只有管理员可以发起套餐升级", "forbidden");
  const checkout = resolveCheckoutSelection(ctx.env, body);
  if (!checkout.plan || checkout.plan === "free") {
    throw new HttpError(400, "请选择要升级的有效套餐", "invalid_billing_plan");
  }
  if (ctx.env.paymentCheckoutMode === "disabled") {
    await ctx.store.write((data) => {
      addSystemEvent(data, organization.id, ctx.auth.user.id, "warn", "billing.checkout.not_configured", "支付 checkout 尚未配置", { plan: checkout.plan });
    });
    throw new HttpError(503, "支付升级尚未配置，请联系管理员", "billing_checkout_not_configured");
  }
  if (ctx.env.paymentCheckoutMode !== "mock" && !ctx.env.paymentCheckoutUrl) {
    await ctx.store.write((data) => {
      addSystemEvent(data, organization.id, ctx.auth.user.id, "error", "billing.checkout.invalid_config", "支付 checkout 地址未配置", { plan: checkout.plan });
    });
    throw new HttpError(503, "支付升级地址尚未配置，请联系管理员", "billing_checkout_invalid_config");
  }
  const checkoutUrl = buildCheckoutUrl(ctx.env, organization, ctx.auth.user, checkout);
  await ctx.store.write((data) => {
    addAudit(data, organization.id, ctx.auth.user.id, "billing.checkout.create", "organization", organization.id, {
      plan: checkout.plan,
      price_id: checkout.price_id || "",
      mode: ctx.env.paymentCheckoutMode,
    });
  });
  sendJson(ctx.response, 201, {
    checkout: {
      organization_id: organization.id,
      plan: checkout.plan,
      price_id: checkout.price_id || "",
      mode: ctx.env.paymentCheckoutMode,
      checkout_url: checkoutUrl,
    },
  });
}

async function listManualPaymentOrders(ctx) {
  const { data, organization, membership } = await loadOrg(ctx);
  const isAdmin = ADMIN_ROLES.has(membership.role);
  const orders = data.manual_payment_orders
    .filter((item) => item.organization_id === organization.id && (isAdmin || item.user_id === ctx.auth.user.id))
    .slice(-100);
  sendJson(ctx.response, 200, {
    orders: orders.map((item) => publicManualPaymentOrder(item, { admin: isAdmin })),
    credits: publicCreditAccount(getCreditAccount(data, organization.id, ctx.auth.user.id)),
    manual_payment: getManualPaymentSummary(ctx.env),
  });
}

async function createManualPaymentOrder(ctx) {
  const body = await readJsonBody(ctx.request, ctx.env.maxJsonBodyBytes);
  const { organization } = await loadOrg(ctx);
  const paymentPackage = resolveManualPaymentPackage(ctx.env, body.package_id || body.packageId);
  const paymentChannel = normalizePaymentChannel(body.payment_channel || body.paymentChannel || body.channel);
  if (!paymentPackage) throw new HttpError(400, "请选择有效的充值套餐", "invalid_manual_payment_package");
  if (!paymentChannel) throw new HttpError(400, "请选择支付方式", "invalid_payment_channel");
  const payerNote = String(body.payer_note || body.payerNote || "").trim().slice(0, 500);
  const proofText = String(body.proof_text || body.proofText || "").trim().slice(0, 1000);
  const order = await ctx.store.write((data) => {
    const now = new Date().toISOString();
    const next = {
      id: createId("mop"),
      organization_id: organization.id,
      user_id: ctx.auth.user.id,
      package_id: paymentPackage.id,
      package_type: paymentPackage.type,
      title: paymentPackage.title,
      amount_cny: paymentPackage.amount_cny,
      credits: paymentPackage.credits,
      plan: paymentPackage.plan,
      duration_days: paymentPackage.duration_days,
      payment_channel: paymentChannel,
      payer_note: payerNote,
      proof_text: proofText,
      status: "pending",
      reviewed_by: null,
      reviewed_at: null,
      review_note: "",
      created_at: now,
      updated_at: now,
    };
    data.manual_payment_orders.push(next);
    addAudit(data, organization.id, ctx.auth.user.id, "billing.manual_order.create", "manual_payment_order", next.id, {
      package_id: next.package_id,
      amount_cny: next.amount_cny,
      payment_channel: next.payment_channel,
    });
    addSystemEvent(data, organization.id, ctx.auth.user.id, "info", "billing.manual_order.pending", "收到人工充值订单，等待管理员确认", {
      order_id: next.id,
      package_id: next.package_id,
    });
    return next;
  });
  sendJson(ctx.response, 201, { order: publicManualPaymentOrder(order) });
}

async function reviewManualPaymentOrder(ctx, orderId) {
  const body = await readJsonBody(ctx.request, ctx.env.maxJsonBodyBytes);
  const { organization, membership } = await loadOrg(ctx);
  if (!ADMIN_ROLES.has(membership.role)) throw new HttpError(403, "只有管理员可以审核充值订单", "forbidden");
  const action = String(body.action || body.status || "").trim().toLowerCase();
  if (!["approve", "approved", "reject", "rejected"].includes(action)) {
    throw new HttpError(400, "审核动作无效", "invalid_manual_payment_review");
  }
  const approved = action === "approve" || action === "approved";
  const reviewNote = String(body.review_note || body.reviewNote || body.note || "").trim().slice(0, 1000);
  const result = await ctx.store.write((data) => {
    const order = data.manual_payment_orders.find((item) => item.id === orderId && item.organization_id === organization.id);
    if (!order) throw new HttpError(404, "充值订单不存在", "manual_payment_order_not_found");
    if (order.status !== "pending") throw new HttpError(409, "充值订单已处理", "manual_payment_order_reviewed");
    const now = new Date().toISOString();
    order.status = approved ? "approved" : "rejected";
    order.reviewed_by = ctx.auth.user.id;
    order.reviewed_at = now;
    order.review_note = reviewNote;
    order.updated_at = now;
    let creditAccount = null;
    if (approved) {
      if (Number(order.credits || 0) > 0) {
        creditAccount = grantCredits(data, {
          organizationId: organization.id,
          userId: order.user_id,
          orderId: order.id,
          amount: Number(order.credits || 0),
          reason: "manual_payment_approved",
        });
      }
      if (order.plan) {
        applyApprovedPlanOrder(data, organization.id, order);
      }
    }
    addAudit(data, organization.id, ctx.auth.user.id, approved ? "billing.manual_order.approve" : "billing.manual_order.reject", "manual_payment_order", order.id, {
      package_id: order.package_id,
      amount_cny: order.amount_cny,
      credits: order.credits,
      plan: order.plan || "",
    });
    addSystemEvent(data, organization.id, order.user_id, approved ? "info" : "warn", approved ? "billing.manual_order.approved" : "billing.manual_order.rejected", approved ? "人工充值订单已确认" : "人工充值订单已拒绝", {
      order_id: order.id,
      package_id: order.package_id,
      reviewed_by: ctx.auth.user.id,
    });
    return { order, creditAccount };
  });
  sendJson(ctx.response, 200, {
    order: publicManualPaymentOrder(result.order, { admin: true }),
    credits: result.creditAccount ? publicCreditAccount(result.creditAccount) : null,
  });
}

async function auditHistory(ctx) {
  const { data, organization, membership } = await loadOrg(ctx);
  if (!ADMIN_ROLES.has(membership.role)) throw new HttpError(403, "只有管理员可以查看审计日志", "forbidden");
  if (typeof ctx.store.listAuditByOrganization === "function") {
    const logs = await ctx.store.listAuditByOrganization({
      organizationId: organization.id,
      filters: normalizeAuditFiltersFromUrl(ctx.url),
      limit: getQueryLimit(ctx.url, 200, 1000),
    });
    sendJson(ctx.response, 200, { audit_logs: logs });
    return;
  }
  const logs = filterByQuery(data.audit_logs.filter((item) => item.organization_id === organization.id), ctx.url)
    .slice(-getQueryLimit(ctx.url, 200, 1000));
  sendJson(ctx.response, 200, { audit_logs: logs });
}

async function recentErrors(ctx) {
  const { data, organization, membership } = await loadOrg(ctx);
  if (!ADMIN_ROLES.has(membership.role)) throw new HttpError(403, "只有管理员可以查看错误记录", "forbidden");
  sendJson(ctx.response, 200, {
    errors: buildRecentErrorItems(data, organization.id, 100),
  });
}

function buildRecentErrorItems(data, organizationId, limit = 100) {
  const systemErrors = data.system_events
    .filter((item) => item.organization_id === organizationId && ["warn", "error"].includes(item.level))
    .slice(-limit)
    .map(buildSystemEventErrorItem);
  const usageErrors = data.ai_usage
    .filter((item) => item.organization_id === organizationId && item.status === "failed")
    .slice(-limit)
    .map((item) => buildAiUsageErrorItem(item, findOpsTriage(data, organizationId, "ai_usage", item.id)));
  return [...systemErrors, ...usageErrors]
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
    .slice(0, limit);
}

function buildSystemEventErrorItem(item) {
  return {
    id: item.id,
    level: item.level || "warn",
    type: item.type || "system_event",
    source_type: "system_event",
    created_at: item.created_at || "",
    message: item.message || "",
    metadata: item.metadata || {},
  };
}

function buildAiUsageErrorItem(item, triageRecord = null) {
  return {
    id: item.id,
    level: "warn",
    type: "ai_usage",
    source_type: "ai_usage",
    created_at: item.created_at || "",
    message: item.error || "AI request failed",
    metadata: {
      ...publicUsage(item),
      ...(triageRecord?.metadata || {}),
    },
  };
}

function findOpsTriage(data, organizationId, sourceType, sourceId) {
  return (data.ops_triage || []).find((item) =>
    item.organization_id === organizationId &&
    item.source_type === sourceType &&
    item.source_id === sourceId) || null;
}

function upsertOpsTriage(data, organizationId, sourceType, sourceId, metadata, userId) {
  data.ops_triage = data.ops_triage || [];
  const now = new Date().toISOString();
  let record = findOpsTriage(data, organizationId, sourceType, sourceId);
  if (record) {
    record.metadata = metadata;
    record.updated_by = userId;
    record.updated_at = now;
    return record;
  }
  record = {
    id: createId("tri"),
    organization_id: organizationId,
    source_type: sourceType,
    source_id: sourceId,
    metadata,
    updated_by: userId,
    created_at: now,
    updated_at: now,
  };
  data.ops_triage.push(record);
  return record;
}

function normalizeIdList(value) {
  const list = Array.isArray(value) ? value : [value];
  return Array.from(new Set(list
    .map((item) => String(item || "").trim())
    .filter(Boolean)))
    .slice(0, 100);
}

async function createFeedback(ctx) {
  const body = await readJsonBody(ctx.request, ctx.env.maxJsonBodyBytes);
  const message = String(body.message || "").trim();
  if (!message) throw new HttpError(400, "请填写反馈内容", "missing_feedback");
  const { organization } = await loadOrg(ctx);
  await ctx.store.write((data) => {
    addSystemEvent(data, organization.id, ctx.auth.user.id, "info", "user.feedback", message.slice(0, 4000), {
      source: String(body.source || "cloud_panel").slice(0, 80),
    });
  });
  sendJson(ctx.response, 201, { ok: true });
}

async function updateFeedbackStatus(ctx, feedbackId) {
  const body = await readJsonBody(ctx.request, ctx.env.maxJsonBodyBytes);
  const status = normalizeFeedbackStatus(body.status);
  const triage = normalizeTriagePayload(body);
  const { organization, membership } = await loadOrg(ctx);
  if (!ADMIN_ROLES.has(membership.role)) throw new HttpError(403, "只有管理员可以处理反馈", "forbidden");
  const feedback = await ctx.store.write((data) => {
    const item = data.system_events.find((event) =>
      event.id === feedbackId &&
      event.organization_id === organization.id &&
      event.type === "user.feedback");
    if (!item) throw new HttpError(404, "反馈不存在", "not_found");
    item.metadata = applyTriageMetadata({ ...(item.metadata || {}), status }, triage, ctx.auth.user.id);
    addAudit(data, organization.id, ctx.auth.user.id, "feedback.status.update", "feedback", feedbackId, {
      status,
      assignee: item.metadata.assignee || "",
      sla_at: item.metadata.sla_at || "",
    });
    return item;
  });
  sendJson(ctx.response, 200, { feedback });
}

async function updateFeedbackBatchStatus(ctx) {
  const body = await readJsonBody(ctx.request, ctx.env.maxJsonBodyBytes);
  const status = normalizeFeedbackStatus(body.status);
  const triage = normalizeTriagePayload(body);
  const ids = normalizeIdList(body.feedback_ids || body.feedbackIds || body.ids);
  if (ids.length === 0) throw new HttpError(400, "请选择要处理的反馈", "missing_feedback_ids");
  const { organization, membership } = await loadOrg(ctx);
  if (!ADMIN_ROLES.has(membership.role)) throw new HttpError(403, "只有管理员可以批量处理反馈", "forbidden");
  const feedbacks = await ctx.store.write((data) => {
    const idSet = new Set(ids);
    const updated = [];
    data.system_events.forEach((event) => {
      if (event.organization_id !== organization.id || event.type !== "user.feedback" || !idSet.has(event.id)) return;
      event.metadata = applyTriageMetadata({ ...(event.metadata || {}), status }, triage, ctx.auth.user.id);
      updated.push(event);
    });
    if (updated.length === 0) throw new HttpError(404, "没有找到可处理的反馈", "not_found");
    addAudit(data, organization.id, ctx.auth.user.id, "feedback.status.batch_update", "feedback", "batch", {
      status,
      count: updated.length,
      feedback_ids: updated.map((item) => item.id),
    });
    return updated;
  });
  sendJson(ctx.response, 200, { count: feedbacks.length, feedbacks });
}

async function updateOpsEventTriage(ctx, eventId) {
  const body = await readJsonBody(ctx.request, ctx.env.maxJsonBodyBytes);
  const triage = normalizeTriagePayload(body);
  const triageStatus = normalizeTriageStatus(body.triage_status || body.status);
  const { organization, membership } = await loadOrg(ctx);
  if (!ADMIN_ROLES.has(membership.role)) throw new HttpError(403, "只有管理员可以处理错误事件", "forbidden");
  const event = await ctx.store.write((data) => {
    const item = data.system_events.find((entry) =>
      entry.id === eventId &&
      entry.organization_id === organization.id &&
      ["warn", "error"].includes(entry.level));
    if (item) {
      item.metadata = applyTriageMetadata(
        { ...(item.metadata || {}), triage_status: triageStatus },
        triage,
        ctx.auth.user.id,
      );
      addAudit(data, organization.id, ctx.auth.user.id, "ops.error.triage", "system_event", eventId, {
        triage_status: item.metadata.triage_status,
        assignee: item.metadata.assignee || "",
        sla_at: item.metadata.sla_at || "",
      });
      return buildSystemEventErrorItem(item);
    }
    const usage = data.ai_usage.find((entry) =>
      entry.id === eventId &&
      entry.organization_id === organization.id &&
      entry.status === "failed");
    if (!usage) throw new HttpError(404, "错误事件不存在", "not_found");
    const existing = findOpsTriage(data, organization.id, "ai_usage", usage.id);
    const metadata = applyTriageMetadata(
      { ...(existing?.metadata || {}), triage_status: triageStatus },
      triage,
      ctx.auth.user.id,
    );
    const record = upsertOpsTriage(data, organization.id, "ai_usage", usage.id, metadata, ctx.auth.user.id);
    addAudit(data, organization.id, ctx.auth.user.id, "ops.error.triage", "ai_usage", usage.id, {
      triage_status: record.metadata.triage_status,
      assignee: record.metadata.assignee || "",
      sla_at: record.metadata.sla_at || "",
    });
    return buildAiUsageErrorItem(usage, record);
  });
  sendJson(ctx.response, 200, { event });
}

function findAdminPreferences(data, organizationId, userId) {
  return (data.admin_preferences || []).find((item) =>
    item.organization_id === organizationId &&
    item.user_id === userId) || null;
}

function upsertAdminPreferences(data, organizationId, userId, preferences) {
  data.admin_preferences = data.admin_preferences || [];
  const now = new Date().toISOString();
  let record = findAdminPreferences(data, organizationId, userId);
  if (record) {
    record.preferences = preferences;
    record.updated_at = now;
    return record;
  }
  record = {
    id: createId("pref"),
    organization_id: organizationId,
    user_id: userId,
    preferences,
    created_at: now,
    updated_at: now,
  };
  data.admin_preferences.push(record);
  return record;
}

function normalizeAdminPreferences(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    audit_filters: normalizeSavedAuditFilters(source.audit_filters),
    error_filter: normalizePreferenceFilter(source.error_filter),
    feedback_filter: normalizePreferenceFilter(source.feedback_filter),
    updated_at: new Date().toISOString(),
  };
}

function normalizeSavedAuditFilters(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => ({
    id: String(item?.id || `filter-${index}`),
    name: String(item?.name || "").trim().slice(0, 40),
    from: String(item?.from || "").slice(0, 20),
    to: String(item?.to || "").slice(0, 20),
    action: String(item?.action || "").trim().slice(0, 120),
    created_at: String(item?.created_at || ""),
  })).filter((item) => item.name).slice(0, 12);
}

function normalizePreferenceFilter(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value)
    .map(([key, entry]) => [String(key).slice(0, 60), String(entry || "").slice(0, 120)])
    .filter(([key]) => key));
}

async function getAdminPreferences(ctx) {
  const { data, organization, membership } = await loadOrg(ctx);
  if (!ADMIN_ROLES.has(membership.role)) throw new HttpError(403, "只有管理员可以查看后台偏好", "forbidden");
  const preferences = findAdminPreferences(data, organization.id, ctx.auth.user.id)?.preferences || {};
  sendJson(ctx.response, 200, { preferences: normalizeAdminPreferences(preferences) });
}

async function updateAdminPreferences(ctx) {
  const body = await readJsonBody(ctx.request, ctx.env.maxJsonBodyBytes);
  const preferences = normalizeAdminPreferences(body.preferences || body);
  const { organization, membership } = await loadOrg(ctx);
  if (!ADMIN_ROLES.has(membership.role)) throw new HttpError(403, "只有管理员可以保存后台偏好", "forbidden");
  const record = await ctx.store.write((data) => {
    const saved = upsertAdminPreferences(data, organization.id, ctx.auth.user.id, preferences);
    addAudit(data, organization.id, ctx.auth.user.id, "admin.preferences.update", "admin_preferences", saved.id, {
      audit_filter_count: saved.preferences.audit_filters.length,
    });
    return saved;
  });
  sendJson(ctx.response, 200, { preferences: record.preferences });
}

async function deleteAdminPreferences(ctx) {
  const { organization, membership } = await loadOrg(ctx);
  if (!ADMIN_ROLES.has(membership.role)) throw new HttpError(403, "只有管理员可以清空后台偏好", "forbidden");
  await ctx.store.write((data) => {
    data.admin_preferences = data.admin_preferences.filter((item) =>
      !(item.organization_id === organization.id && item.user_id === ctx.auth.user.id));
    addAudit(data, organization.id, ctx.auth.user.id, "admin.preferences.clear", "admin_preferences", ctx.auth.user.id, {});
  });
  sendJson(ctx.response, 200, { preferences: normalizeAdminPreferences({}) });
}

async function adminDashboard(ctx) {
  const { data, organization, membership } = await loadOrg(ctx);
  if (!ADMIN_ROLES.has(membership.role)) throw new HttpError(403, "只有管理员可以查看管理汇总", "forbidden");
  const today = todayKey();
  const members = data.memberships
    .filter((item) => item.organization_id === organization.id)
    .map((item) => ({ ...item, user: publicUser(data.users.find((user) => user.id === item.user_id) || {}) }));
  const invitations = data.organization_invitations
    .filter((item) => item.organization_id === organization.id && !item.revoked_at)
    .map((item) => publicInvitation(item));
  const usage = data.ai_usage.filter((item) => item.organization_id === organization.id && item.created_at?.startsWith(today));
  const feedbacks = data.system_events
    .filter((item) => item.organization_id === organization.id && item.type === "user.feedback")
    .slice(-50)
    .map((item) => ({ ...item, metadata: { status: "pending", ...(item.metadata || {}) } }));
  const errors = buildRecentErrorItems(data, organization.id, 50);
  const orgUserIds = new Set(members.map((item) => item.user_id));
  const plan = getEffectivePlan(organization);
  const limits = getPlanLimits(plan, ctx.env);
  sendJson(ctx.response, 200, {
    organization,
    members,
    invitations,
    usage: summarizeUsage(usage),
    limits: { user_daily: limits.userDaily, org_daily: limits.orgDaily, plan },
    feedbacks,
    recent_errors: errors,
    budget: summarizeUsageBudget(
      usage,
      data.ai_usage.filter((item) => item.organization_id === organization.id && item.created_at?.startsWith(monthKey())),
      ctx.env,
    ),
    email_deliveries: data.email_deliveries.filter((item) => orgUserIds.has(item.user_id)).slice(-50).map(publicEmailDelivery),
    billing: {
      payment_webhooks: data.payment_webhooks.filter((item) => item.organization_id === organization.id).slice(-20),
      manual_orders: data.manual_payment_orders.filter((item) => item.organization_id === organization.id).slice(-50).map((item) => publicManualPaymentOrder(item, { admin: true })),
      manual_payment: getManualPaymentSummary(ctx.env),
      credits: getOrganizationCreditSummary(data, organization.id),
    },
  });
}

async function deliverTransactionalEmail(ctx, message) {
  const delivery = await ctx.store.write((data) => {
      const now = new Date().toISOString();
      const next = {
        id: createId("mail"),
        user_id: message.userId || null,
        email: message.email,
        template: message.template,
        provider: getEmailProviderName(ctx.env),
        status: "pending",
        attempts: 0,
        error: "",
      metadata: message.metadata || {},
      created_at: now,
      updated_at: now,
    };
    data.email_deliveries.push(next);
    return next;
  });

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const providerResult = await sendEmail(ctx.env, {
        ...message,
        metadata: { ...(message.metadata || {}), delivery_id: delivery.id },
      });
      await ctx.store.write((data) => {
        const item = data.email_deliveries.find((entry) => entry.id === delivery.id);
        if (item) {
          item.status = "sent";
          item.attempts = attempt;
          item.error = "";
          item.metadata = {
            ...(item.metadata || {}),
            ...(providerResult?.metadata || {}),
          };
          item.updated_at = new Date().toISOString();
        }
      });
      return;
    } catch (error) {
      lastError = error;
      await sleep(150 * attempt);
    }
  }

  await ctx.store.write((data) => {
    const item = data.email_deliveries.find((entry) => entry.id === delivery.id);
    if (item) {
      item.status = "failed";
      item.attempts = 3;
      item.error = lastError?.message || "邮件发送失败";
      item.updated_at = new Date().toISOString();
    }
    addSystemEvent(data, null, message.userId || null, "error", "email.delivery.failed", lastError?.message || "邮件发送失败", {
      delivery_id: delivery.id,
      template: message.template,
      email: message.email,
    });
  });
  throw new HttpError(502, "邮件发送失败，请稍后再试", "email_delivery_failed");
}

async function sendEmail(env, message) {
  const content = buildEmailContent(env, message);
  if (env.emailMode === "log") {
    console.log(JSON.stringify({
      type: "email.delivery",
      to: message.email,
      template: message.template,
      subject: content.subject,
    }));
    return;
  }
  if (env.emailProvider === "resend") {
    return sendResendEmail(env, message, content);
  }
  return sendGenericWebhookEmail(env, message, content);
}

async function sendGenericWebhookEmail(env, message, content) {
  const response = await fetch(env.emailWebhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.emailWebhookToken ? { Authorization: `Bearer ${env.emailWebhookToken}` } : {}),
    },
    body: JSON.stringify({
      from: env.emailFrom,
      to: message.email,
      subject: content.subject,
      text: content.text,
      html: content.html,
      template: message.template,
      metadata: message.metadata || {},
    }),
  });
  if (!response.ok) {
    throw new Error(`邮件服务返回 ${response.status}`);
  }
  const json = await response.json().catch(() => ({}));
  const messageId = String(json.id || json.message_id || json.messageId || "").trim();
  return {
    metadata: {
      ...(messageId ? { message_id: messageId, provider_message_id: messageId } : {}),
    },
  };
}

async function sendResendEmail(env, message, content) {
  const deliveryId = String(message.metadata?.delivery_id || "").trim();
  const response = await fetch(env.emailResendEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.emailResendApiKey}`,
      ...(deliveryId ? { "Idempotency-Key": deliveryId } : {}),
    },
    body: JSON.stringify({
      from: env.emailFrom,
      to: [message.email],
      subject: content.subject,
      text: content.text,
      html: content.html,
      tags: [
        { name: "template", value: message.template },
        ...(deliveryId ? [{ name: "delivery_id", value: deliveryId }] : []),
      ],
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.message || json.error || `Resend 邮件服务返回 ${response.status}`);
  }
  const messageId = String(json.id || "").trim();
  return {
    metadata: {
      ...(messageId ? { message_id: messageId, provider_message_id: messageId } : {}),
      resend_id: messageId,
    },
  };
}

function buildEmailContent(env, message) {
  const templates = {
    email_verification: {
      subject: "验证你的摹文拟笔工作台邮箱",
      title: "验证邮箱",
      intro: "请使用下面的验证码完成邮箱验证。",
    },
    password_reset: {
      subject: "重置你的摹文拟笔工作台密码",
      title: "重置密码",
      intro: "请使用下面的重置码完成密码重置。",
    },
  };
  const template = templates[message.template] || templates.email_verification;
  const text = [
    template.title,
    "",
    template.intro,
    "",
    `验证码：${message.token}`,
    "",
    `打开工作台：${env.appUrl}`,
    "",
    "如果不是你本人操作，请忽略这封邮件。",
  ].join("\n");
  return {
    subject: template.subject,
    text,
    html: text.replace(/\n/g, "<br>"),
  };
}

async function exportOwnData(ctx) {
  const data = await ctx.store.read();
  const userId = ctx.auth.user.id;
  const organizationIds = new Set(data.memberships.filter((item) => item.user_id === userId).map((item) => item.organization_id));
  const documentIds = new Set(data.documents.filter((item) => item.owner_id === userId).map((item) => item.id));
  const writerIds = new Set(data.writer_profiles.filter((item) => item.owner_id === userId).map((item) => item.id));
  sendJson(ctx.response, 200, {
    exported_at: new Date().toISOString(),
    user: publicUser(ctx.auth.user),
    organizations: data.organizations.filter((item) => organizationIds.has(item.id)),
    memberships: data.memberships.filter((item) => item.user_id === userId),
    documents: data.documents.filter((item) => documentIds.has(item.id)),
    writer_profiles: data.writer_profiles.filter((item) => writerIds.has(item.id)),
    writer_versions: data.writer_versions.filter((item) => writerIds.has(item.writer_profile_id)),
    ai_usage: data.ai_usage.filter((item) => item.user_id === userId),
    manual_payment_orders: data.manual_payment_orders.filter((item) => item.user_id === userId).map((item) => publicManualPaymentOrder(item, { userId })),
    credit_accounts: data.credit_accounts.filter((item) => item.user_id === userId).map(publicCreditAccount),
    credit_ledger: data.credit_ledger.filter((item) => item.user_id === userId),
    ops_triage: (data.ops_triage || []).filter((item) => item.updated_by === userId),
    admin_preferences: (data.admin_preferences || []).filter((item) => item.user_id === userId),
    audit_logs: data.audit_logs.filter((item) => item.user_id === userId),
  });
}

async function exportOrganizationData(ctx, orgId) {
  const { data } = await loadOrg(ctx);
  const organization = data.organizations.find((item) => item.id === orgId);
  if (!organization) throw new HttpError(404, "组织不存在", "not_found");
  requireOrganizationRole(data, ctx.auth.user.id, orgId, ["owner", "admin"]);
  const documentIds = new Set(data.documents.filter((item) => item.organization_id === orgId).map((item) => item.id));
  const writerIds = new Set(data.writer_profiles.filter((item) => item.organization_id === orgId).map((item) => item.id));
  const userIds = new Set(data.memberships.filter((item) => item.organization_id === orgId).map((item) => item.user_id));
  sendJson(ctx.response, 200, {
    exported_at: new Date().toISOString(),
    scope: "organization",
    organization,
    users: data.users.filter((item) => userIds.has(item.id)).map(publicUser),
    memberships: data.memberships.filter((item) => item.organization_id === orgId),
    invitations: data.organization_invitations.filter((item) => item.organization_id === orgId).map(publicInvitation),
    documents: data.documents.filter((item) => documentIds.has(item.id)),
    writer_profiles: data.writer_profiles.filter((item) => writerIds.has(item.id)),
    writer_versions: data.writer_versions.filter((item) => writerIds.has(item.writer_profile_id)),
    ai_usage: data.ai_usage.filter((item) => item.organization_id === orgId).map(publicUsage),
    ops_triage: (data.ops_triage || []).filter((item) => item.organization_id === orgId),
    admin_preferences: (data.admin_preferences || []).filter((item) => item.organization_id === orgId),
    audit_logs: data.audit_logs.filter((item) => item.organization_id === orgId),
    system_events: data.system_events.filter((item) => item.organization_id === orgId),
    email_deliveries: data.email_deliveries.filter((item) => userIds.has(item.user_id)).map(publicEmailDelivery),
    payment_webhooks: data.payment_webhooks.filter((item) => item.organization_id === orgId),
    manual_payment_orders: data.manual_payment_orders.filter((item) => item.organization_id === orgId).map((item) => publicManualPaymentOrder(item, { admin: true })),
    credit_accounts: data.credit_accounts.filter((item) => item.organization_id === orgId).map(publicCreditAccount),
    credit_ledger: data.credit_ledger.filter((item) => item.organization_id === orgId),
    api_keys: data.api_keys.filter((item) => item.organization_id === orgId).map(publicApiKey),
  });
}

async function requestOrganizationDeletion(ctx, orgId) {
  const body = await readJsonBody(ctx.request, ctx.env.maxJsonBodyBytes);
  const reason = String(body.reason || "管理员发起组织停用/删除评估").trim().slice(0, 1000);
  const { data } = await loadOrg(ctx);
  const organization = data.organizations.find((item) => item.id === orgId);
  if (!organization) throw new HttpError(404, "组织不存在", "not_found");
  requireOrganizationRole(data, ctx.auth.user.id, orgId, ["owner"]);
  const request = await ctx.store.write((data) => {
    const now = new Date().toISOString();
    const payload = { status: "draft", reason, requested_by: ctx.auth.user.id, requested_at: now };
    addSystemEvent(data, orgId, ctx.auth.user.id, "warn", "organization.deletion.requested", "组织删除/停用草案已创建，尚未执行不可逆删除", payload);
    addAudit(data, orgId, ctx.auth.user.id, "organization.deletion.request", "organization", orgId, payload);
    return payload;
  });
  sendJson(ctx.response, 202, { request });
}

async function deleteOwnAccount(ctx) {
  await ctx.store.write((data) => {
    const now = new Date().toISOString();
    const user = data.users.find((item) => item.id === ctx.auth.user.id);
    if (!user) throw new HttpError(404, "账号不存在", "not_found");
    user.disabled_at = now;
    user.updated_at = now;
    data.sessions = data.sessions.filter((session) => session.user_id !== user.id);
    data.api_keys = data.api_keys.map((key) => key.user_id === user.id ? { ...key, disabled_at: key.disabled_at || now, updated_at: now } : key);
    addAudit(data, null, user.id, "auth.account.delete", "user", user.id, {});
  });
  ctx.response.setHeader("Set-Cookie", clearSessionCookie(SESSION_COOKIE, { secure: ctx.env.sessionSecure }));
  sendNoContent(ctx.response);
}

async function resolveAuth(request, store) {
  const token = getSessionToken(request);
  if (!token) return null;
  const tokenHash = sha256(token);
  const now = Date.now();
  const data = await store.read();
  const session = data.sessions.find((item) => item.token_hash === tokenHash && Date.parse(item.expires_at) > now);
  if (!session) return null;
  const user = data.users.find((item) => item.id === session.user_id && !item.disabled_at);
  return user ? { user, session } : null;
}

function getSessionToken(request) {
  const auth = String(request.headers.authorization || "");
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return parseCookies(request.headers.cookie).get(SESSION_COOKIE) || "";
}

function createSession(data, userId) {
  const token = randomToken();
  const now = new Date();
  const session = {
    id: createId("ses"),
    user_id: userId,
    token_hash: sha256(token),
    expires_at: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
    created_at: now.toISOString(),
  };
  data.sessions.push(session);
  return { ...session, token };
}

function createEmailVerification(data, userId) {
  const token = randomToken();
  const now = new Date();
  const verification = {
    id: createId("emv"),
    user_id: userId,
    token_hash: sha256(token),
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + EMAIL_TOKEN_TTL_MS).toISOString(),
    used_at: null,
  };
  data.email_verifications.push(verification);
  return { ...verification, token };
}

function createPasswordReset(data, userId) {
  const token = randomToken();
  const now = new Date();
  const reset = {
    id: createId("rst"),
    user_id: userId,
    token_hash: sha256(token),
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + PASSWORD_RESET_TTL_MS).toISOString(),
    used_at: null,
  };
  data.password_resets.push(reset);
  return { ...reset, token };
}

function hashClientIp(ctx) {
  const value = ctx.request.socket?.remoteAddress || "unknown";
  return sha256(`${ctx.env.sessionSecret}:${value}`);
}

function assertLoginNotThrottled(data, email, ipHash) {
  const cutoff = Date.now() - LOGIN_FAIL_WINDOW_MS;
  const failures = data.login_attempts.filter((item) =>
    item.email === email &&
    item.ip_hash === ipHash &&
    item.success === false &&
    Date.parse(item.created_at) > cutoff);
  if (failures.length >= LOGIN_FAIL_LIMIT) {
    addSystemEvent(data, null, null, "warn", "auth.login.throttled", "登录失败次数过多", { email });
    throw new HttpError(429, "登录失败次数过多，请稍后再试", "login_throttled");
  }
}

function recordLoginAttempt(data, email, ipHash, success) {
  data.login_attempts.push({
    id: createId("lat"),
    email,
    ip_hash: ipHash,
    success,
    created_at: new Date().toISOString(),
  });
}

function setSession(response, env, token) {
  response.setHeader("Set-Cookie", createSessionCookie(SESSION_COOKIE, token, {
    secure: env.sessionSecure,
    maxAgeSeconds: SESSION_TTL_MS / 1000,
  }));
}

function requireAuth(ctx) {
  if (!ctx.auth) throw new HttpError(401, "请先登录", "unauthorized");
}

async function loadOrg(ctx) {
  const data = await ctx.store.read();
  const organization = resolveOrganization(ctx, data, true);
  const membership = getMembership(data, ctx.auth.user.id, organization.id);
  return { data, organization, membership };
}

function resolveOrganization(ctx, data, required) {
  const requestedOrgId = ctx.request.headers["x-organization-id"] || ctx.url.searchParams.get("organization_id");
  const organizations = getUserOrganizations(data, ctx.auth.user.id);
  const organization = requestedOrgId
    ? organizations.find((item) => item.id === requestedOrgId)
    : organizations[0];
  if (!organization && required) throw new HttpError(403, "无权访问该组织", "forbidden");
  return organization || null;
}

function getUserOrganizations(data, userId) {
  const orgIds = new Set(data.memberships.filter((item) => item.user_id === userId).map((item) => item.organization_id));
  return data.organizations.filter((item) => orgIds.has(item.id));
}

function getMembership(data, userId, organizationId) {
  return data.memberships.find((item) => item.user_id === userId && item.organization_id === organizationId) || null;
}

function requireOrganizationRole(data, userId, organizationId, roles) {
  const membership = getMembership(data, userId, organizationId);
  if (!membership || !roles.includes(membership.role)) {
    throw new HttpError(403, "无权访问该组织", "forbidden");
  }
  return membership;
}

function mePayload(user, organizations, activeOrganization, membership) {
  return {
    authenticated: true,
    mode: "cloud",
    user: publicUser(user),
    organizations,
    active_organization: activeOrganization,
    membership,
  };
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar_url: user.avatar_url || "",
    email_verified_at: user.email_verified_at || null,
    created_at: user.created_at,
    last_login_at: user.last_login_at,
  };
}

function publicInvitation(invitation, token = "") {
  const payload = {
    id: invitation.id,
    organization_id: invitation.organization_id,
    email: invitation.email,
    role: invitation.role,
    invited_by: invitation.invited_by,
    created_at: invitation.created_at,
    expires_at: invitation.expires_at,
    accepted_at: invitation.accepted_at,
    revoked_at: invitation.revoked_at,
  };
  if (token) payload.token = token;
  return payload;
}

function publicApiKey(key) {
  return {
    id: key.id,
    organization_id: key.organization_id,
    user_id: key.user_id,
    provider: key.provider,
    scope: key.scope,
    key_hint: key.key_hint,
    created_at: key.created_at,
    updated_at: key.updated_at,
    disabled_at: key.disabled_at,
  };
}

function publicUsage(item) {
  const { error, ...rest } = item;
  return { ...rest, error: error ? "已记录错误" : "" };
}

function publicCreditAccount(account = {}) {
  return {
    id: account.id || "",
    organization_id: account.organization_id || "",
    user_id: account.user_id || "",
    balance: Number(account.balance || 0),
    updated_at: account.updated_at || "",
  };
}

function publicManualPaymentOrder(order = {}, options = {}) {
  const payload = {
    id: order.id,
    organization_id: order.organization_id,
    user_id: order.user_id,
    package_id: order.package_id,
    package_type: order.package_type,
    title: order.title,
    amount_cny: Number(order.amount_cny || 0),
    credits: Number(order.credits || 0),
    plan: order.plan || "",
    duration_days: Number(order.duration_days || 0),
    payment_channel: order.payment_channel,
    payer_note: order.payer_note || "",
    status: order.status || "pending",
    reviewed_by: order.reviewed_by || null,
    reviewed_at: order.reviewed_at || null,
    review_note: order.review_note || "",
    created_at: order.created_at,
    updated_at: order.updated_at,
  };
  if (options.admin || order.user_id === options.userId) payload.proof_text = order.proof_text || "";
  return payload;
}

function publicEmailDelivery(item) {
  return {
    id: item.id,
    user_id: item.user_id,
    email: item.email,
    template: item.template,
    provider: item.provider,
    status: item.status,
    attempts: item.attempts,
    error: item.error ? "已记录错误" : "",
    metadata: item.metadata || {},
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

function normalizeEmailDeliveryStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  if (["sent", "email.sent"].includes(value)) return "sent";
  if (["delivered", "delivery.delivered", "email.delivered"].includes(value)) return "delivered";
  if (["bounced", "bounce", "complained", "delivery.bounced", "email.bounced", "email.complained"].includes(value)) return "bounced";
  if (["failed", "failure", "delivery.failed", "email.failed", "email.delivery_delayed"].includes(value)) return "failed";
  if (["opened", "open", "clicked", "email.opened", "email.clicked"].includes(value)) return "opened";
  return "";
}

function assertEmailCallbackToken(ctx) {
  const authorization = String(ctx.request.headers.authorization || "");
  const bearer = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  const token = String(ctx.request.headers["x-email-callback-token"] || ctx.url.searchParams.get("token") || bearer || "");
  if (!token || !timingSafeEqual(token, ctx.env.emailCallbackToken)) {
    throw new HttpError(403, "邮件回调令牌不正确", "invalid_email_callback_token");
  }
}

function findEmailDeliveryForCallback(data, options) {
  const { deliveryId, messageId, body } = options;
  if (deliveryId) {
    const byId = data.email_deliveries.find((item) => item.id === deliveryId || item.metadata?.delivery_id === deliveryId);
    if (byId) return byId;
  }
  if (messageId) {
    const byMessageId = data.email_deliveries.find((item) =>
      item.metadata?.message_id === messageId ||
      item.metadata?.provider_message_id === messageId);
    if (byMessageId) return byMessageId;
  }
  const email = extractEmailCallbackEmail(body);
  const template = extractEmailCallbackTemplate(body);
  if (!email || !template) return null;
  return data.email_deliveries
    .filter((item) => item.email === email && item.template === template)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] || null;
}

function getEmailProviderName(env) {
  return env.emailMode === "log" ? "log" : env.emailProvider || "generic-webhook";
}

function normalizeEmailCallbackTags(body) {
  const data = body?.data && typeof body.data === "object" ? body.data : {};
  const rawTags = body?.tags || data.tags || body?.metadata?.tags || {};
  if (Array.isArray(rawTags)) {
    return Object.fromEntries(rawTags
      .filter((tag) => tag && typeof tag === "object")
      .map((tag) => [String(tag.name || "").trim(), String(tag.value || "").trim()])
      .filter(([name]) => name));
  }
  return rawTags && typeof rawTags === "object" ? rawTags : {};
}

function extractEmailCallbackEmail(body) {
  const data = body?.data && typeof body.data === "object" ? body.data : {};
  const value = body?.email || body?.to || data.email || data.to || data.recipient || "";
  if (Array.isArray(value)) return normalizeEmail(value[0] || "");
  return normalizeEmail(value);
}

function extractEmailCallbackTemplate(body) {
  const data = body?.data && typeof body.data === "object" ? body.data : {};
  const tags = normalizeEmailCallbackTags(body);
  return String(body?.template || data.template || tags.template || tags.category || "").trim().slice(0, 80);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeInviteRole(role) {
  return role === "admin" ? "admin" : "member";
}

function normalizeMemberRole(role) {
  return role === "admin" ? "admin" : "member";
}

function normalizePlan(plan) {
  return ["free", "pro", "team"].includes(plan) ? plan : "";
}

function normalizeFeedbackStatus(status) {
  return ["pending", "processing", "resolved", "closed"].includes(status) ? status : "pending";
}

function normalizeTriageStatus(status) {
  return ["open", "processing", "resolved", "ignored"].includes(status) ? status : "open";
}

function normalizeTriagePayload(body = {}) {
  const payload = {};
  const assignee = normalizeOptionalText(body, "assignee", 120);
  const note = normalizeOptionalText(body, "note", 1000);
  const slaAt = normalizeOptionalSla(body);
  const priority = normalizeOptionalText(body, "priority", 24);
  if (assignee !== undefined) payload.assignee = assignee;
  if (note !== undefined) payload.note = note;
  if (slaAt !== undefined) payload.sla_at = slaAt;
  if (priority !== undefined) payload.priority = ["low", "normal", "high", "urgent"].includes(priority) ? priority : "normal";
  if (Object.prototype.hasOwnProperty.call(body, "triage_status") || Object.prototype.hasOwnProperty.call(body, "triageStatus")) {
    payload.triage_status = normalizeTriageStatus(body.triage_status || body.triageStatus);
  }
  return payload;
}

function normalizeOptionalText(body, key, maxLength) {
  if (!Object.prototype.hasOwnProperty.call(body, key)) return undefined;
  return String(body[key] || "").trim().slice(0, maxLength);
}

function normalizeOptionalSla(body) {
  const hasSnake = Object.prototype.hasOwnProperty.call(body, "sla_at");
  const hasCamel = Object.prototype.hasOwnProperty.call(body, "slaAt");
  if (!hasSnake && !hasCamel) return undefined;
  const value = String(hasSnake ? body.sla_at || "" : body.slaAt || "").trim();
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 80) : date.toISOString();
}

function applyTriageMetadata(metadata, triage, userId) {
  return {
    ...(metadata || {}),
    ...triage,
    handled_by: userId,
    handled_at: new Date().toISOString(),
  };
}

function getCheckoutPlanOptions(env) {
  const map = env.paymentPlanPriceMap && typeof env.paymentPlanPriceMap === "object" ? env.paymentPlanPriceMap : {};
  const mapped = Object.entries(map)
    .map(([priceId, plan]) => ({ plan: normalizePlan(plan), price_id: String(priceId || "").trim() }))
    .filter((item) => item.plan && item.plan !== "free" && item.price_id);
  if (mapped.length > 0) return mapped;
  return [
    { plan: "pro", price_id: "" },
    { plan: "team", price_id: "" },
  ];
}

function resolveCheckoutSelection(env, body) {
  const requestedPriceId = String(body.price_id || body.priceId || "").trim();
  const requestedPlan = normalizePlan(body.plan || "");
  const options = getCheckoutPlanOptions(env);
  const requiresMappedPrice = options.some((item) => item.price_id);
  if (requestedPriceId) {
    const matched = options.find((item) => item.price_id === requestedPriceId);
    return matched || { plan: "", price_id: requestedPriceId };
  }
  if (requestedPlan) {
    const matched = options.find((item) => item.plan === requestedPlan);
    if (matched) return matched;
    return requiresMappedPrice ? { plan: "", price_id: "" } : { plan: requestedPlan, price_id: "" };
  }
  return { plan: "", price_id: "" };
}

function buildCheckoutUrl(env, organization, user, checkout) {
  const base = env.paymentCheckoutMode === "mock"
    ? `${env.appUrl}#billing-checkout-mock`
    : env.paymentCheckoutUrl;
  let url;
  try {
    url = new URL(base);
  } catch {
    throw new HttpError(503, "支付升级地址配置无效，请联系管理员", "billing_checkout_invalid_config");
  }
  url.searchParams.set("organization_id", organization.id);
  url.searchParams.set("organization_name", organization.name || "");
  url.searchParams.set("plan", checkout.plan);
  if (checkout.price_id) url.searchParams.set("price_id", checkout.price_id);
  if (user?.email) url.searchParams.set("email", user.email);
  if (env.paymentSuccessUrl) url.searchParams.set("success_url", env.paymentSuccessUrl);
  if (env.paymentCancelUrl) url.searchParams.set("cancel_url", env.paymentCancelUrl);
  return url.toString();
}

function getManualPaymentSummary(env) {
  const methods = [
    { channel: "wechat", label: "微信", qr_url: env.manualPaymentWechatQrUrl || "" },
    { channel: "alipay", label: "支付宝", qr_url: env.manualPaymentAlipayQrUrl || "" },
  ];
  return {
    enabled: true,
    receiver_name: env.manualPaymentReceiverName || "",
    methods,
    packages: getManualPaymentPackages(env),
  };
}

function getManualPaymentPackages(env) {
  const configured = Array.isArray(env.manualPaymentPackages) ? env.manualPaymentPackages : [];
  const source = configured.length ? configured : [
    { id: "pro_month", title: "Pro 月度会员", type: "plan", amount_cny: 29, plan: "pro", duration_days: 30 },
    { id: "team_month", title: "Team 月度会员", type: "plan", amount_cny: 99, plan: "team", duration_days: 30 },
    { id: "credits_1000", title: "1000 点 AI 额度", type: "credits", amount_cny: 50, credits: 1000 },
    { id: "credits_3000", title: "3000 点 AI 额度", type: "credits", amount_cny: 120, credits: 3000 },
  ];
  return source
    .map((item, index) => normalizeManualPaymentPackage(item, index))
    .filter(Boolean);
}

function normalizeManualPaymentPackage(item, index) {
  if (!item || typeof item !== "object") return null;
  const plan = normalizePlan(String(item.plan || ""));
  const credits = Math.max(0, Math.floor(Number(item.credits || 0)));
  const durationDays = Math.max(0, Math.floor(Number(item.duration_days || item.durationDays || 0)));
  const amountCny = Math.max(0, Number(item.amount_cny ?? item.amountCny ?? item.amount ?? 0));
  const type = ["plan", "credits", "mixed"].includes(item.type) ? item.type : plan && credits ? "mixed" : plan ? "plan" : "credits";
  const id = String(item.id || item.package_id || `${type}_${index + 1}`).trim().slice(0, 80);
  if (!id || (type === "plan" && !plan) || (type === "credits" && credits <= 0) || (type === "mixed" && !plan && credits <= 0)) return null;
  return {
    id,
    title: String(item.title || item.name || id).trim().slice(0, 120) || id,
    type,
    amount_cny: Number(amountCny.toFixed(2)),
    credits,
    plan,
    duration_days: durationDays,
  };
}

function resolveManualPaymentPackage(env, packageId) {
  const id = String(packageId || "").trim();
  if (!id) return null;
  return getManualPaymentPackages(env).find((item) => item.id === id) || null;
}

function normalizePaymentChannel(channel) {
  const value = String(channel || "").trim().toLowerCase();
  return ["wechat", "alipay", "bank", "other"].includes(value) ? value : "";
}

function getEffectivePlan(organization = {}) {
  const plan = normalizePlan(organization.plan || "") || "free";
  if (plan === "free") return "free";
  const expiresAt = organization.plan_expires_at ? Date.parse(organization.plan_expires_at) : 0;
  if (expiresAt && expiresAt <= Date.now()) return "free";
  return plan;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function applyApprovedPlanOrder(data, organizationId, order) {
  const organization = data.organizations.find((item) => item.id === organizationId);
  if (!organization || !order.plan) return;
  const now = new Date();
  const currentExpiry = organization.plan === order.plan && organization.plan_expires_at
    ? Date.parse(organization.plan_expires_at)
    : 0;
  const start = currentExpiry && currentExpiry > now.getTime() ? new Date(currentExpiry) : now;
  organization.plan = order.plan;
  organization.plan_expires_at = order.duration_days > 0 ? addDays(start, order.duration_days).toISOString() : null;
  organization.updated_at = now.toISOString();
}

function getCreditAccount(data, organizationId, userId) {
  return data.credit_accounts.find((item) => item.organization_id === organizationId && item.user_id === userId) || {
    id: "",
    organization_id: organizationId,
    user_id: userId,
    balance: 0,
    updated_at: "",
  };
}

function ensureCreditAccount(data, organizationId, userId) {
  let account = data.credit_accounts.find((item) => item.organization_id === organizationId && item.user_id === userId);
  if (!account) {
    account = {
      id: createId("crd"),
      organization_id: organizationId,
      user_id: userId,
      balance: 0,
      updated_at: new Date().toISOString(),
    };
    data.credit_accounts.push(account);
  }
  account.balance = Number(account.balance || 0);
  return account;
}

function grantCredits(data, { organizationId, userId, orderId = null, amount, reason }) {
  const creditAmount = Math.max(0, Math.floor(Number(amount || 0)));
  if (creditAmount <= 0) return getCreditAccount(data, organizationId, userId);
  const account = ensureCreditAccount(data, organizationId, userId);
  account.balance += creditAmount;
  account.updated_at = new Date().toISOString();
  data.credit_ledger.push({
    id: createId("led"),
    organization_id: organizationId,
    user_id: userId,
    order_id: orderId,
    usage_id: null,
    direction: "in",
    amount: creditAmount,
    balance_after: account.balance,
    reason,
    created_at: account.updated_at,
  });
  return account;
}

async function spendCreditsForUsage(ctx, organizationId, userId, usageId, amount) {
  await ctx.store.write((data) => {
    const creditAmount = Math.max(1, Math.floor(Number(amount || 1)));
    const account = ensureCreditAccount(data, organizationId, userId);
    if (account.balance < creditAmount) {
      addSystemEvent(data, organizationId, userId, "warn", "billing.credit.spend_skipped", "额度扣减失败，余额不足", { usage_id: usageId, amount: creditAmount });
      return null;
    }
    account.balance -= creditAmount;
    account.updated_at = new Date().toISOString();
    data.credit_ledger.push({
      id: createId("led"),
      organization_id: organizationId,
      user_id: userId,
      order_id: null,
      usage_id: usageId,
      direction: "out",
      amount: creditAmount,
      balance_after: account.balance,
      reason: "ai_quota_overage",
      created_at: account.updated_at,
    });
    addAudit(data, organizationId, userId, "billing.credit.spend", "ai_usage", usageId, { amount: creditAmount, balance_after: account.balance });
    return account;
  });
}

function getOrganizationCreditSummary(data, organizationId) {
  const accounts = data.credit_accounts.filter((item) => item.organization_id === organizationId);
  return {
    total_balance: accounts.reduce((sum, item) => sum + Number(item.balance || 0), 0),
    account_count: accounts.length,
  };
}

function assertEmailRequestAllowed(data, email, template) {
  const cutoff = Date.now() - EMAIL_REQUEST_WINDOW_MS;
  const recent = data.email_deliveries.filter((item) =>
    item.email === email &&
    item.template === template &&
    Date.parse(item.created_at) > cutoff);
  if (recent.length >= EMAIL_REQUEST_LIMIT) {
    addSystemEvent(data, null, null, "warn", "email.request.throttled", "邮件请求过于频繁", { email, template });
    throw new HttpError(429, "邮件请求过于频繁，请稍后再试", "email_request_throttled");
  }
}

function normalizePaymentEvent(body, env = {}) {
  const eventType = String(body.event_type || body.type || "").trim();
  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
  const data = body.data && typeof body.data === "object" ? body.data : {};
  const organizationId = String(body.organization_id || payload.organization_id || data.organization_id || "").trim();
  const plan = resolvePaymentPlan(body, env);
  const normalized = {
    organization_id: organizationId,
    plan,
    action: "record",
    event_name: "billing.webhook.received",
    message: "收到支付 webhook",
  };
  if (["checkout.completed", "checkout.session.completed", "subscription.created", "subscription.updated"].includes(eventType)) {
    return { ...normalized, action: plan ? "activate_plan" : "record", event_name: "billing.plan.event", message: "收到套餐变更事件" };
  }
  if (["subscription.deleted", "subscription.cancelled", "subscription.canceled"].includes(eventType)) {
    return { ...normalized, action: "downgrade_plan", plan: "free", event_name: "billing.subscription.cancelled", message: "订阅取消，组织套餐已降级为 free" };
  }
  if (["invoice.payment_failed", "payment.failed"].includes(eventType)) {
    return { ...normalized, action: "payment_failed", event_name: "billing.payment.failed", message: "支付失败，已记录待运营处理" };
  }
  if (["refund.created", "charge.refunded"].includes(eventType)) {
    return { ...normalized, action: "refund_recorded", event_name: "billing.refund.recorded", message: "退款事件已记录，暂不自动变更套餐" };
  }
  return normalized;
}

function resolvePaymentPlan(body, env = {}) {
  const map = env.paymentPlanPriceMap && typeof env.paymentPlanPriceMap === "object" ? env.paymentPlanPriceMap : {};
  const priceId = findPaymentPriceId(body);
  const mappedPlan = normalizePlan(map[priceId] || "");
  if (mappedPlan) return mappedPlan;
  if (Object.keys(map).length > 0) return "";
  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
  const data = body.data && typeof body.data === "object" ? body.data : {};
  return normalizePlan(body.plan || payload.plan || data.plan || data.metadata?.plan || "");
}

function findPaymentPriceId(body) {
  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
  const data = body.data && typeof body.data === "object" ? body.data : {};
  const object = data.object && typeof data.object === "object" ? data.object : {};
  const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
  const payloadMetadata = payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {};
  const dataMetadata = data.metadata && typeof data.metadata === "object" ? data.metadata : {};
  const objectMetadata = object.metadata && typeof object.metadata === "object" ? object.metadata : {};
  const candidates = [
    body.price_id,
    body.priceId,
    payload.price_id,
    payload.priceId,
    data.price_id,
    data.priceId,
    object.price_id,
    object.priceId,
    object.price?.id,
    object.plan?.id,
    object.items?.data?.[0]?.price?.id,
    metadata.price_id,
    metadata.priceId,
    payloadMetadata.price_id,
    payloadMetadata.priceId,
    dataMetadata.price_id,
    dataMetadata.priceId,
    objectMetadata.price_id,
    objectMetadata.priceId,
  ];
  return String(candidates.find((item) => item !== undefined && item !== null && String(item).trim()) || "").trim();
}

function assertWebhookSignature(env, timestamp, signature, rawBody) {
  const time = Number(timestamp);
  if (!Number.isFinite(time)) throw new HttpError(403, "webhook 时间戳无效", "invalid_webhook_timestamp");
  const ageMs = Math.abs(Date.now() - time * 1000);
  if (ageMs > 1000 * 60 * 5) throw new HttpError(403, "webhook 请求已过期", "expired_webhook");
  const expected = hmacSha256(env.paymentWebhookSecret, `${timestamp}.${rawBody}`);
  if (!signature || !timingSafeEqual(signature, expected)) {
    throw new HttpError(403, "webhook 签名不正确", "invalid_webhook_signature");
  }
}

function requireVerifiedUser(ctx) {
  if (!ctx.auth?.user?.email_verified_at) {
    throw new HttpError(403, "请先完成邮箱验证", "email_not_verified");
  }
}

function exposeDevelopmentToken(env, token) {
  return env.nodeEnv === "production" ? "" : token || "";
}

function createSlug(name) {
  const slug = String(name || "org").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  return slug || `org-${Date.now()}`;
}

function normalizeDocumentInput(input, maxChars) {
  const title = String(input.title || "未命名文档").trim().slice(0, 180) || "未命名文档";
  const content = String(input.content || "");
  if (content.length > maxChars) throw new HttpError(413, "文档内容过大", "document_too_large");
  return {
    title,
    type: String(input.type || "custom").trim().slice(0, 80),
    folder_id: String(input.folder_id || input.folderId || "").trim(),
    content,
    source: String(input.source || "cloud").trim().slice(0, 40),
    local_id: String(input.local_id || input.localId || "").trim().slice(0, 120),
    metadata: normalizeJsonField(input.metadata || {}),
  };
}

function assertExpectedVersion(existing, input) {
  if (input.force === true) return;
  const expected = input.expected_version ?? input.expectedVersion;
  if (expected === undefined || expected === null || expected === "") return;
  const current = Number(existing.version || 1);
  if (Number(expected) !== current) {
    throw new HttpError(409, "云端版本已更新，请先处理同步冲突", "version_conflict", {
      current_version: current,
      remote: existing,
    });
  }
}

function normalizeWriterInput(input) {
  const name = String(input.name || "未命名执笔人").trim().slice(0, 120) || "未命名执笔人";
  const handle = String(input.handle || name).trim().slice(0, 80);
  return {
    name,
    handle,
    category: String(input.category || "自定义").trim().slice(0, 80),
    description: String(input.description || "").trim().slice(0, 500),
    enabled: input.enabled !== false,
    summary_md: String(input.summary_md || input.summary || "").slice(0, 200000),
    skill_json: normalizeJsonField(input.skill_json || input.skillJson || {}),
    quality_report: normalizeJsonField(input.quality_report || input.qualityReport || {}),
  };
}

function normalizeJsonField(value) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return { raw: value };
    }
  }
  return value && typeof value === "object" ? value : {};
}

function ensureUniqueWriterHandle(data, organizationId, handle, selfId = null) {
  const duplicate = data.writer_profiles.find((item) =>
    item.organization_id === organizationId &&
    item.handle === handle &&
    item.id !== selfId &&
    !item.deleted_at);
  if (duplicate) throw new HttpError(409, `@${handle} 已存在`, "handle_exists");
}

function createWriterVersion(data, writer, userId) {
  const versionCount = data.writer_versions.filter((item) => item.writer_profile_id === writer.id).length;
  const now = new Date().toISOString();
  data.writer_versions.push({
    id: createId("ver"),
    writer_profile_id: writer.id,
    version: versionCount + 1,
    summary_md: writer.summary_md,
    skill_json: writer.skill_json,
    quality_report: writer.quality_report,
    created_by: userId,
    created_at: now,
  });
}

function addAudit(data, organizationId, userId, action, targetType, targetId, metadata = {}) {
  data.audit_logs.push({
    id: createId("aud"),
    organization_id: organizationId,
    user_id: userId,
    action,
    target_type: targetType,
    target_id: targetId,
    metadata,
    created_at: new Date().toISOString(),
  });
}

function addSystemEvent(data, organizationId, userId, level, type, message, metadata = {}) {
  data.system_events.push({
    id: createId("evt"),
    organization_id: organizationId,
    user_id: userId,
    level,
    type,
    message,
    metadata,
    created_at: new Date().toISOString(),
  });
}

async function enforceRateLimit(ctx, organizationId) {
  const today = todayKey();
  return ctx.store.write((data) => {
    const organization = data.organizations.find((item) => item.id === organizationId);
    const plan = getEffectivePlan(organization);
    const limits = getPlanLimits(plan, ctx.env);
    const userCount = data.ai_usage.filter((item) =>
      item.user_id === ctx.auth.user.id &&
      item.created_at?.startsWith(today)).length;
    const orgCount = data.ai_usage.filter((item) =>
      item.organization_id === organizationId &&
      item.created_at?.startsWith(today)).length;
    const userLimited = userCount >= limits.userDaily;
    const orgLimited = orgCount >= limits.orgDaily;
    const account = getCreditAccount(data, organizationId, ctx.auth.user.id);
    const creditAllowed = Number(account.balance || 0) > 0;
    let source = "plan";
    if ((userLimited || orgLimited) && creditAllowed) source = "credit";
    if (userLimited && !creditAllowed) {
      throw new HttpError(429, "今日个人 AI 额度已用完", "user_rate_limited");
    }
    if (orgLimited && !creditAllowed) {
      throw new HttpError(429, "今日组织 AI 额度已用完", "org_rate_limited");
    }
    data.rate_limits.push({
      id: createId("lim"),
      organization_id: organizationId,
      user_id: ctx.auth.user.id,
      scope: "ai.chat",
      date: today,
      count: 1,
      updated_at: new Date().toISOString(),
    });
    return { source, plan, user_limited: userLimited, org_limited: orgLimited };
  });
}

function getPlanLimits(plan, env) {
  if (plan === "team") {
    return { userDaily: env.dailyUserRequestLimit * 10, orgDaily: env.dailyOrgRequestLimit * 20 };
  }
  if (plan === "pro") {
    return { userDaily: env.dailyUserRequestLimit * 5, orgDaily: env.dailyOrgRequestLimit * 5 };
  }
  return { userDaily: env.dailyUserRequestLimit, orgDaily: env.dailyOrgRequestLimit };
}

async function recordUsage(ctx, usage) {
  return ctx.store.write((data) => {
    const promptTokens = Number(usage.prompt_tokens || 0);
    const completionTokens = Number(usage.completion_tokens || 0);
    const totalTokens = Number(usage.total_tokens || promptTokens + completionTokens || 0);
    const item = {
      id: createId("use"),
      ...usage,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      estimated_cost: resolveEstimatedUsageCost(ctx.env, { ...usage, prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens }),
    };
    data.ai_usage.push(item);
    addAudit(data, usage.organization_id, usage.user_id, "ai.chat", "ai_usage", item.id, {
      provider: usage.provider,
      model: usage.model,
      status: usage.status,
      task_type: usage.task_type,
    });
    return item;
  });
}

function getProviderKey(data, organizationId, provider, env) {
  if (env.platformOpenAiKey) return env.platformOpenAiKey;
  const key = data.api_keys.find((item) => item.organization_id === organizationId && item.provider === provider && !item.disabled_at);
  if (!key) return "";
  return decryptSecret(key.encrypted_key, env.encryptionSecret);
}

async function callAiProvider({ env, providerKey, body }) {
  if (env.aiProxyMode === "mock" || !providerKey) {
    const prompt = body.messages.map((item) => item.content).filter(Boolean).join("\n").slice(0, 120);
    const reply = `【云端 AI 代理 Mock】已接收 ${body.messages.length} 条消息。摘要：${prompt || "无内容"}`;
    return { reply, mocked: true, usage: { prompt_tokens: estimateTokens(prompt), completion_tokens: estimateTokens(reply), total_tokens: estimateTokens(prompt) + estimateTokens(reply) } };
  }
  const endpoint = `${env.aiBaseUrl}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.aiRequestTimeoutMs);
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${providerKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: body.model || env.aiModel,
        messages: body.messages,
        temperature: body.temperature ?? 0.3,
      }),
    });
  } catch (error) {
    if (error.name === "AbortError") throw new HttpError(504, "AI 请求超时", "provider_timeout");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(response.status, json.error?.message || "AI 服务返回错误", "provider_error");
  }
  return {
    reply: json.choices?.[0]?.message?.content || "",
    mocked: false,
    usage: json.usage || null,
  };
}

function estimateTokens(value) {
  return Math.max(1, Math.ceil(String(value || "").length / 4));
}

function resolveEstimatedUsageCost(env, usage) {
  const explicit = Number(usage.estimated_cost);
  if (Number.isFinite(explicit) && explicit > 0) return roundCost(explicit);
  if (usage.status !== "success") return 0;
  const rate = resolveAiCostRate(env, usage.provider, usage.model);
  if (!rate) return 0;
  if (typeof rate === "number") return roundCost((Number(usage.total_tokens || 0) / 1000) * rate);
  const promptRate = Number(rate.prompt_per_1k ?? rate.input_per_1k ?? rate.per_1k ?? 0);
  const completionRate = Number(rate.completion_per_1k ?? rate.output_per_1k ?? rate.per_1k ?? promptRate);
  const promptCost = (Number(usage.prompt_tokens || 0) / 1000) * (Number.isFinite(promptRate) ? promptRate : 0);
  const completionCost = (Number(usage.completion_tokens || 0) / 1000) * (Number.isFinite(completionRate) ? completionRate : 0);
  return roundCost(promptCost + completionCost);
}

function resolveAiCostRate(env, provider, model) {
  const rates = env.aiCostRates || {};
  const keys = [
    `${provider || ""}:${model || ""}`,
    String(model || ""),
    String(provider || ""),
    "default",
  ].filter(Boolean);
  for (const key of keys) {
    const value = rates[key];
    if (typeof value === "number") return value;
    if (value && typeof value === "object") return value;
  }
  return null;
}

function roundCost(value) {
  return Math.round(Number(value || 0) * 1_000_000) / 1_000_000;
}

function summarizeUsage(items) {
  const byTaskType = {};
  items.forEach((item) => {
    const key = item.task_type || "chat";
    byTaskType[key] = byTaskType[key] || { request_count: 0, total_tokens: 0, estimated_cost: 0, success_count: 0, failed_count: 0 };
    byTaskType[key].request_count += 1;
    byTaskType[key].total_tokens += Number(item.total_tokens || 0);
    byTaskType[key].estimated_cost += Number(item.estimated_cost || 0);
    if (item.status === "success") byTaskType[key].success_count += 1;
    if (item.status === "failed") byTaskType[key].failed_count += 1;
  });
  return {
    request_count: items.length,
    success_count: items.filter((item) => item.status === "success").length,
    failed_count: items.filter((item) => item.status === "failed").length,
    total_tokens: items.reduce((sum, item) => sum + Number(item.total_tokens || 0), 0),
    estimated_cost: items.reduce((sum, item) => sum + Number(item.estimated_cost || 0), 0),
    by_task_type: byTaskType,
  };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function monthKey() {
  return new Date().toISOString().slice(0, 7);
}

function summarizeUsageBudget(todayItems, monthItems, env) {
  const todayCost = roundCost(todayItems.reduce((sum, item) => sum + Number(item.estimated_cost || 0), 0));
  const monthCost = roundCost(monthItems.reduce((sum, item) => sum + Number(item.estimated_cost || 0), 0));
  return {
    daily_budget_cny: Number(env.aiDailyBudgetCny || 0),
    monthly_budget_cny: Number(env.aiMonthlyBudgetCny || 0),
    today_cost: todayCost,
    month_cost: monthCost,
    daily_ratio: env.aiDailyBudgetCny ? Math.min(1, todayCost / Number(env.aiDailyBudgetCny)) : 0,
    monthly_ratio: env.aiMonthlyBudgetCny ? Math.min(1, monthCost / Number(env.aiMonthlyBudgetCny)) : 0,
    daily_exceeded: Boolean(env.aiDailyBudgetCny && todayCost > Number(env.aiDailyBudgetCny)),
    monthly_exceeded: Boolean(env.aiMonthlyBudgetCny && monthCost > Number(env.aiMonthlyBudgetCny)),
  };
}

function filterByQuery(items, url) {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const taskType = url.searchParams.get("task_type");
  const status = url.searchParams.get("status");
  const action = url.searchParams.get("action");
  return items.filter((item) => {
    const createdAt = item.created_at || "";
    if (from && createdAt < from) return false;
    if (to && createdAt > to) return false;
    if (taskType && item.task_type !== taskType) return false;
    if (status && item.status !== status) return false;
    if (action && item.action !== action) return false;
    return true;
  });
}

function getQueryLimit(url, fallback, max) {
  const value = Number(url.searchParams.get("limit") || fallback);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), max);
}

function friendlyAiError(error) {
  if (error.status === 401) return "AI 接口认证失败，请检查组织接口配置";
  if (error.status === 429) return "AI 请求过于频繁，请稍后再试";
  if (error.status >= 500) return "AI 服务暂时不可用，请稍后再试";
  return error.message || "AI 调用失败";
}

function handleError(response, error) {
  const status = error instanceof HttpError ? error.status : 500;
  const code = error instanceof HttpError ? error.code : "internal_error";
  const message = status >= 500 ? "服务暂时不可用" : error.message;
  const payload = { error: { code, message } };
  if (error instanceof HttpError && error.details && status < 500) {
    payload.error.details = error.details;
  }
  sendJson(response, status, payload);
}

async function recordRequestError(store, ctx, request, error) {
  const status = error instanceof HttpError ? error.status : 500;
  if (status < 500) return;
  await store.write((data) => {
    addSystemEvent(data, ctx?.auth?.organization_id || null, ctx?.auth?.user?.id || null, "error", "http.request.failed", error.message || "接口异常", {
      method: request.method,
      url: request.url,
      status,
    });
  });
}

function logRequest(env, request, response, startedAt) {
  if (!env.requestLogging) return;
  const entry = {
    time: new Date().toISOString(),
    method: request.method,
    url: request.url,
    status: response.statusCode,
    duration_ms: Date.now() - startedAt,
  };
  console.log(JSON.stringify(entry));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
