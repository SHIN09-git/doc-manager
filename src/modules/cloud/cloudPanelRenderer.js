import {
  formatCreditLedgerSummary,
  formatManualOrderSummary,
  formatManualPaymentPackage,
} from "./billingFormatters.js";
import { getFeatureGroups } from "../product/featureCatalog.js";
import { escapeHtml } from "../../utils/helpers.js";

export function roleLabel(role) {
  const value = String(role || "member");
  if (value === "owner") return "所有者";
  if (value === "admin") return "管理员";
  if (value === "operator") return "运营只读";
  if (value === "member") return "成员";
  return value;
}

export function formatCurrencyCny(value) {
  const amount = Number(value || 0);
  return `¥${(Number.isFinite(amount) ? amount : 0).toFixed(4)}`;
}

export function createCloudPanelRenderer(deps = {}) {
  const {
    state = {},
    els = {},
    defaultCloudApiBaseUrl = "",
    featureGroups = getFeatureGroups,
  } = deps;

  function renderCloudPanel() {
    if (!els.cloudBaseUrlInput) return;
    const cloud = state.cloud || {};
    const authenticated = Boolean(cloud.authenticated && cloud.user);
    const emailVerified = Boolean(cloud.user?.email_verified_at);
    const orgName = cloud.activeOrganization?.name || "未选择组织";
    els.cloudBaseUrlInput.value = cloud.apiBaseUrl || defaultCloudApiBaseUrl;
    els.cloudStatusLabel.textContent = authenticated ? "已登录" : "本地模式";
    els.cloudStatusLabel.className = `status-pill ${authenticated ? "ready" : ""}`;
    els.cloudLogoutBtn.disabled = !authenticated;
    els.cloudAccountCard.innerHTML = authenticated
      ? `<strong>${escapeHtml(cloud.user.email || "")}</strong><span>${escapeHtml(orgName)} · ${escapeHtml(roleLabel(cloud.membership?.role || "owner"))} · ${emailVerified ? "邮箱已验证" : "邮箱未验证"}</span>`
      : "<strong>未连接云端</strong><span>本地数据仍可正常使用，登录后可查看套餐、额度、费用明细并同步个人数据。</span>";
    renderFeatureMap();
    syncAuthenticatedControls(authenticated);
    renderUsage(authenticated, cloud);
    renderCloudBilling(authenticated);
  }

  function renderFeatureMap() {
    if (!els.featureMapGrid) return;
    els.featureMapGrid.innerHTML = featureGroups().map((group) => `
      <section class="feature-map-group" aria-label="${escapeHtml(group.name)}">
        <div class="feature-map-group-title">${escapeHtml(group.name)}</div>
        ${group.features.map((feature) => `
          <article class="feature-card" data-feature-id="${escapeHtml(feature.id)}">
            <div class="feature-card-head">
              <strong>${escapeHtml(feature.title)}</strong>
              <span>${escapeHtml(feature.mode)}</span>
            </div>
            <p>${escapeHtml(feature.summary)}</p>
            <div class="feature-card-meta">入口：${escapeHtml(feature.entry)}</div>
            <div class="feature-card-tags">
              ${feature.outputs.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
            </div>
            <button type="button" data-feature-action="${escapeHtml(feature.action)}">进入</button>
          </article>`).join("")}
      </section>`).join("");
  }

  function syncAuthenticatedControls(authenticated) {
    [
      els.cloudSaveDocBtn,
      els.cloudPullDocsBtn,
      els.cloudSaveWriterBtn,
      els.cloudPullWritersBtn,
      els.cloudRequestVerifyBtn,
      els.cloudVerifyEmailBtn,
      els.cloudLogoutAllBtn,
      els.cloudExportDataBtn,
      els.cloudDeleteAccountBtn,
      els.cloudSendFeedbackBtn,
      els.cloudManualOrderBtn,
    ].forEach((button) => {
      if (button) button.disabled = !authenticated;
    });
    [
      els.cloudManualPackageSelect,
      els.cloudManualPaymentMethodSelect,
      els.cloudManualOrderNoteInput,
      els.cloudManualProofInput,
    ].forEach((field) => {
      if (field) field.disabled = !authenticated;
    });
  }

  function renderUsage(authenticated, cloud) {
    const usage = cloud.usage;
    if (usage) {
      els.cloudUsageLabel.textContent = `${usage.request_count || usage.requests || 0} 次请求`;
      const limits = cloud.limits;
      const taskRows = Object.entries(usage.by_task_type || {})
        .map(([task, item]) => `<div>${escapeHtml(task)}：${item.request_count || 0} 次 · ${Number(item.total_tokens || 0).toLocaleString("zh-CN")} 字数估算</div>`)
        .join("");
      els.cloudUsageReport.innerHTML = [
        limits ? `<div>套餐：${escapeHtml(limits.plan || "free")} · 个人日限 ${limits.user_daily} · 组织日限 ${limits.org_daily}</div>` : "",
        `<div>总字数：${Number(usage.total_tokens || 0).toLocaleString("zh-CN")}</div>`,
        `<div>预估费用：${formatCurrencyCny(usage.estimated_cost || usage.estimated_cost_cents || 0)}</div>`,
        taskRows,
      ].join("");
      return;
    }
    els.cloudUsageLabel.textContent = authenticated ? "等待统计" : "未登录";
    els.cloudUsageReport.textContent = authenticated ? "暂无本账号用量记录。" : "登录云端后显示本账号 AI 调用用量和费用估算。";
  }

  function renderCloudBilling(authenticated) {
    if (!els.cloudBillingReport) return;
    const billing = state.cloud?.billing || null;
    renderCloudManualRecharge(authenticated, billing);
    if (!authenticated) {
      els.cloudBillingLabel.textContent = "未登录";
      els.cloudBillingReport.textContent = "登录云端后显示套餐、可用额度和充值订单。";
      return;
    }
    if (!billing) {
      els.cloudBillingLabel.textContent = "等待统计";
      els.cloudBillingReport.textContent = "刷新云端状态后显示套餐、额度和充值订单。";
      return;
    }
    const plan = billing.organization?.plan || "free";
    const manualOrderRows = Array.isArray(billing.manual_orders) && billing.manual_orders.length
      ? billing.manual_orders.slice(-5).reverse().map((item) => formatManualOrderSummary(item)).join("\n")
      : "暂无人工充值订单。";
    const creditLedgerRows = Array.isArray(billing.credit_ledger) && billing.credit_ledger.length
      ? billing.credit_ledger.slice(-8).reverse().map((item) => formatCreditLedgerSummary(item)).join("\n")
      : "暂无额度明细。";
    els.cloudBillingLabel.textContent = `套餐：${plan}`;
    els.cloudBillingReport.textContent = [
      `当前套餐：${plan}`,
      `个人日限：${billing.limits?.user_daily ?? "-"} · 组织日限：${billing.limits?.org_daily ?? "-"}`,
      `今日请求：${billing.usage?.request_count || 0} 次 · 失败：${billing.usage?.failed_count || 0} 次`,
      `今日预估费用：${formatCurrencyCny(billing.usage?.estimated_cost || 0)}`,
      `AI 额度：${Number(billing.credits?.balance || 0).toLocaleString("zh-CN")} 点`,
      "",
      "我的充值订单：",
      manualOrderRows,
      "",
      "额度明细：",
      creditLedgerRows,
    ].join("\n");
  }

  function renderCloudManualRecharge(authenticated, billing) {
    const manual = billing?.manual_payment || {};
    const packages = getManualPackages(manual);
    const currentPackage = els.cloudManualPackageSelect?.value || packages[0]?.id || "";
    if (els.cloudManualPackageSelect) {
      els.cloudManualPackageSelect.innerHTML = packages.map((item) =>
        `<option value="${escapeHtml(item.id)}">${escapeHtml(formatManualPaymentPackage(item))}</option>`).join("");
      els.cloudManualPackageSelect.value = packages.some((item) => item.id === currentPackage) ? currentPackage : packages[0]?.id || "";
      els.cloudManualPackageSelect.disabled = !authenticated;
    }
    const methods = getManualMethods(manual);
    if (els.cloudManualPaymentMethodSelect) {
      const currentMethod = els.cloudManualPaymentMethodSelect.value || "wechat";
      els.cloudManualPaymentMethodSelect.innerHTML = methods.map((item) =>
        `<option value="${escapeHtml(item.channel)}">${escapeHtml(item.label || item.channel)}</option>`).join("");
      els.cloudManualPaymentMethodSelect.value = methods.some((item) => item.channel === currentMethod) ? currentMethod : methods[0]?.channel || "wechat";
      els.cloudManualPaymentMethodSelect.disabled = !authenticated;
    }
    if (els.cloudCreditBalanceLabel) {
      els.cloudCreditBalanceLabel.textContent = `额度：${Number(billing?.credits?.balance || 0).toLocaleString("zh-CN")} 点`;
    }
    if (els.cloudManualOrderBtn) els.cloudManualOrderBtn.disabled = !authenticated;
    if (els.cloudManualOrderNoteInput) els.cloudManualOrderNoteInput.disabled = !authenticated;
    if (els.cloudManualProofInput) els.cloudManualProofInput.disabled = !authenticated;
    renderCloudManualPaymentMethods();
  }

  function renderCloudManualPaymentMethods() {
    if (!els.cloudManualPaymentMethods) return;
    const billing = state.cloud?.billing || null;
    const manual = billing?.manual_payment || {};
    const packages = getManualPackages(manual);
    const methods = getManualMethods(manual);
    const selectedPackageId = els.cloudManualPackageSelect?.value || packages[0]?.id || "";
    const selectedPackage = packages.find((item) => item.id === selectedPackageId) || packages[0] || null;
    const selected = els.cloudManualPaymentMethodSelect?.value || methods[0]?.channel || "wechat";
    const method = methods.find((item) => item.channel === selected) || methods[0] || { channel: selected, label: selected, qr_url: "" };
    const receiver = manual.receiver_name ? `<span>收款方：${escapeHtml(manual.receiver_name)}</span>` : "";
    const packageHint = selectedPackage ? `<span>本次应付：¥${escapeHtml(selectedPackage.amount_cny ?? 0)} · ${escapeHtml(formatManualPaymentPackage(selectedPackage))}</span>` : "";
    const qr = method.qr_url
      ? `<img src="${escapeHtml(method.qr_url)}" alt="${escapeHtml(method.label || method.channel)} 收款码">`
      : `<div class="manual-payment-placeholder">未配置收款码，请向管理员索取。</div>`;
    els.cloudManualPaymentMethods.innerHTML = `
      <div class="manual-payment-method">
        ${qr}
        <div>
          <strong>${escapeHtml(method.label || method.channel || "支付方式")}</strong>
          ${receiver}
          ${packageHint}
          <span>付款后提交订单，管理员核对后生效。</span>
        </div>
      </div>`;
  }

  return {
    renderCloudPanel,
    renderFeatureMap,
    renderCloudBilling,
    renderCloudManualRecharge,
    renderCloudManualPaymentMethods,
  };
}

function getManualPackages(manual = {}) {
  return Array.isArray(manual.packages) && manual.packages.length
    ? manual.packages
    : [
      { id: "pro_month", title: "Pro 月度会员", amount_cny: 29, plan: "pro", duration_days: 30, credits: 0 },
      { id: "credits_1000", title: "1000 点 AI 额度", amount_cny: 50, plan: "", duration_days: 0, credits: 1000 },
    ];
}

function getManualMethods(manual = {}) {
  return Array.isArray(manual.methods) && manual.methods.length
    ? manual.methods
    : [
      { channel: "wechat", label: "微信", qr_url: "" },
      { channel: "alipay", label: "支付宝", qr_url: "" },
    ];
}
