import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatCreditLedgerReason,
  formatCreditLedgerSummary,
  formatManualOrderStatus,
  formatManualPaymentChannel,
  formatManualPaymentPackage,
} from "../src/modules/cloud/billingFormatters.js";

test("billing formatters keep manual recharge copy consistent", () => {
  assert.equal(formatManualPaymentPackage({
    id: "credits_1000",
    title: "1000 点 AI 额度",
    amount_cny: 50,
    credits: 1000,
  }), "1000 点 AI 额度 · ¥50 · 1,000 点");
  assert.equal(formatManualPaymentPackage({
    title: "Pro 月度会员",
    amount_cny: 29,
    plan: "pro",
    duration_days: 30,
  }), "Pro 月度会员 · ¥29 · PRO 30天");
  assert.equal(formatManualOrderStatus("approved"), "已确认");
  assert.equal(formatManualOrderStatus("pending"), "待确认");
  assert.equal(formatManualPaymentChannel("alipay"), "支付宝");
});

test("credit ledger formatter labels recharge and overage records", () => {
  assert.equal(formatCreditLedgerReason("manual_payment_approved"), "人工充值确认");
  assert.equal(formatCreditLedgerReason("ai_quota_overage"), "AI 超额调用");
  assert.equal(formatCreditLedgerSummary({
    direction: "out",
    amount: 2,
    balance_after: 98,
    reason: "ai_quota_overage",
    created_at: "2026-05-29T00:00:00.000Z",
  }), "扣减 -2 点 · 余额 98 · AI 超额调用 · 2026-05-29T00:00:00.000Z");
});
