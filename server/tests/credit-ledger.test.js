import { test } from "node:test";
import assert from "node:assert/strict";
import { listPublicCreditLedger } from "../src/billing/creditLedger.js";

test("public credit ledger is organization scoped and hides other users from members", () => {
  const data = {
    users: [
      { id: "usr-1", email: "owner@example.com" },
      { id: "usr-2", email: "member@example.com" },
    ],
    manual_payment_orders: [
      { id: "mop-1", organization_id: "org-1", title: "1000 点 AI 额度", amount_cny: 50, status: "approved" },
      { id: "mop-2", organization_id: "org-2", title: "其他组织订单", amount_cny: 99, status: "approved" },
    ],
    credit_ledger: [
      { id: "led-1", organization_id: "org-1", user_id: "usr-1", order_id: "mop-1", direction: "in", amount: 1000, balance_after: 1000, reason: "manual_payment_approved", created_at: "2026-05-29T01:00:00.000Z" },
      { id: "led-2", organization_id: "org-1", user_id: "usr-2", order_id: null, direction: "out", amount: 1, balance_after: 99, reason: "ai_quota_overage", created_at: "2026-05-29T02:00:00.000Z" },
      { id: "led-3", organization_id: "org-2", user_id: "usr-1", order_id: "mop-2", direction: "in", amount: 3000, balance_after: 3000, reason: "manual_payment_approved", created_at: "2026-05-29T03:00:00.000Z" },
    ],
  };

  const memberRows = listPublicCreditLedger(data, { organizationId: "org-1", userId: "usr-1" });
  assert.equal(memberRows.length, 1);
  assert.equal(memberRows[0].order_title, "1000 点 AI 额度");
  assert.equal(memberRows[0].user_email, "owner@example.com");

  const adminRows = listPublicCreditLedger(data, { organizationId: "org-1", isAdmin: true });
  assert.deepEqual(adminRows.map((item) => item.id), ["led-1", "led-2"]);
});
