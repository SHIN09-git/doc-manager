import assert from "node:assert/strict";
import test from "node:test";

import {
  getManualPaymentPackages,
  getManualPaymentSummary,
  normalizeManualPaymentPackage,
  normalizePaymentChannel,
  publicManualPaymentOrder,
  resolveManualPaymentPackage,
} from "../src/billing/manualPaymentService.js";

test("manual payment summary exposes default packages and configured receiver", () => {
  const summary = getManualPaymentSummary({
    manualPaymentReceiverName: "摹文服务",
    manualPaymentWechatQrUrl: "https://example.com/wechat.png",
    manualPaymentAlipayQrUrl: "https://example.com/alipay.png",
  });

  assert.equal(summary.enabled, true);
  assert.equal(summary.receiver_name, "摹文服务");
  assert.deepEqual(summary.methods.map((item) => item.channel), ["wechat", "alipay"]);
  assert.ok(summary.packages.some((item) => item.id === "credits_1000" && item.credits === 1000));
  assert.ok(summary.packages.some((item) => item.id === "pro_month" && item.plan === "pro"));
});

test("manual payment packages normalize custom values and drop invalid packages", () => {
  const packages = getManualPaymentPackages({
    manualPaymentPackages: [
      { id: "mixed_a", title: "混合包", amount: 88.129, plan: "team", credits: 1500, durationDays: 45 },
      { id: "bad_plan", type: "plan", plan: "enterprise", amount: 1 },
      { package_id: "credits_b", type: "credits", credits: 300.8, amount_cny: 9.9 },
      null,
    ],
  });

  assert.deepEqual(packages, [
    {
      id: "mixed_a",
      title: "混合包",
      type: "mixed",
      amount_cny: 88.13,
      credits: 1500,
      plan: "team",
      duration_days: 45,
    },
    {
      id: "credits_b",
      title: "credits_b",
      type: "credits",
      amount_cny: 9.9,
      credits: 300,
      plan: "",
      duration_days: 0,
    },
  ]);
});

test("manual payment package resolution and payment channel normalization are strict", () => {
  const env = {
    manualPaymentPackages: [
      { id: "credits_only", type: "credits", credits: 200, amount_cny: 12 },
    ],
  };

  assert.equal(resolveManualPaymentPackage(env, "credits_only")?.credits, 200);
  assert.equal(resolveManualPaymentPackage(env, "missing"), null);
  assert.equal(normalizePaymentChannel(" WeChat "), "wechat");
  assert.equal(normalizePaymentChannel("bank"), "bank");
  assert.equal(normalizePaymentChannel("paypal"), "");
});

test("manual payment package normalization rejects impossible shapes", () => {
  assert.equal(normalizeManualPaymentPackage({ type: "credits", credits: 0 }, 0), null);
  assert.equal(normalizeManualPaymentPackage({ type: "plan", plan: "enterprise" }, 0), null);
  assert.equal(normalizeManualPaymentPackage({ id: "", credits: 100 }, 0)?.id, "credits_1");
});

test("public manual payment orders only expose proof text to admins or the payer", () => {
  const order = {
    id: "mop_1",
    organization_id: "org_1",
    user_id: "user_1",
    package_id: "credits_1000",
    package_type: "credits",
    title: "1000 点 AI 额度",
    amount_cny: 50,
    credits: 1000,
    payment_channel: "wechat",
    payer_note: "付款备注",
    proof_text: "截图编号 001",
    status: "pending",
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
  };

  assert.equal(publicManualPaymentOrder(order, { userId: "user_1" }).proof_text, "截图编号 001");
  assert.equal(publicManualPaymentOrder(order, { admin: true }).proof_text, "截图编号 001");
  assert.equal(Object.hasOwn(publicManualPaymentOrder(order, { userId: "user_2" }), "proof_text"), false);
});
