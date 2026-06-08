import { createId } from "../utils/crypto.js";
import { HttpError, readJsonBody, sendJson } from "../utils/http.js";
import { listPublicCreditLedger } from "./creditLedger.js";

export function createManualPaymentHandlers(options = {}) {
  const {
    adminRoles = new Set(["owner", "admin"]),
    viewerRoles = adminRoles,
    addAudit,
    addSystemEvent,
    applyApprovedPlanOrder,
    getCreditAccount,
    grantCredits,
    loadOrg,
    publicCreditAccount,
  } = options;

  assertDependency(loadOrg, "loadOrg");
  assertDependency(getCreditAccount, "getCreditAccount");
  assertDependency(publicCreditAccount, "publicCreditAccount");
  assertDependency(grantCredits, "grantCredits");
  assertDependency(applyApprovedPlanOrder, "applyApprovedPlanOrder");
  assertDependency(addAudit, "addAudit");
  assertDependency(addSystemEvent, "addSystemEvent");

  async function listManualPaymentOrders(ctx) {
    const { data, organization, membership } = await loadOrg(ctx);
    const isAdmin = viewerRoles.has(membership.role);
    const orders = data.manual_payment_orders
      .filter((item) => item.organization_id === organization.id && (isAdmin || item.user_id === ctx.auth.user.id))
      .slice(-100);
    sendJson(ctx.response, 200, {
      orders: orders.map((item) => publicManualPaymentOrder(item, { admin: isAdmin, userId: ctx.auth.user.id })),
      credits: publicCreditAccount(getCreditAccount(data, organization.id, ctx.auth.user.id)),
      credit_ledger: listPublicCreditLedger(data, {
        organizationId: organization.id,
        userId: ctx.auth.user.id,
        isAdmin,
        limit: 100,
      }),
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
    if (!payerNote && !proofText) {
      throw new HttpError(400, "请填写付款备注或凭证说明，方便管理员核对", "manual_payment_proof_required");
    }
    if (typeof ctx.store.createManualPaymentOrder === "function") {
      const order = await ctx.store.createManualPaymentOrder({
        organizationId: organization.id,
        userId: ctx.auth.user.id,
        paymentPackage,
        paymentChannel,
        payerNote,
        proofText,
      });
      sendJson(ctx.response, 201, { order: publicManualPaymentOrder(order, { userId: ctx.auth.user.id }) });
      return;
    }
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
        package_type: next.package_type,
        amount_cny: next.amount_cny,
        credits: next.credits,
        plan: next.plan || "",
        duration_days: next.duration_days,
        payment_channel: next.payment_channel,
        proof_submitted: Boolean(next.proof_text || next.payer_note),
      });
      addSystemEvent(data, organization.id, ctx.auth.user.id, "info", "billing.manual_order.pending", "收到人工充值订单，等待管理员确认", {
        order_id: next.id,
        package_id: next.package_id,
      });
      return next;
    });
    sendJson(ctx.response, 201, { order: publicManualPaymentOrder(order, { userId: ctx.auth.user.id }) });
  }

  async function reviewManualPaymentOrder(ctx, orderId) {
    const body = await readJsonBody(ctx.request, ctx.env.maxJsonBodyBytes);
    const { organization, membership } = await loadOrg(ctx);
    if (!adminRoles.has(membership.role)) throw new HttpError(403, "只有管理员可以审核充值订单", "forbidden");
    const action = String(body.action || body.status || "").trim().toLowerCase();
    if (!["approve", "approved", "reject", "rejected"].includes(action)) {
      throw new HttpError(400, "审核动作无效", "invalid_manual_payment_review");
    }
    const approved = action === "approve" || action === "approved";
    const reviewNote = String(body.review_note || body.reviewNote || body.note || "").trim().slice(0, 1000);
    if (typeof ctx.store.reviewManualPaymentOrder === "function") {
      let result;
      try {
        result = await ctx.store.reviewManualPaymentOrder({
          organizationId: organization.id,
          orderId,
          userId: ctx.auth.user.id,
          approved,
          reviewNote,
        });
      } catch (error) {
        throw mapManualPaymentRepositoryError(error);
      }
      const refreshedData = await ctx.store.read();
      sendJson(ctx.response, 200, {
        order: publicManualPaymentOrder(result.order, { admin: true }),
        credits: result.creditAccount ? publicCreditAccount(result.creditAccount) : null,
        credit_ledger: listPublicCreditLedger(refreshedData, {
          organizationId: organization.id,
          userId: result.order.user_id,
          isAdmin: true,
          limit: 20,
        }),
      });
      return;
    }
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
      let planOrganization = null;
      if (approved) {
        if (Number(order.credits || 0) > 0) {
          creditAccount = grantCredits(data, {
            organizationId: organization.id,
            userId: order.user_id,
            orderId: order.id,
            amount: Number(order.credits || 0),
            reason: "manual_payment_approved",
          });
          addAudit(data, organization.id, ctx.auth.user.id, "billing.credit.grant", "credit_account", creditAccount.id, {
            order_id: order.id,
            user_id: order.user_id,
            amount: Number(order.credits || 0),
            balance_after: creditAccount.balance,
            review_note: reviewNote,
          });
        }
        if (order.plan) {
          planOrganization = applyApprovedPlanOrder(data, organization.id, order);
          if (planOrganization) {
            addAudit(data, organization.id, ctx.auth.user.id, "billing.plan.manual_activate", "organization", organization.id, {
              order_id: order.id,
              user_id: order.user_id,
              plan: order.plan,
              duration_days: order.duration_days,
              plan_expires_at: planOrganization.plan_expires_at || null,
              review_note: reviewNote,
            });
          }
        }
      }
      addAudit(data, organization.id, ctx.auth.user.id, approved ? "billing.manual_order.approve" : "billing.manual_order.reject", "manual_payment_order", order.id, {
        package_id: order.package_id,
        amount_cny: order.amount_cny,
        credits: order.credits,
        plan: order.plan || "",
        duration_days: order.duration_days,
        payment_channel: order.payment_channel,
        review_note: reviewNote,
      });
      addSystemEvent(data, organization.id, order.user_id, approved ? "info" : "warn", approved ? "billing.manual_order.approved" : "billing.manual_order.rejected", approved ? "人工充值订单已确认" : "人工充值订单已拒绝", {
        order_id: order.id,
        package_id: order.package_id,
        reviewed_by: ctx.auth.user.id,
      });
      return {
        order,
        creditAccount,
        planOrganization,
        creditLedger: listPublicCreditLedger(data, {
          organizationId: organization.id,
          userId: order.user_id,
          isAdmin: true,
          limit: 20,
        }),
      };
    });
    sendJson(ctx.response, 200, {
      order: publicManualPaymentOrder(result.order, { admin: true }),
      credits: result.creditAccount ? publicCreditAccount(result.creditAccount) : null,
      credit_ledger: result.creditLedger,
    });
  }

  return {
    createManualPaymentOrder,
    listManualPaymentOrders,
    reviewManualPaymentOrder,
  };
}

export function getManualPaymentSummary(env = {}) {
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

export function getManualPaymentPackages(env = {}) {
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

export function normalizeManualPaymentPackage(item, index = 0) {
  if (!item || typeof item !== "object") return null;
  const rawPlan = String(item.plan || "").trim();
  const plan = normalizePaidPlan(rawPlan);
  const credits = normalizePositiveInteger(item.credits);
  const durationDays = normalizePositiveInteger(item.duration_days ?? item.durationDays);
  const amountCny = normalizePositiveAmount(item.amount_cny ?? item.amountCny ?? item.amount);
  const type = ["plan", "credits", "mixed"].includes(item.type) ? item.type : plan && credits ? "mixed" : plan ? "plan" : "credits";
  const id = String(item.id || item.package_id || `${type}_${index + 1}`).trim().slice(0, 80);
  if (
    !id
    || (rawPlan && !plan)
    || amountCny <= 0
    || (type === "plan" && !plan)
    || (type === "credits" && credits <= 0)
    || (type === "mixed" && !plan && credits <= 0)
  ) return null;
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

export function resolveManualPaymentPackage(env = {}, packageId) {
  const id = String(packageId || "").trim();
  if (!id) return null;
  return getManualPaymentPackages(env).find((item) => item.id === id) || null;
}

export function normalizePaymentChannel(channel) {
  const value = String(channel || "").trim().toLowerCase();
  return ["wechat", "alipay", "bank", "other"].includes(value) ? value : "";
}

export function publicManualPaymentOrder(order = {}, options = {}) {
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

function normalizePaidPlan(plan) {
  return ["pro", "team"].includes(plan) ? plan : "";
}

function normalizePositiveAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function normalizePositiveInteger(value) {
  const amount = Math.floor(Number(value));
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function assertDependency(fn, name) {
  if (typeof fn !== "function") throw new TypeError(`manualPaymentService requires ${name}`);
}

function mapManualPaymentRepositoryError(error) {
  if (error?.code === "manual_payment_order_not_found") {
    return new HttpError(404, "充值订单不存在", "manual_payment_order_not_found");
  }
  if (error?.code === "manual_payment_order_reviewed") {
    return new HttpError(409, "充值订单已处理", "manual_payment_order_reviewed");
  }
  return error;
}
