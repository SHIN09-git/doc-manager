import assert from "node:assert/strict";
import test from "node:test";
import {
  createCloudPanelRenderer,
  formatCurrencyCny,
  roleLabel,
} from "../src/modules/cloud/cloudPanelRenderer.js";

function element(initial = {}) {
  return {
    value: "",
    disabled: false,
    textContent: "",
    innerHTML: "",
    className: "",
    ...initial,
  };
}

function createEls() {
  return {
    cloudBaseUrlInput: element(),
    cloudStatusLabel: element(),
    cloudLogoutBtn: element(),
    cloudAccountCard: element(),
    featureMapGrid: element(),
    cloudSaveDocBtn: element(),
    cloudPullDocsBtn: element(),
    cloudSaveWriterBtn: element(),
    cloudPullWritersBtn: element(),
    cloudRequestVerifyBtn: element(),
    cloudVerifyEmailBtn: element(),
    cloudLogoutAllBtn: element(),
    cloudExportDataBtn: element(),
    cloudDeleteAccountBtn: element(),
    cloudSendFeedbackBtn: element(),
    cloudManualOrderBtn: element(),
    cloudManualPackageSelect: element(),
    cloudManualPaymentMethodSelect: element(),
    cloudManualOrderNoteInput: element(),
    cloudManualProofInput: element(),
    cloudUsageLabel: element(),
    cloudUsageReport: element(),
    cloudBillingLabel: element(),
    cloudBillingReport: element(),
    cloudManualPaymentMethods: element(),
    cloudCreditBalanceLabel: element(),
  };
}

function createHarness(state = {}) {
  const els = createEls();
  const renderer = createCloudPanelRenderer({
    state,
    els,
    defaultCloudApiBaseUrl: "https://workbench.example/api",
    featureGroups: () => [
      {
        name: "云端与商业化",
        features: [
          {
            id: "billing",
            title: "套餐与充值",
            mode: "云端",
            summary: "查看套餐与额度",
            entry: "云端页",
            outputs: ["费用明细"],
            action: "billing",
          },
        ],
      },
    ],
  });
  return { renderer, els, state };
}

test("role and currency helpers keep cloud copy stable", () => {
  assert.equal(roleLabel("owner"), "所有者");
  assert.equal(roleLabel("admin"), "管理员");
  assert.equal(roleLabel("member"), "成员");
  assert.equal(roleLabel("ops"), "ops");
  assert.equal(formatCurrencyCny(1.23456), "¥1.2346");
  assert.equal(formatCurrencyCny("bad"), "¥0.0000");
});

test("renderCloudPanel shows local mode and disables cloud-only actions", () => {
  const { renderer, els } = createHarness({ cloud: { authenticated: false } });

  renderer.renderCloudPanel();

  assert.equal(els.cloudBaseUrlInput.value, "https://workbench.example/api");
  assert.equal(els.cloudStatusLabel.textContent, "本地模式");
  assert.equal(els.cloudLogoutBtn.disabled, true);
  assert.match(els.cloudAccountCard.innerHTML, /未连接云端/);
  assert.match(els.featureMapGrid.innerHTML, /套餐与充值/);
  assert.equal(els.cloudSaveDocBtn.disabled, true);
  assert.equal(els.cloudManualPackageSelect.disabled, true);
  assert.equal(els.cloudUsageLabel.textContent, "未登录");
  assert.equal(els.cloudBillingLabel.textContent, "未登录");
  assert.match(els.cloudManualPackageSelect.innerHTML, /Pro 月度会员/);
  assert.match(els.cloudManualPaymentMethodSelect.innerHTML, /微信/);
  assert.match(els.cloudManualPaymentMethods.innerHTML, /未配置收款码/);
});

test("renderCloudPanel shows authenticated usage, billing, and manual recharge details", () => {
  const { renderer, els } = createHarness({
    cloud: {
      authenticated: true,
      user: { email: "owner@example.com", email_verified_at: "2026-06-01T00:00:00.000Z" },
      activeOrganization: { name: "示例工作区", plan: "pro" },
      membership: { role: "admin" },
      usage: {
        request_count: 3,
        total_tokens: 12000,
        estimated_cost: 0.42,
        by_task_type: {
          draft: { request_count: 2, total_tokens: 8000 },
        },
      },
      limits: { plan: "pro", user_daily: 100, org_daily: 500 },
      billing: {
        organization: { plan: "pro" },
        limits: { user_daily: 100, org_daily: 500 },
        usage: { request_count: 3, failed_count: 1, estimated_cost: 0.42 },
        credits: { balance: 980 },
        manual_payment: {
          receiver_name: "摹文拟笔",
          packages: [
            { id: "team_month", title: "Team 月度会员", amount_cny: 99, plan: "team", duration_days: 30, credits: 0 },
          ],
          methods: [
            { channel: "alipay", label: "支付宝", qr_url: "https://example.com/alipay.png" },
          ],
        },
        manual_orders: [
          { id: "order-1", status: "approved", title: "Team 月度会员", amount_cny: 99, created_at: "2026-06-01T00:00:00.000Z" },
        ],
        credit_ledger: [
          { event_type: "manual_recharge", amount: 980, balance_after: 980, created_at: "2026-06-01T00:00:00.000Z" },
        ],
      },
    },
  });

  renderer.renderCloudPanel();

  assert.equal(els.cloudStatusLabel.textContent, "已登录");
  assert.equal(els.cloudSaveDocBtn.disabled, false);
  assert.match(els.cloudAccountCard.innerHTML, /owner@example.com/);
  assert.match(els.cloudAccountCard.innerHTML, /管理员/);
  assert.equal(els.cloudUsageLabel.textContent, "3 次请求");
  assert.match(els.cloudUsageReport.innerHTML, /套餐：pro/);
  assert.match(els.cloudUsageReport.innerHTML, /draft：2 次/);
  assert.equal(els.cloudBillingLabel.textContent, "套餐：pro");
  assert.match(els.cloudBillingReport.textContent, /AI 额度：980 点/);
  assert.match(els.cloudBillingReport.textContent, /Team 月度会员/);
  assert.equal(els.cloudCreditBalanceLabel.textContent, "额度：980 点");
  assert.match(els.cloudManualPackageSelect.innerHTML, /Team 月度会员/);
  assert.match(els.cloudManualPaymentMethodSelect.innerHTML, /支付宝/);
  assert.match(els.cloudManualPaymentMethods.innerHTML, /https:\/\/example.com\/alipay\.png/);
  assert.match(els.cloudManualPaymentMethods.innerHTML, /收款方：摹文拟笔/);
});

test("renderCloudManualPaymentMethods follows the selected package and method", () => {
  const { renderer, els } = createHarness({
    cloud: {
      billing: {
        manual_payment: {
          packages: [
            { id: "pro", title: "Pro", amount_cny: 29, plan: "pro", duration_days: 30, credits: 0 },
            { id: "credits", title: "额度包", amount_cny: 50, credits: 1000 },
          ],
          methods: [
            { channel: "wechat", label: "微信", qr_url: "" },
            { channel: "alipay", label: "支付宝", qr_url: "https://example.com/qr.png" },
          ],
        },
      },
    },
  });
  els.cloudManualPackageSelect.value = "credits";
  els.cloudManualPaymentMethodSelect.value = "alipay";

  renderer.renderCloudManualPaymentMethods();

  assert.match(els.cloudManualPaymentMethods.innerHTML, /额度包/);
  assert.match(els.cloudManualPaymentMethods.innerHTML, /https:\/\/example.com\/qr\.png/);
  assert.match(els.cloudManualPaymentMethods.innerHTML, /支付宝/);
});
