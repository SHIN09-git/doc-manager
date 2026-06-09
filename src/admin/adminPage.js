import {
  formatCreditLedgerDirection,
  formatCreditLedgerReason,
  formatManualOrderStatus,
  formatManualPaymentChannel,
} from "../modules/cloud/billingFormatters.js";
import { copyTextToClipboard, sanitizeUrl } from "../utils/helpers.js";
import { buildCsv } from "./adminCsv.js";
import { triggerDownload } from "./adminDownload.js";

const LOCAL_API_BASE_URL = "http://127.0.0.1:8787/api";
const DEFAULT_API_BASE_URL = getDefaultApiBaseUrl();
const API_BASE_STORAGE_KEY = "mowen-admin:api-base-url";
const ADMIN_AUDIT_FILTERS_STORAGE_KEY = "mowen-admin:audit-filters";
const DEFAULT_TOKEN_COST_PER_1K = 0.01;
const ADMIN_ACCESS_ROLES = new Set(["owner", "admin", "operator"]);
const ADMIN_WRITE_ROLES = new Set(["owner", "admin"]);

const state = {
  apiBaseUrl: DEFAULT_API_BASE_URL,
  authenticated: false,
  user: null,
  organizations: [],
  activeOrganization: null,
  membership: null,
  dashboard: null,
  usage: [],
  audit: [],
  apiKeys: [],
  billing: null,
  adminPreferences: null,
  preferencesCloudAvailable: false,
  invitationTokens: {},
  visibleUsage: [],
  visibleAudit: [],
  visibleFeedbacks: [],
  visibleEmails: [],
  visiblePayments: [],
  visibleErrors: [],
  errorLevelFilter: "",
  errorSlaFilter: "",
  feedbackSlaFilter: "",
  savedAuditFilters: [],
  view: "overview",
};

const els = {};

document.addEventListener("DOMContentLoaded", async () => {
  bindElements();
  bindEvents();
  state.apiBaseUrl = normalizeBaseUrl(localStorage.getItem(API_BASE_STORAGE_KEY) || DEFAULT_API_BASE_URL);
  state.savedAuditFilters = loadSavedAuditFilters();
  els.adminBaseUrlInput.value = state.apiBaseUrl;
  await refreshSession({ silent: true });
});

function bindElements() {
  [
    "adminTitle",
    "adminSubtitle",
    "adminBaseUrlInput",
    "adminRefreshBtn",
    "adminLogoutBtn",
    "adminLoginView",
    "adminDeniedView",
    "adminDeniedText",
    "adminMainView",
    "adminEmailInput",
    "adminPasswordInput",
    "adminLoginBtn",
    "adminLoginHint",
    "adminSummary",
    "adminFromInput",
    "adminToInput",
    "adminTaskInput",
    "adminActionInput",
    "adminEmailStatusSelect",
    "adminNav",
    "adminPanelTitle",
    "adminExportOrgBtn",
    "adminExportUsageBtn",
    "adminExportAuditBtn",
    "adminDeletionRequestBtn",
    "adminContent",
    "adminToastRegion",
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  els.adminBaseUrlInput.addEventListener("change", () => {
    state.apiBaseUrl = normalizeBaseUrl(els.adminBaseUrlInput.value);
    els.adminBaseUrlInput.value = state.apiBaseUrl;
    localStorage.setItem(API_BASE_STORAGE_KEY, state.apiBaseUrl);
    toast("API 地址已保存");
  });
  els.adminLoginBtn.addEventListener("click", login);
  els.adminPasswordInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") login();
  });
  els.adminRefreshBtn.addEventListener("click", () => refreshAdminData());
  els.adminLogoutBtn.addEventListener("click", logout);
  els.adminNav.addEventListener("click", (event) => {
    const button = event.target.closest("[data-admin-view]");
    if (!button) return;
    state.view = button.dataset.adminView || "overview";
    renderAdmin();
  });
  [
    els.adminFromInput,
    els.adminToInput,
    els.adminTaskInput,
    els.adminActionInput,
    els.adminEmailStatusSelect,
  ].forEach((input) => input.addEventListener("change", () => refreshAdminData({ silent: true })));
  els.adminTaskInput.addEventListener("input", debounce(() => refreshAdminData({ silent: true }), 250));
  els.adminActionInput.addEventListener("input", debounce(() => refreshAdminData({ silent: true }), 250));
  els.adminExportOrgBtn.addEventListener("click", exportOrganizationData);
  els.adminExportUsageBtn.addEventListener("click", () => exportCsv("mowen-usage.csv", state.usage));
  els.adminExportAuditBtn.addEventListener("click", () => exportCsv("mowen-audit.csv", state.audit));
  els.adminDeletionRequestBtn.addEventListener("click", requestOrganizationDeletion);
  els.adminContent.addEventListener("click", handleContentAction);
  els.adminContent.addEventListener("submit", handleContentSubmit);
  els.adminContent.addEventListener("change", handleContentChange);
}

async function refreshSession(options = {}) {
  try {
    const data = await apiRequest("/me", { method: "GET" });
    applySession(data);
    if (!state.authenticated) {
      renderGate();
      if (!options.silent) toast("请先登录后台账号", "warn");
      return;
    }
    if (!canAccessAdmin()) {
      renderDenied();
      return;
    }
    await refreshAdminData({ silent: true });
  } catch (error) {
    state.authenticated = false;
    state.user = null;
    state.activeOrganization = null;
    state.membership = null;
    renderGate();
    if (!options.silent) toast(`连接云端失败：${error.message}`, "error");
  }
}

async function login() {
  await withLoading(els.adminLoginBtn, "登录中", async () => {
    state.apiBaseUrl = normalizeBaseUrl(els.adminBaseUrlInput.value);
    localStorage.setItem(API_BASE_STORAGE_KEY, state.apiBaseUrl);
    const data = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: els.adminEmailInput.value.trim(),
        password: els.adminPasswordInput.value,
      }),
    });
    applySession(data);
    if (!canAccessAdmin()) {
      renderDenied();
      toast("当前账号没有后台权限", "warn");
      return;
    }
    await refreshAdminData({ silent: true });
    toast("已进入管理后台");
  });
}

async function logout() {
  await withLoading(els.adminLogoutBtn, "退出中", async () => {
    await apiRequest("/auth/logout", { method: "POST" }).catch(() => null);
    state.authenticated = false;
    state.user = null;
    state.activeOrganization = null;
    state.membership = null;
    state.dashboard = null;
    state.usage = [];
    state.audit = [];
    state.apiKeys = [];
    state.billing = null;
    state.adminPreferences = null;
    state.preferencesCloudAvailable = false;
    state.invitationTokens = {};
    state.visibleUsage = [];
    state.visibleAudit = [];
    state.visibleFeedbacks = [];
    state.visibleEmails = [];
    state.visiblePayments = [];
    state.visibleErrors = [];
    state.errorLevelFilter = "";
    state.errorSlaFilter = "";
    state.feedbackSlaFilter = "";
    renderGate();
    toast("已退出后台");
  });
}

async function refreshAdminData(options = {}) {
  if (!state.authenticated || !canAccessAdmin()) {
    renderGate();
    return;
  }
  const runner = async () => {
    const [dashboard, usage, audit, apiKeys, billing, preferences] = await Promise.all([
      apiRequest("/admin/dashboard", { method: "GET" }),
      apiRequest(`/usage/history${buildUsageQuery()}`, { method: "GET" }).catch(() => ({ usage: [] })),
      apiRequest(`/audit${buildAuditQuery()}`, { method: "GET" }).catch(() => ({ audit_logs: [] })),
      apiRequest("/api-keys", { method: "GET" }).catch(() => ({ api_keys: [] })),
      apiRequest("/billing/summary", { method: "GET" }).catch(() => null),
      apiRequest("/admin/preferences", { method: "GET" }).catch(() => null),
    ]);
    state.dashboard = dashboard;
    state.usage = Array.isArray(usage.usage) ? usage.usage : [];
    state.audit = Array.isArray(audit.audit_logs) ? audit.audit_logs : [];
    state.apiKeys = Array.isArray(apiKeys.api_keys) ? apiKeys.api_keys : [];
    state.billing = billing;
    applyAdminPreferences(preferences?.preferences);
    renderAdmin();
    if (!options.silent) toast("后台数据已刷新");
  };
  if (options.silent) await runner();
  else await withLoading(els.adminRefreshBtn, "刷新中", runner);
}

function renderGate() {
  els.adminLoginView.hidden = false;
  els.adminDeniedView.hidden = true;
  els.adminMainView.hidden = true;
  els.adminLogoutBtn.disabled = true;
  els.adminSubtitle.textContent = "连接云端后查看组织、成员、接口、用量、审计、反馈、邮件、账单和错误事件。";
}

function renderDenied() {
  els.adminLoginView.hidden = true;
  els.adminDeniedView.hidden = false;
  els.adminMainView.hidden = true;
  els.adminLogoutBtn.disabled = false;
  els.adminDeniedText.textContent = `${state.user?.email || "当前账号"} 不是组织后台成员。`;
  els.adminSubtitle.textContent = "当前账号没有进入管理后台的权限。";
}

function canAccessAdmin() {
  return ADMIN_ACCESS_ROLES.has(state.membership?.role || "");
}

function canManageAdmin() {
  return ADMIN_WRITE_ROLES.has(state.membership?.role || "");
}

function roleLabel(role) {
  const value = String(role || "member");
  if (value === "owner") return "所有者";
  if (value === "admin") return "管理员";
  if (value === "operator") return "运营只读";
  if (value === "member") return "成员";
  return value;
}

function renderAdmin() {
  const dashboard = state.dashboard || {};
  const org = dashboard.organization || state.activeOrganization || {};
  const members = Array.isArray(dashboard.members) ? dashboard.members : [];
  const feedbacks = Array.isArray(dashboard.feedbacks) ? dashboard.feedbacks : [];
  const emails = filterEmails(Array.isArray(dashboard.email_deliveries) ? dashboard.email_deliveries : []);
  const errors = Array.isArray(dashboard.recent_errors) ? dashboard.recent_errors : [];
  const payments = getBillingWebhooks(dashboard);
  const currentUsage = dashboard.usage || {};

  els.adminLoginView.hidden = true;
  els.adminDeniedView.hidden = true;
  els.adminMainView.hidden = false;
  els.adminLogoutBtn.disabled = false;
  els.adminSubtitle.textContent = `${org.name || "未命名组织"} · ${org.plan || "free"} · ${state.user?.email || ""}`;
  els.adminExportOrgBtn.disabled = !canManageAdmin();
  els.adminDeletionRequestBtn.disabled = !canManageAdmin();
  els.adminSummary.innerHTML = [
    metricCard(org.plan || "free", "当前套餐"),
    metricCard(members.length, "组织成员"),
    metricCard(currentUsage.request_count || 0, "今日请求"),
    metricCard(currentUsage.failed_count || 0, "今日失败"),
    metricCard(feedbacks.length, "反馈记录"),
    metricCard(state.apiKeys.length, "接口配置"),
  ].join("");

  els.adminNav.querySelectorAll("[data-admin-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.adminView === state.view);
  });

  const titles = {
    overview: "概览",
    members: "成员",
    keys: "接口",
    usage: "用量",
    audit: "审计",
    feedback: "反馈",
    email: "邮件投递",
    billing: "账单",
    errors: "错误",
  };
  els.adminPanelTitle.textContent = titles[state.view] || "概览";
  els.adminDeletionRequestBtn.hidden = state.view !== "overview" || !canManageAdmin();

  if (state.view === "members") return renderMembers();
  if (state.view === "keys") return renderApiKeys();
  if (state.view === "usage") return renderUsage();
  if (state.view === "audit") return renderAudit();
  if (state.view === "feedback") return renderFeedback();
  if (state.view === "email") return renderEmail(emails);
  if (state.view === "billing") return renderBilling(payments);
  if (state.view === "errors") return renderErrors(errors);
  renderOverview();
}

function renderOverview() {
  const dashboard = state.dashboard || {};
  const org = dashboard.organization || state.activeOrganization || {};
  const emails = filterEmails(Array.isArray(dashboard.email_deliveries) ? dashboard.email_deliveries : []);
  const errors = Array.isArray(dashboard.recent_errors) ? dashboard.recent_errors : [];
  const feedbacks = Array.isArray(dashboard.feedbacks) ? dashboard.feedbacks : [];
  const currentUsage = dashboard.usage || {};
  const feedbackSlaRisk = countSlaRisks(feedbacks);
  const errorSlaRisk = countSlaRisks(errors);
  const organizationBlock = canManageAdmin()
    ? `<form class="admin-inline-form" data-admin-form="org-name">
        <label>
          <span>组织名称</span>
          <input name="name" type="text" maxlength="120" value="${escapeHtml(org.name || "")}" required />
        </label>
        <button type="submit">保存组织名称</button>
      </form>`
    : `<div class="cloud-admin-list">
        ${row(org.name || "未命名组织", "组织名称")}
        ${row("只读", "当前权限")}
      </div>`;
  els.adminContent.innerHTML = `<div class="cloud-admin-grid">
    <section class="cloud-admin-card">
      <h3>组织</h3>
      ${organizationBlock}
      <div class="cloud-admin-list">
        ${row(org.plan || "free", "当前套餐")}
        ${row(roleLabel(state.membership?.role || "-"), "我的角色")}
      </div>
    </section>
    <section class="cloud-admin-card">
      <h3>运营状态</h3>
      <div class="cloud-admin-list">
        ${row(currentUsage.request_count || 0, "今日请求")}
        ${row(currentUsage.failed_count || 0, "今日失败")}
        ${row(emails.length, "邮件投递")}
        ${row(errors.length, "错误事件")}
        ${row(feedbackSlaRisk.overdue + errorSlaRisk.overdue, "SLA 已超时")}
        ${row(feedbackSlaRisk.dueSoon + errorSlaRisk.dueSoon, "SLA 临近")}
      </div>
      <button type="button" data-admin-action="copy-ops-report">复制运营日报</button>
    </section>
  </div>`;
}

function renderMembers() {
  const dashboard = state.dashboard || {};
  const members = Array.isArray(dashboard.members) ? dashboard.members : [];
  const invitations = Array.isArray(dashboard.invitations) ? dashboard.invitations : [];
  const memberRows = members.map(renderMemberRow);
  const invitationRows = invitations.map(renderInvitationRow);
  const inviteForm = canManageAdmin()
    ? `<form class="admin-inline-form admin-inline-form-wide" data-admin-form="invite-member">
        <label>
          <span>邀请邮箱</span>
          <input name="email" type="email" placeholder="name@example.com" required />
        </label>
        <label>
          <span>角色</span>
          <select name="role">
            <option value="member">成员</option>
            <option value="operator">运营只读</option>
            <option value="admin">管理员</option>
          </select>
        </label>
        <button type="submit">发送邀请</button>
      </form>`
    : `<p class="admin-inline-note">当前为运营只读权限，可查看成员和邀请状态，不能邀请或调整角色。</p>`;
  els.adminContent.innerHTML = `<div class="admin-action-stack">
    ${inviteForm}
    <div class="cloud-admin-list">
      ${memberRows.length ? memberRows.join("") : emptyRow("暂无成员")}
      ${invitationRows.length ? invitationRows.join("") : ""}
    </div>
  </div>`;
}

function renderMemberRow(member) {
  const email = member.user?.email || member.user_id || "";
  const isOwner = member.role === "owner";
  const isSelf = member.user_id && member.user_id === state.user?.id;
  const controls = isOwner
    ? `<span class="admin-row-note">拥有者</span>`
    : !canManageAdmin()
      ? `<span class="admin-row-note">只读</span>`
      : `<span class="cloud-row-actions">
        <select aria-label="成员角色" data-member-role="${escapeHtml(member.id)}">
          <option value="member"${member.role === "member" ? " selected" : ""}>成员</option>
          <option value="operator"${member.role === "operator" ? " selected" : ""}>运营只读</option>
          <option value="admin"${member.role === "admin" ? " selected" : ""}>管理员</option>
        </select>
        <button type="button" data-admin-action="member-role" data-member-id="${escapeHtml(member.id)}">保存角色</button>
        ${isSelf ? "" : `<button type="button" data-admin-action="member-remove" data-member-id="${escapeHtml(member.id)}">移除</button>`}
      </span>`;
  return `<div class="admin-member-row" data-member-row="${escapeHtml(member.id)}">
    <strong>${escapeHtml(email)}</strong>
    <span>${escapeHtml(roleLabel(member.role || "member"))} · ${escapeHtml(member.created_at || "")}</span>
    ${controls}
  </div>`;
}

function renderInvitationRow(invitation) {
  const status = invitation.accepted_at ? "已接受" : "待接受";
  const token = state.invitationTokens[invitation.id] || invitation.token || "";
  return `<div class="admin-member-row" data-invitation-row="${escapeHtml(invitation.id)}">
    <strong>${escapeHtml(invitation.email || "")}</strong>
    <span>${escapeHtml(roleLabel(invitation.role || "member"))} · ${status} · ${escapeHtml(invitation.expires_at || "")}</span>
    ${canManageAdmin() ? `<span class="cloud-row-actions">
      <button type="button" data-admin-action="invite-resend" data-invitation-id="${escapeHtml(invitation.id)}">重发</button>
      <button type="button" data-admin-action="invite-copy" data-invitation-id="${escapeHtml(invitation.id)}"${token ? "" : " disabled"}>复制口令</button>
      <button type="button" data-admin-action="invite-revoke" data-invitation-id="${escapeHtml(invitation.id)}">撤销</button>
    </span>` : `<span class="admin-row-note">只读</span>`}
  </div>`;
}

function renderApiKeys() {
  const rows = state.apiKeys.map((key) => `<div class="admin-member-row">
    <strong>${escapeHtml(key.provider || "")}</strong>
    <span>${escapeHtml(key.key_hint || "已保存")} · ${escapeHtml(key.updated_at || key.created_at || "")}</span>
    ${canManageAdmin() ? `<span class="cloud-row-actions">
      <button type="button" data-admin-action="key-delete" data-key-id="${escapeHtml(key.id)}">删除</button>
    </span>` : `<span class="admin-row-note">只读</span>`}
  </div>`);
  const form = canManageAdmin()
    ? `<form class="admin-inline-form admin-inline-form-wide" data-admin-form="api-key">
        <label>
          <span>服务商</span>
          <input name="provider" type="text" value="openai-compatible" required />
        </label>
        <label>
          <span>API Key</span>
          <input name="apiKey" type="password" autocomplete="off" placeholder="只保存密文，不会回显原文" required />
        </label>
        <button type="submit">保存接口</button>
      </form>`
    : `<p class="admin-inline-note">当前为运营只读权限，只能查看接口配置摘要，不能新增或删除密钥。</p>`;
  els.adminContent.innerHTML = `<div class="admin-action-stack">
    ${form}
    <p class="admin-inline-note">接口密钥只用于组织级 AI 代理；后台只显示尾号提示，不返回原始密钥。</p>
    <div class="cloud-admin-list">${rows.length ? rows.join("") : emptyRow("暂无接口配置")}</div>
  </div>`;
}

function renderUsage() {
  state.visibleUsage = state.usage.slice().reverse();
  const totalTokens = state.visibleUsage.reduce((sum, item) => sum + Number(item.total_tokens || 0), 0);
  const estimatedCost = state.visibleUsage.reduce((sum, item) => sum + estimateUsageCost(item), 0);
  const failedCount = state.visibleUsage.filter((item) => item.status === "failed").length;
  const taskGroups = countBy(state.visibleUsage, (item) => item.task_type || "chat");
  const taskCostGroups = sumBy(state.visibleUsage, (item) => item.task_type || "chat", estimateUsageCost);
  const budget = state.billing?.budget || state.dashboard?.budget || {};
  els.adminContent.innerHTML = `<div class="admin-action-stack">
    <div class="admin-mini-summary">
      ${metricCard(state.visibleUsage.length, "匹配记录")}
      ${metricCard(state.visibleUsage.length - failedCount, "成功请求")}
      ${metricCard(failedCount, "失败请求")}
      ${metricCard(totalTokens.toLocaleString("zh-CN"), "总 tokens")}
      ${metricCard(formatCurrency(estimatedCost), "估算成本")}
      ${metricCard(formatCurrency(budget.today_cost ?? estimatedCost), "今日成本")}
      ${metricCard(formatCurrency(budget.month_cost ?? estimatedCost), "本月成本")}
    </div>
    <section class="admin-insight-card">
      <strong>用量趋势</strong>
      ${renderUsageTrend(state.visibleUsage)}
      <span>估算按默认单价 ¥${DEFAULT_TOKEN_COST_PER_1K.toFixed(2)} / 1K tokens 计算；若后端返回成本字段，则优先使用真实记录。</span>
    </section>
    <section class="admin-insight-card">
      <strong>任务类型分布</strong>
      <div class="admin-chip-row">${renderCountChips(taskGroups)}</div>
    </section>
    <section class="admin-insight-card">
      <strong>任务成本估算</strong>
      <div class="admin-chip-row">${renderCostChips(taskCostGroups)}</div>
      ${renderBudgetSummary(budget)}
    </section>
    <div class="cloud-admin-list">${state.visibleUsage.length
      ? state.visibleUsage.map((item, index) =>
        opsRow(item.task_type || "chat", `${item.status || ""} · ${Number(item.total_tokens || 0).toLocaleString("zh-CN")} tokens · ${item.created_at || ""}`, "复制详情", `data-admin-action="copy-usage" data-usage-index="${index}"`)).join("")
      : emptyRow("暂无匹配用量。")}</div>
  </div>`;
}

function renderAudit() {
  state.visibleAudit = state.audit.slice().reverse();
  const actionGroups = countBy(state.visibleAudit, (item) => item.action || "unknown");
  const targetGroups = countBy(state.visibleAudit, (item) => item.target_type || "unknown");
  els.adminContent.innerHTML = `<div class="admin-action-stack">
    <div class="admin-mini-summary">
      ${metricCard(state.visibleAudit.length, "匹配审计")}
      ${metricCard(Object.keys(actionGroups).length, "动作类型")}
      ${metricCard(Object.keys(targetGroups).length, "对象类型")}
      ${metricCard(state.visibleAudit[0]?.created_at || "-", "最近记录")}
    </div>
    <section class="admin-insight-card">
      <strong>动作分布</strong>
      <div class="admin-chip-row">${renderCountChips(actionGroups)}</div>
    </section>
    <section class="admin-insight-card admin-saved-filters">
      <strong>保存筛选</strong>
      <form class="admin-inline-form admin-saved-filter-form" data-admin-form="audit-filter">
        <label>
          <span>筛选名称</span>
          <input name="filterName" type="text" maxlength="40" placeholder="如 本周接口变更" required />
        </label>
        <button type="submit">保存当前筛选</button>
      </form>
      <div class="admin-filter-pill-row">${renderSavedAuditFilters()}</div>
      <span class="cloud-row-actions">
        <button type="button" data-admin-action="audit-filter-export"${state.savedAuditFilters.length ? "" : " disabled"}>导出筛选</button>
        <button type="button" data-admin-action="audit-filter-clear"${state.savedAuditFilters.length ? "" : " disabled"}>清空筛选</button>
      </span>
    </section>
    <div class="cloud-admin-list">${state.visibleAudit.length
      ? state.visibleAudit.map((item, index) =>
        opsRow(item.action || "", `${item.target_type || ""} · ${item.created_at || ""}`, "复制详情", `data-admin-action="copy-audit" data-audit-index="${index}"`)).join("")
      : emptyRow("暂无匹配审计。")}</div>
  </div>`;
}

function renderFeedback() {
  const allFeedbacks = Array.isArray(state.dashboard?.feedbacks) ? state.dashboard.feedbacks : [];
  const feedbacks = filterBySlaState(allFeedbacks, state.feedbackSlaFilter);
  state.visibleFeedbacks = feedbacks.slice().reverse();
  const statusGroups = countBy(state.visibleFeedbacks, (item) => item.metadata?.status || "pending");
  const rows = state.visibleFeedbacks.map((item) => {
    const metadata = item.metadata || {};
    const status = metadata.status || "pending";
    return `<div class="cloud-admin-feedback-row">
      <strong>${escapeHtml(item.message || "")}</strong>
      <span>${escapeHtml(feedbackStatusLabel(status))} · ${escapeHtml(item.created_at || "")}</span>
      <span class="admin-row-note">负责人：${escapeHtml(metadata.assignee || "未分配")} · SLA：${escapeHtml(metadata.sla_at || "未设置")} · 备注：${escapeHtml(metadata.note || "无")}</span>
      ${canManageAdmin() ? `<span class="cloud-row-actions">
        <button type="button" data-admin-action="feedback-status" data-feedback-id="${escapeHtml(item.id)}" data-status="processing">处理中</button>
        <button type="button" data-admin-action="feedback-status" data-feedback-id="${escapeHtml(item.id)}" data-status="resolved">已解决</button>
        <button type="button" data-admin-action="feedback-status" data-feedback-id="${escapeHtml(item.id)}" data-status="closed">关闭</button>
      </span>` : `<span class="admin-row-note">只读</span>`}
      ${canManageAdmin() ? `
      <form class="admin-triage-form" data-admin-form="feedback-triage" data-feedback-id="${escapeHtml(item.id)}">
        <label>
          <span>状态</span>
          <select name="status">${renderFeedbackStatusOptions(status)}</select>
        </label>
        <label>
          <span>负责人</span>
          <input name="assignee" type="text" maxlength="120" value="${escapeHtml(metadata.assignee || "")}" placeholder="姓名或邮箱" />
        </label>
        <label>
          <span>SLA</span>
          <input name="sla_at" type="date" value="${escapeHtml(normalizeDateInput(metadata.sla_at))}" />
        </label>
        <label>
          <span>备注</span>
          <input name="note" type="text" maxlength="300" value="${escapeHtml(metadata.note || "")}" placeholder="处理说明" />
        </label>
        <button type="submit">保存跟进</button>
      </form>` : ""}
    </div>`;
  });
  els.adminContent.innerHTML = `<div class="admin-action-stack">
    <div class="admin-toolbar-card">
      <div>
        <strong>反馈处理</strong>
        <span>${escapeHtml(state.visibleFeedbacks.length)} 条反馈 · ${renderInlineCounts(statusGroups)}</span>
      </div>
      <span class="cloud-row-actions">
        <select data-admin-feedback-sla aria-label="反馈 SLA 筛选">
          ${renderSlaFilterOptions(state.feedbackSlaFilter)}
        </select>
        ${canManageAdmin() ? `<button type="button" data-admin-action="feedback-batch" data-status="processing">全部标为处理中</button>
        <button type="button" data-admin-action="feedback-batch" data-status="resolved">全部标为已解决</button>
        <button type="button" data-admin-action="feedback-batch" data-status="closed">全部关闭</button>` : ""}
      </span>
    </div>
    <div class="cloud-admin-list">${rows.length ? rows.join("") : emptyRow("暂无反馈。")}</div>
  </div>`;
}

function renderEmail(emails) {
  state.visibleEmails = emails.slice().reverse();
  renderList(state.visibleEmails.map((item, index) =>
    opsRow(item.email || "", `${item.template || ""} · ${item.status || ""} · ${item.updated_at || item.created_at || ""}`, "复制详情", `data-admin-action="copy-email" data-email-index="${index}"`),
  ), "暂无邮件投递。");
}

function renderBilling(payments) {
  state.visiblePayments = payments.slice().reverse();
  const billing = state.billing || {};
  const options = Array.isArray(billing.checkout?.available_plans) ? billing.checkout.available_plans : [];
  const manualOrders = getManualPaymentOrders().slice().reverse();
  const creditLedger = getCreditLedger().slice().reverse();
  const creditSummary = billing.credits || state.dashboard?.billing?.credits || {};
  const planCards = canManageAdmin() && options.length
    ? options.map((item) => `<div class="admin-plan-card">
        <strong>${escapeHtml(item.plan || "")}</strong>
        <span>${escapeHtml(item.price_id || "未绑定价格 ID")}</span>
        <button type="button" data-admin-action="billing-checkout" data-plan="${escapeHtml(item.plan || "")}" data-price-id="${escapeHtml(item.price_id || "")}">发起升级</button>
      </div>`).join("")
    : `<div class="admin-plan-card"><strong>${canManageAdmin() ? "未配置升级项" : "只读账单"}</strong><span>${canManageAdmin() ? "后端仍会保留账单事件查看能力" : "可查看套餐、订单、额度和账单事件，不能发起升级或审核订单"}</span></div>`;
  els.adminContent.innerHTML = `<div class="admin-action-stack">
    <div class="admin-plan-grid">
      <div class="admin-plan-card">
        <strong>${escapeHtml(billing.organization?.plan || state.dashboard?.organization?.plan || "free")}</strong>
        <span>当前套餐 · 用户日限 ${escapeHtml(billing.limits?.user_daily ?? "-")} · 组织日限 ${escapeHtml(billing.limits?.org_daily ?? "-")} · 剩余额度 ${escapeHtml(creditSummary.total_balance ?? billing.credits?.balance ?? 0)} 点</span>
      </div>
      ${planCards}
    </div>
    <div class="admin-toolbar-card">
      <div>
        <strong>人工确认充值</strong>
        <span>${manualOrders.length} 笔订单 · 待确认 ${manualOrders.filter((item) => item.status === "pending").length} 笔</span>
      </div>
    </div>
    <div class="cloud-admin-list">${manualOrders.length
      ? manualOrders.map((item) => {
        const pending = item.status === "pending";
        const grantParts = [];
        if (Number(item.credits || 0) > 0) grantParts.push(`${Number(item.credits || 0).toLocaleString("zh-CN")} 点额度`);
        if (item.plan) grantParts.push(`${String(item.plan).toUpperCase()} ${Number(item.duration_days || 0) || ""}天`.trim());
        const note = item.payer_note ? `备注：${item.payer_note}` : "备注：未填写";
        const proof = item.proof_text ? `凭证：${item.proof_text}` : "凭证：未填写";
        const review = item.review_note ? `审核：${item.review_note}` : item.reviewed_at ? "审核：未填写备注" : "";
        const actions = pending && canManageAdmin()
          ? `<span class="cloud-row-actions"><button type="button" data-admin-action="manual-order-approve" data-order-id="${escapeHtml(item.id)}">确认</button><button type="button" data-admin-action="manual-order-reject" data-order-id="${escapeHtml(item.id)}">拒绝</button><button type="button" data-admin-action="copy-manual-order" data-order-id="${escapeHtml(item.id)}">复制</button></span>`
          : `<span class="cloud-row-actions"><span>${escapeHtml(formatManualOrderStatus(item.status))}${item.reviewed_at ? ` · ${escapeHtml(item.reviewed_at)}` : ""}</span><button type="button" data-admin-action="copy-manual-order" data-order-id="${escapeHtml(item.id)}">复制</button></span>`;
        return `<div class="cloud-admin-ops-row">
          <strong>${escapeHtml(item.title || item.package_id || "")}</strong>
          <span>
            ${escapeHtml(formatManualOrderStatus(item.status))} · ${escapeHtml(formatManualPaymentChannel(item.payment_channel))} · ¥${escapeHtml(item.amount_cny ?? 0)} · ${escapeHtml(grantParts.join(" + ") || "无到账内容")}<br>
            <span class="admin-row-note">订单号：${escapeHtml(item.id || "")} · 用户：${escapeHtml(item.user_id || "")} · ${escapeHtml(item.created_at || "")}</span><br>
            <span class="admin-row-note">${escapeHtml(note)} · ${escapeHtml(proof)}${review ? ` · ${escapeHtml(review)}` : ""}</span>
          </span>
          ${actions}
        </div>`;
      }).join("")
      : emptyRow("暂无人工充值订单")}</div>
    <div class="admin-toolbar-card">
      <div>
        <strong>额度明细</strong>
        <span>${creditLedger.length} 条最近流水 · 入账 ${creditLedger.filter((item) => item.direction === "in").length} 条 · 扣减 ${creditLedger.filter((item) => item.direction === "out").length} 条</span>
      </div>
    </div>
    <div class="cloud-admin-list">${creditLedger.length
      ? creditLedger.map((item, index) =>
        opsRow(`${formatCreditLedgerDirection(item)} ${Number(item.amount || 0).toLocaleString("zh-CN")} 点`, `${item.user_email || item.user_id || ""} · 余额 ${Number(item.balance_after || 0).toLocaleString("zh-CN")} · ${item.order_title || formatCreditLedgerReason(item.reason)} · ${item.created_at || ""}`, "复制", `data-admin-action="copy-credit-ledger" data-ledger-index="${index}"`)).join("")
      : emptyRow("暂无额度流水")}</div>
    <div class="cloud-admin-list">${state.visiblePayments.length
      ? state.visiblePayments.map((item, index) =>
        opsRow(item.event_type || "", `${item.provider || ""} · ${item.created_at || ""}`, "复制事件", `data-admin-action="copy-payment" data-payment-index="${index}"`)).join("")
      : emptyRow("暂无账单事件")}</div>
  </div>`;
}

function renderErrors(errors) {
  const levelOptions = ["", ...Array.from(new Set(errors.map((item) => item.level || item.type || "error").filter(Boolean)))];
  state.visibleErrors = errors
    .filter((item) => !state.errorLevelFilter || (item.level || item.type || "error") === state.errorLevelFilter)
    .filter((item) => matchesSlaState(item, state.errorSlaFilter))
    .slice()
    .reverse();
  const levelGroups = countBy(errors, (item) => item.level || item.type || "error");
  els.adminContent.innerHTML = `<div class="admin-action-stack">
    <div class="admin-toolbar-card">
      <div>
        <strong>错误事件</strong>
        <span>${escapeHtml(errors.length)} 条记录 · ${renderInlineCounts(levelGroups)}</span>
      </div>
      <span class="cloud-row-actions">
        <select data-admin-error-level aria-label="错误级别筛选">
          ${levelOptions.map((level) => `<option value="${escapeHtml(level)}"${level === state.errorLevelFilter ? " selected" : ""}>${escapeHtml(level || "全部级别")}</option>`).join("")}
        </select>
        <select data-admin-error-sla aria-label="错误 SLA 筛选">
          ${renderSlaFilterOptions(state.errorSlaFilter)}
        </select>
        <button type="button" data-admin-action="copy-visible-errors"${state.visibleErrors.length ? "" : " disabled"}>复制当前错误</button>
      </span>
    </div>
    <div class="cloud-admin-list">${state.visibleErrors.length
      ? state.visibleErrors.map((item, index) =>
        renderErrorRow(item, index)).join("")
      : emptyRow("暂无错误事件。")}</div>
  </div>`;
}

async function handleContentSubmit(event) {
  const form = event.target.closest("[data-admin-form]");
  if (!form) return;
  event.preventDefault();
  const type = form.dataset.adminForm;
  const button = form.querySelector("button[type='submit']");
  const values = Object.fromEntries(new FormData(form).entries());
  if (type === "org-name") {
    await updateOrganizationName(values.name, button);
    return;
  }
  if (type === "invite-member") {
    await inviteMember(values, button, form);
    return;
  }
  if (type === "api-key") {
    await saveApiKey(values, button, form);
    return;
  }
  if (type === "audit-filter") {
    await saveAuditFilter(values, button, form);
    return;
  }
  if (type === "feedback-triage") {
    await updateFeedbackTriage(form, values, button);
    return;
  }
  if (type === "error-triage") {
    await updateErrorTriage(form, values, button);
    return;
  }
}

function handleContentChange(event) {
  const errorLevelSelect = event.target.closest("[data-admin-error-level]");
  if (errorLevelSelect) {
    state.errorLevelFilter = errorLevelSelect.value || "";
    syncAdminPreferences();
    renderAdmin();
  }
  const errorSlaSelect = event.target.closest("[data-admin-error-sla]");
  if (errorSlaSelect) {
    state.errorSlaFilter = errorSlaSelect.value || "";
    syncAdminPreferences();
    renderAdmin();
  }
  const feedbackSlaSelect = event.target.closest("[data-admin-feedback-sla]");
  if (feedbackSlaSelect) {
    state.feedbackSlaFilter = feedbackSlaSelect.value || "";
    syncAdminPreferences();
    renderAdmin();
  }
}

async function handleContentAction(event) {
  const button = event.target.closest("[data-admin-action]");
  if (!button) return;
  const action = button.dataset.adminAction;
  if (action === "feedback-status") return updateFeedbackStatus(button);
  if (action === "feedback-batch") return updateFeedbackBatch(button);
  if (action === "member-role") return updateMemberRole(button);
  if (action === "member-remove") return removeMember(button);
  if (action === "invite-resend") return resendInvitation(button);
  if (action === "invite-copy") return copyInvitationToken(button);
  if (action === "invite-revoke") return revokeInvitation(button);
  if (action === "key-delete") return deleteApiKey(button);
  if (action === "billing-checkout") return startBillingCheckout(button);
  if (action === "manual-order-approve") return reviewManualOrder(button, "approve");
  if (action === "manual-order-reject") return reviewManualOrder(button, "reject");
  if (action === "copy-manual-order") return copyManualOrder(button);
  if (action === "copy-credit-ledger") return copyCreditLedger(button);
  if (action === "copy-usage") return copyUsage(button);
  if (action === "copy-audit") return copyAudit(button);
  if (action === "audit-filter-apply") return applyAuditFilter(button);
  if (action === "audit-filter-delete") return deleteAuditFilter(button);
  if (action === "audit-filter-export") return exportAuditFilters();
  if (action === "audit-filter-clear") return clearAuditFilters();
  if (action === "copy-email") return copyEmail(button);
  if (action === "copy-payment") return copyPayment(button);
  if (action === "copy-error") return copyError(button);
  if (action === "copy-visible-errors") return copyVisibleErrors();
  if (action === "copy-ops-report") return copyOpsReport();
}

async function updateOrganizationName(name, button) {
  const orgId = getActiveOrgId();
  if (!orgId) return toast("没有可操作的组织", "warn");
  await withLoading(button, "保存中", async () => {
    await apiRequest(`/orgs/${orgId}`, {
      method: "PUT",
      body: JSON.stringify({ name: String(name || "").trim() }),
    });
    await refreshAdminData({ silent: true });
    toast("组织名称已更新");
  });
}

async function inviteMember(values, button, form) {
  const orgId = getActiveOrgId();
  if (!orgId) return toast("没有可操作的组织", "warn");
  await withLoading(button, "邀请中", async () => {
    const data = await apiRequest(`/orgs/${orgId}/invitations`, {
      method: "POST",
      body: JSON.stringify({ email: values.email, role: values.role || "member" }),
    });
    if (data.invitation?.id && data.invitation?.token) {
      state.invitationTokens[data.invitation.id] = data.invitation.token;
    }
    form.reset();
    await refreshAdminData({ silent: true });
    toast(data.invitation?.token ? "邀请已创建，可复制口令" : "邀请已创建");
  });
}

async function updateMemberRole(button) {
  const orgId = getActiveOrgId();
  const memberId = button.dataset.memberId;
  const select = els.adminContent.querySelector(`[data-member-role="${cssEscape(memberId)}"]`);
  if (!orgId || !memberId || !select) return;
  await withLoading(button, "保存中", async () => {
    await apiRequest(`/orgs/${orgId}/members/${memberId}`, {
      method: "PUT",
      body: JSON.stringify({ role: select.value }),
    });
    await refreshAdminData({ silent: true });
    toast("成员角色已更新");
  });
}

async function removeMember(button) {
  const orgId = getActiveOrgId();
  const memberId = button.dataset.memberId;
  if (!orgId || !memberId) return;
  const confirmed = await confirmAdminAction({
    title: "移除成员",
    message: "该成员会从当前组织移除，当前登录会话也会失效。",
    confirmText: "确认移除",
    danger: true,
  });
  if (!confirmed) return;
  await withLoading(button, "移除中", async () => {
    await apiRequest(`/orgs/${orgId}/members/${memberId}`, { method: "DELETE" });
    await refreshAdminData({ silent: true });
    toast("成员已移除", "warn");
  });
}

async function resendInvitation(button) {
  const orgId = getActiveOrgId();
  const invitationId = button.dataset.invitationId;
  if (!orgId || !invitationId) return;
  await withLoading(button, "重发中", async () => {
    const data = await apiRequest(`/orgs/${orgId}/invitations/${invitationId}/resend`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (data.invitation?.token) state.invitationTokens[invitationId] = data.invitation.token;
    await refreshAdminData({ silent: true });
    toast("邀请已重发，可复制新口令");
  });
}

async function revokeInvitation(button) {
  const orgId = getActiveOrgId();
  const invitationId = button.dataset.invitationId;
  if (!orgId || !invitationId) return;
  const confirmed = await confirmAdminAction({
    title: "撤销邀请",
    message: "撤销后，该邀请口令将不再可用。",
    confirmText: "确认撤销",
    danger: true,
  });
  if (!confirmed) return;
  await withLoading(button, "撤销中", async () => {
    await apiRequest(`/orgs/${orgId}/invitations/${invitationId}/revoke`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    delete state.invitationTokens[invitationId];
    await refreshAdminData({ silent: true });
    toast("邀请已撤销", "warn");
  });
}

async function copyInvitationToken(button) {
  const token = state.invitationTokens[button.dataset.invitationId] || "";
  if (!token) return toast("当前邀请没有可复制的口令，请先重发邀请", "warn");
  await copyText(token, "邀请口令已复制");
}

async function saveApiKey(values, button, form) {
  await withLoading(button, "保存中", async () => {
    await apiRequest("/api-keys", {
      method: "POST",
      body: JSON.stringify({ provider: values.provider, api_key: values.apiKey }),
    });
    form.reset();
    form.querySelector("[name='provider']").value = "openai-compatible";
    await refreshAdminData({ silent: true });
    toast("接口密钥已保存");
  });
}

async function deleteApiKey(button) {
  const keyId = button.dataset.keyId;
  if (!keyId) return;
  const confirmed = await confirmAdminAction({
    title: "删除接口配置",
    message: "删除后，组织内使用云端 AI 代理的请求可能会失败，直到重新配置接口密钥。",
    confirmText: "确认删除",
    danger: true,
  });
  if (!confirmed) return;
  await withLoading(button, "删除中", async () => {
    await apiRequest(`/api-keys/${keyId}`, { method: "DELETE" });
    await refreshAdminData({ silent: true });
    toast("接口配置已删除", "warn");
  });
}

async function startBillingCheckout(button) {
  const plan = button.dataset.plan || "";
  const priceId = button.dataset.priceId || "";
  await withLoading(button, "创建中", async () => {
    const data = await apiRequest("/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ plan, price_id: priceId }),
    });
    const url = sanitizeUrl(data.checkout?.checkout_url);
    if (!url) throw new Error("未返回支付链接");
    window.open(url, "_blank", "noopener,noreferrer");
    toast("已打开升级页面");
  });
}

async function reviewManualOrder(button, action) {
  const orderId = button.dataset.orderId || "";
  if (!orderId) return;
  const approved = action === "approve";
  const reviewNote = await confirmAdminAction({
    title: approved ? "确认充值到账" : "拒绝充值申请",
    message: approved
      ? "请确认已核对收款记录、金额、支付方式和用户备注。确认后系统会立即发放额度或开通套餐。"
      : "拒绝后订单不会发放额度或开通套餐，请留下方便用户理解的原因。",
    confirmText: approved ? "确认到账" : "拒绝申请",
    reasonLabel: "审核备注",
    defaultReason: approved ? "已核对收款记录，确认到账" : "未找到付款记录或付款信息不匹配",
    danger: !approved,
  });
  if (!reviewNote) return;
  await withLoading(button, action === "approve" ? "确认中" : "拒绝中", async () => {
    await apiRequest(`/billing/manual-orders/${orderId}/review`, {
      method: "POST",
      body: JSON.stringify({ action, review_note: reviewNote }),
    });
    await refreshAdminData({ silent: true });
    renderAdmin();
    toast(action === "approve" ? "充值订单已确认" : "充值订单已拒绝");
  });
}

async function copyManualOrder(button) {
  const orderId = button.dataset.orderId || "";
  const order = getManualPaymentOrders().find((item) => item.id === orderId);
  if (!order) return toast("未找到充值订单", "warn");
  await copyJson(order, "充值订单详情已复制");
}

async function copyCreditLedger(button) {
  const index = Number(button.dataset.ledgerIndex || -1);
  const ledger = getCreditLedger().slice().reverse()[index];
  if (!ledger) return toast("未找到额度流水", "warn");
  await copyJson(ledger, "额度流水详情已复制");
}

async function updateFeedbackStatus(button) {
  await withLoading(button, "更新中", async () => {
    await apiRequest(`/feedback/${button.dataset.feedbackId}/status`, {
      method: "POST",
      body: JSON.stringify({ status: button.dataset.status }),
    });
    await refreshAdminData({ silent: true });
    toast("反馈状态已更新");
  });
}

async function updateFeedbackTriage(form, values, button) {
  const feedbackId = form.dataset.feedbackId;
  if (!feedbackId) return;
  await withLoading(button, "保存中", async () => {
    await apiRequest(`/feedback/${feedbackId}/status`, {
      method: "POST",
      body: JSON.stringify({
        status: values.status,
        assignee: values.assignee,
        sla_at: values.sla_at,
        note: values.note,
      }),
    });
    await refreshAdminData({ silent: true });
    toast("反馈跟进信息已保存");
  });
}

async function updateErrorTriage(form, values, button) {
  const errorId = form.dataset.errorId;
  if (!errorId) {
    toast("该错误记录没有可保存的事件编号", "warn");
    return;
  }
  await withLoading(button, "保存中", async () => {
    await apiRequest(`/ops/events/${errorId}/triage`, {
      method: "POST",
      body: JSON.stringify({
        status: values.status,
        assignee: values.assignee,
        sla_at: values.sla_at,
        note: values.note,
        priority: values.priority,
      }),
    });
    await refreshAdminData({ silent: true });
    toast("错误跟进信息已保存");
  });
}

async function updateFeedbackBatch(button) {
  const status = button.dataset.status || "processing";
  const targets = state.visibleFeedbacks.filter((item) => (item.metadata?.status || "pending") !== status);
  if (!targets.length) {
    toast("没有需要批量更新的反馈", "warn");
    return;
  }
  const confirmed = await confirmAdminAction({
    title: "批量更新反馈",
    message: `将 ${targets.length} 条当前反馈标记为「${feedbackStatusLabel(status)}」。`,
    confirmText: "确认更新",
  });
  if (!confirmed) return;
  await withLoading(button, "批量更新中", async () => {
    await apiRequest("/feedback/batch-status", {
      method: "POST",
      body: JSON.stringify({ feedback_ids: targets.map((item) => item.id), status }),
    });
    await refreshAdminData({ silent: true });
    toast(`已更新 ${targets.length} 条反馈`);
  });
}

async function saveAuditFilter(values, button, form) {
  const name = String(values.filterName || "").trim();
  if (!name) {
    toast("请填写筛选名称", "warn");
    return;
  }
  const filter = {
    id: `filter-${Date.now()}`,
    name: name.slice(0, 40),
    from: els.adminFromInput.value || "",
    to: els.adminToInput.value || "",
    action: els.adminActionInput.value.trim(),
    created_at: new Date().toISOString(),
  };
  state.savedAuditFilters = [filter, ...state.savedAuditFilters.filter((item) => item.name !== filter.name)].slice(0, 12);
  persistAuditFilters();
  await syncAdminPreferences();
  form.reset();
  renderAdmin();
  toast("审计筛选已保存");
}

async function applyAuditFilter(button) {
  const item = state.savedAuditFilters[Number(button.dataset.filterIndex)];
  if (!item) return;
  els.adminFromInput.value = item.from || "";
  els.adminToInput.value = item.to || "";
  els.adminActionInput.value = item.action || "";
  await refreshAdminData({ silent: true });
  toast(`已套用筛选：${item.name}`);
}

async function deleteAuditFilter(button) {
  const index = Number(button.dataset.filterIndex);
  if (!Number.isInteger(index) || !state.savedAuditFilters[index]) return;
  state.savedAuditFilters.splice(index, 1);
  persistAuditFilters();
  await syncAdminPreferences();
  renderAdmin();
  toast("审计筛选已删除", "warn");
}

async function clearAuditFilters() {
  if (!state.savedAuditFilters.length) return;
  state.savedAuditFilters = [];
  persistAuditFilters();
  await syncAdminPreferences();
  renderAdmin();
  toast("审计筛选已清空", "warn");
}

function exportAuditFilters() {
  if (!state.savedAuditFilters.length) return toast("没有可导出的审计筛选", "warn");
  const downloaded = downloadBlob(
    `mowen-audit-filters-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify({ audit_filters: state.savedAuditFilters }, null, 2),
    "application/json;charset=utf-8",
  );
  if (downloaded) toast("审计筛选已导出");
}

async function copyUsage(button) {
  const item = state.visibleUsage[Number(button.dataset.usageIndex)];
  await copyJson(item, "用量详情已复制");
}

async function copyAudit(button) {
  const item = state.visibleAudit[Number(button.dataset.auditIndex)];
  await copyJson(item, "审计详情已复制");
}

async function copyEmail(button) {
  const item = state.visibleEmails[Number(button.dataset.emailIndex)];
  await copyJson(item, "邮件详情已复制");
}

async function copyPayment(button) {
  const item = state.visiblePayments[Number(button.dataset.paymentIndex)];
  await copyJson(item, "账单事件已复制");
}

async function copyError(button) {
  const item = state.visibleErrors[Number(button.dataset.errorIndex)];
  await copyJson(item, "错误详情已复制");
}

async function copyVisibleErrors() {
  await copyJson(state.visibleErrors, "当前错误列表已复制");
}

async function copyOpsReport() {
  const dashboard = state.dashboard || {};
  const usage = dashboard.usage || {};
  const feedbacks = Array.isArray(dashboard.feedbacks) ? dashboard.feedbacks : [];
  const errors = Array.isArray(dashboard.recent_errors) ? dashboard.recent_errors : [];
  const feedbackSlaRisk = countSlaRisks(feedbacks);
  const errorSlaRisk = countSlaRisks(errors);
  const text = [
    `组织：${dashboard.organization?.name || state.activeOrganization?.name || "-"}`,
    `今日请求：${usage.request_count || 0}，失败：${usage.failed_count || 0}`,
    `反馈：${feedbacks.length}，错误：${errors.length}`,
    `SLA 超时：${feedbackSlaRisk.overdue + errorSlaRisk.overdue}，临近：${feedbackSlaRisk.dueSoon + errorSlaRisk.dueSoon}`,
    `生成时间：${new Date().toLocaleString("zh-CN")}`,
  ].join("\n");
  await copyText(text, "运营日报已复制");
}

async function exportOrganizationData() {
  const orgId = getActiveOrgId();
  if (!orgId) return toast("没有可导出的组织", "warn");
  await withLoading(els.adminExportOrgBtn, "导出中", async () => {
    const data = await apiRequest(`/orgs/${orgId}/export`, { method: "GET" });
    if (downloadBlob(`mowen-org-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), "application/json;charset=utf-8")) {
      toast("组织数据已导出");
    }
  });
}

async function requestOrganizationDeletion() {
  const orgId = getActiveOrgId();
  if (!orgId) return toast("没有可操作的组织", "warn");
  const reason = await confirmAdminAction({
    title: "创建删除/停用草稿",
    message: "该操作只会创建草稿，不会直接删除组织。请填写原因，方便后续复核。",
    confirmText: "创建草稿",
    reasonLabel: "原因",
    defaultReason: "管理员在独立后台发起组织删除/停用评估",
    danger: true,
  });
  if (!reason) return;
  await withLoading(els.adminDeletionRequestBtn, "创建中", async () => {
    await apiRequest(`/orgs/${orgId}/deletion-request`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    await refreshAdminData({ silent: true });
    toast("组织删除/停用草稿已创建", "warn");
  });
}

function countBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = String(getKey(item) || "unknown");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function sumBy(items, getKey, getValue) {
  return items.reduce((acc, item) => {
    const key = String(getKey(item) || "unknown");
    acc[key] = (acc[key] || 0) + Number(getValue(item) || 0);
    return acc;
  }, {});
}

function estimateUsageCost(item) {
  const explicit = Number(item.estimated_cost ?? item.cost ?? item.total_cost);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return (Number(item.total_tokens || 0) / 1000) * DEFAULT_TOKEN_COST_PER_1K;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(Number(value || 0));
}

function renderUsageTrend(rows) {
  const trend = groupUsageByDay(rows);
  if (!trend.length) return `<div class="admin-empty-row">暂无可视化数据</div>`;
  const maxTokens = Math.max(...trend.map((item) => item.totalTokens), 1);
  return `<div class="admin-trend-chart" aria-label="用量趋势图">${trend.map((item) => {
    const height = Math.max(8, Math.round((item.totalTokens / maxTokens) * 100));
    return `<div class="admin-trend-day">
      <span class="admin-trend-bar" style="--bar-height: ${height}%"></span>
      <small>${escapeHtml(item.label)}</small>
      <em>${escapeHtml(item.totalTokens.toLocaleString("zh-CN"))}</em>
    </div>`;
  }).join("")}</div>`;
}

function groupUsageByDay(rows) {
  const groups = rows.reduce((acc, item) => {
    const key = String(item.created_at || "").slice(0, 10) || "未知";
    acc[key] = acc[key] || { date: key, requestCount: 0, totalTokens: 0 };
    acc[key].requestCount += 1;
    acc[key].totalTokens += Number(item.total_tokens || 0);
    return acc;
  }, {});
  return Object.values(groups)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-14)
    .map((item) => ({
      ...item,
      label: item.date === "未知" ? "未知" : item.date.slice(5),
    }));
}

function renderSavedAuditFilters() {
  if (!state.savedAuditFilters.length) return `<span class="admin-chip muted">暂无保存筛选</span>`;
  return state.savedAuditFilters.map((item, index) => `<span class="admin-filter-pill">
    <button type="button" data-admin-action="audit-filter-apply" data-filter-index="${index}">${escapeHtml(item.name)}</button>
    <small>${escapeHtml(renderAuditFilterSummary(item))}</small>
    <button type="button" aria-label="删除筛选 ${escapeHtml(item.name)}" data-admin-action="audit-filter-delete" data-filter-index="${index}">删除</button>
  </span>`).join("");
}

function renderAuditFilterSummary(item) {
  const parts = [];
  if (item.from || item.to) parts.push(`${item.from || "不限"} 至 ${item.to || "不限"}`);
  if (item.action) parts.push(item.action);
  return parts.join(" · ") || "全部审计";
}

function renderFeedbackStatusOptions(active) {
  return ["pending", "processing", "resolved", "closed"]
    .map((status) => `<option value="${status}"${status === active ? " selected" : ""}>${feedbackStatusLabel(status)}</option>`)
    .join("");
}

function renderErrorStatusOptions(active) {
  return ["open", "processing", "resolved", "ignored"]
    .map((status) => `<option value="${status}"${status === active ? " selected" : ""}>${errorStatusLabel(status)}</option>`)
    .join("");
}

function renderPriorityOptions(active) {
  return ["normal", "low", "high", "urgent"]
    .map((priority) => `<option value="${priority}"${priority === active ? " selected" : ""}>${priorityLabel(priority)}</option>`)
    .join("");
}

function renderErrorRow(item, index) {
  const metadata = item.metadata || {};
  const triageStatus = metadata.triage_status || "open";
  const priority = metadata.priority || "normal";
  return `<div class="cloud-admin-feedback-row admin-error-row">
    <strong>${escapeHtml(item.type || item.level || "error")}</strong>
    <span>${escapeHtml(item.message || "")}</span>
    <span class="admin-row-note">级别：${escapeHtml(item.level || "error")} · 状态：${escapeHtml(errorStatusLabel(triageStatus))} · 负责人：${escapeHtml(metadata.assignee || "未分配")} · SLA：${escapeHtml(metadata.sla_at || "未设置")}</span>
    <span class="cloud-row-actions">
      <button type="button" data-admin-action="copy-error" data-error-index="${index}">复制详情</button>
    </span>
    ${canManageAdmin() ? `
    <form class="admin-triage-form" data-admin-form="error-triage" data-error-id="${escapeHtml(item.id || "")}">
      <label>
        <span>状态</span>
        <select name="status">${renderErrorStatusOptions(triageStatus)}</select>
      </label>
      <label>
        <span>优先级</span>
        <select name="priority">${renderPriorityOptions(priority)}</select>
      </label>
      <label>
        <span>负责人</span>
        <input name="assignee" type="text" maxlength="120" value="${escapeHtml(metadata.assignee || "")}" placeholder="姓名或邮箱" />
      </label>
      <label>
        <span>SLA</span>
        <input name="sla_at" type="date" value="${escapeHtml(normalizeDateInput(metadata.sla_at))}" />
      </label>
      <label>
        <span>备注</span>
        <input name="note" type="text" maxlength="300" value="${escapeHtml(metadata.note || "")}" placeholder="排查说明" />
      </label>
      <button type="submit"${item.id ? "" : " disabled"}>保存跟进</button>
    </form>` : `<span class="admin-row-note">当前为运营只读权限，不能保存错误跟进。</span>`}
  </div>`;
}

function renderCountChips(groups) {
  const entries = Object.entries(groups)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  if (!entries.length) return `<span class="admin-chip muted">暂无数据</span>`;
  return entries.map(([key, value]) => `<span class="admin-chip">${escapeHtml(key)} · ${escapeHtml(value)}</span>`).join("");
}

function renderCostChips(groups) {
  const entries = Object.entries(groups)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  if (!entries.length) return `<span class="admin-chip muted">暂无成本数据</span>`;
  return entries.map(([key, value]) => `<span class="admin-chip">${escapeHtml(key)} · ${escapeHtml(formatCurrency(value))}</span>`).join("");
}

function renderBudgetSummary(budget = {}) {
  const dailyBudget = Number(budget.daily_budget_cny || 0);
  const monthlyBudget = Number(budget.monthly_budget_cny || 0);
  if (!dailyBudget && !monthlyBudget) return `<span>未配置预算阈值，当前仅展示按记录估算的成本。</span>`;
  const dailyText = dailyBudget ? `今日 ${formatCurrency(budget.today_cost)} / ${formatCurrency(dailyBudget)}` : "今日未设预算";
  const monthlyText = monthlyBudget ? `本月 ${formatCurrency(budget.month_cost)} / ${formatCurrency(monthlyBudget)}` : "本月未设预算";
  const warning = budget.daily_exceeded || budget.monthly_exceeded ? " · 已超预算" : "";
  return `<span>${escapeHtml(dailyText)} · ${escapeHtml(monthlyText)}${escapeHtml(warning)}</span>`;
}

function renderInlineCounts(groups) {
  const text = Object.entries(groups)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => `${key} ${value}`)
    .join(" / ");
  return escapeHtml(text || "暂无状态");
}

function feedbackStatusLabel(status) {
  return {
    pending: "待处理",
    processing: "处理中",
    resolved: "已解决",
    closed: "关闭",
  }[status] || status;
}

function errorStatusLabel(status) {
  return {
    open: "待排查",
    processing: "处理中",
    resolved: "已解决",
    ignored: "已忽略",
  }[status] || status;
}

function priorityLabel(priority) {
  return {
    low: "低",
    normal: "普通",
    high: "高",
    urgent: "紧急",
  }[priority] || priority;
}

function normalizeDateInput(value) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : "";
}

function renderSlaFilterOptions(active) {
  return [
    ["", "全部 SLA"],
    ["overdue", "已超时"],
    ["due-soon", "三日内"],
    ["unset", "未设置"],
  ].map(([value, label]) => `<option value="${value}"${value === active ? " selected" : ""}>${label}</option>`).join("");
}

function filterBySlaState(items, stateValue) {
  return items.filter((item) => matchesSlaState(item, stateValue));
}

function matchesSlaState(item, stateValue) {
  const value = String(stateValue || "");
  if (!value) return true;
  const slaAt = normalizeDateInput(item.metadata?.sla_at);
  if (value === "unset") return !slaAt;
  if (!slaAt) return false;
  const days = daysUntil(slaAt);
  if (value === "overdue") return days < 0;
  if (value === "due-soon") return days >= 0 && days <= 3;
  return true;
}

function countSlaRisks(items) {
  return items.reduce((acc, item) => {
    const slaAt = normalizeDateInput(item.metadata?.sla_at);
    if (!slaAt) return acc;
    const days = daysUntil(slaAt);
    if (days < 0) acc.overdue += 1;
    else if (days <= 3) acc.dueSoon += 1;
    return acc;
  }, { overdue: 0, dueSoon: 0 });
}

function daysUntil(dateText) {
  const target = Date.parse(`${dateText}T23:59:59`);
  if (!Number.isFinite(target)) return Number.POSITIVE_INFINITY;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.ceil((target - start) / (1000 * 60 * 60 * 24));
}

function loadSavedAuditFilters() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ADMIN_AUDIT_FILTERS_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        id: String(item.id || `filter-${Date.now()}`),
        name: String(item.name || "未命名筛选").slice(0, 40),
        from: String(item.from || ""),
        to: String(item.to || ""),
        action: String(item.action || ""),
        created_at: String(item.created_at || ""),
      }))
      .slice(0, 12);
  } catch {
    return [];
  }
}

function applyAdminPreferences(preferences) {
  if (!preferences || typeof preferences !== "object") {
    state.preferencesCloudAvailable = false;
    return;
  }
  state.preferencesCloudAvailable = true;
  state.adminPreferences = preferences;
  const filters = normalizeSavedAuditFilters(preferences.audit_filters);
  if (filters.length) {
    state.savedAuditFilters = filters;
    persistAuditFilters();
  }
  if (preferences.error_filter?.level !== undefined) state.errorLevelFilter = preferences.error_filter.level || "";
  if (preferences.error_filter?.sla !== undefined) state.errorSlaFilter = preferences.error_filter.sla || "";
  if (preferences.feedback_filter?.sla !== undefined) state.feedbackSlaFilter = preferences.feedback_filter.sla || "";
}

async function syncAdminPreferences() {
  persistAuditFilters();
  const preferences = {
    audit_filters: state.savedAuditFilters,
    error_filter: {
      level: state.errorLevelFilter,
      sla: state.errorSlaFilter,
    },
    feedback_filter: {
      sla: state.feedbackSlaFilter,
    },
  };
  try {
    const data = await apiRequest("/admin/preferences", {
      method: "PUT",
      body: JSON.stringify({ preferences }),
    });
    state.preferencesCloudAvailable = true;
    state.adminPreferences = data.preferences || preferences;
  } catch {
    state.preferencesCloudAvailable = false;
  }
}

function normalizeSavedAuditFilters(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => ({
    id: String(item?.id || `filter-${index}`),
    name: String(item?.name || "未命名筛选").slice(0, 40),
    from: String(item?.from || ""),
    to: String(item?.to || ""),
    action: String(item?.action || ""),
    created_at: String(item?.created_at || ""),
  })).filter((item) => item.name).slice(0, 12);
}

function persistAuditFilters() {
  localStorage.setItem(ADMIN_AUDIT_FILTERS_STORAGE_KEY, JSON.stringify(state.savedAuditFilters));
}

function confirmAdminAction(options = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "admin-confirm-overlay";
    overlay.id = "adminConfirmModal";
    overlay.innerHTML = `
      <section class="admin-confirm-card" role="dialog" aria-modal="true" aria-labelledby="adminConfirmTitle">
        <div>
          <p class="admin-eyebrow">${options.danger ? "高风险操作" : "操作确认"}</p>
          <h2 id="adminConfirmTitle">${escapeHtml(options.title || "确认操作")}</h2>
          <p>${escapeHtml(options.message || "请确认是否继续。")}</p>
        </div>
        ${options.reasonLabel ? `<label class="admin-confirm-reason">
          <span>${escapeHtml(options.reasonLabel)}</span>
          <textarea rows="4">${escapeHtml(options.defaultReason || "")}</textarea>
        </label>` : ""}
        <div class="admin-confirm-actions">
          <button type="button" data-admin-confirm-cancel>取消</button>
          <button type="button" class="${options.danger ? "danger-action" : "primary-action"}" data-admin-confirm-ok>${escapeHtml(options.confirmText || "确认")}</button>
        </div>
      </section>`;
    document.body.appendChild(overlay);
    const cancelButton = overlay.querySelector("[data-admin-confirm-cancel]");
    const okButton = overlay.querySelector("[data-admin-confirm-ok]");
    const textarea = overlay.querySelector("textarea");
    const previousFocus = document.activeElement;
    const finish = (value) => {
      document.removeEventListener("keydown", onKeydown);
      overlay.remove();
      previousFocus?.focus?.();
      resolve(value);
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") finish(options.reasonLabel ? "" : false);
      if (event.key === "Tab") trapFocus(event, overlay);
    };
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) finish(options.reasonLabel ? "" : false);
    });
    cancelButton.addEventListener("click", () => finish(options.reasonLabel ? "" : false));
    okButton.addEventListener("click", () => {
      if (options.reasonLabel) {
        const reason = textarea.value.trim();
        if (!reason) {
          toast("请填写原因", "warn");
          textarea.focus();
          return;
        }
        finish(reason);
        return;
      }
      finish(true);
    });
    document.addEventListener("keydown", onKeydown);
    (textarea || okButton).focus();
  });
}

function trapFocus(event, root) {
  const focusable = Array.from(root.querySelectorAll("button, textarea, input, select, a[href]"))
    .filter((item) => !item.disabled && item.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function applySession(data) {
  const organization = data.organization || data.activeOrganization || data.organizations?.[0] || null;
  state.authenticated = Boolean(data.authenticated ?? data.user);
  state.user = data.user || null;
  state.organizations = Array.isArray(data.organizations) ? data.organizations : organization ? [organization] : [];
  state.activeOrganization = organization;
  state.membership = data.membership || null;
}

async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${state.apiBaseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(state.activeOrganization?.id ? { "x-organization-id": state.activeOrganization.id } : {}),
        ...(options.headers || {}),
      },
      credentials: "include",
    });
  } catch {
    throw new Error(`无法连接云端 API：${state.apiBaseUrl}。请确认后端服务已启动，或检查 API 地址。`);
  }
  const text = await response.text();
  const data = text ? parseJson(text) : {};
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || text || response.statusText);
  }
  return data;
}

function buildUsageQuery() {
  const params = new URLSearchParams();
  if (els.adminFromInput.value) params.set("from", els.adminFromInput.value);
  if (els.adminToInput.value) params.set("to", els.adminToInput.value);
  if (els.adminTaskInput.value.trim()) params.set("task_type", els.adminTaskInput.value.trim());
  params.set("limit", "120");
  return `?${params.toString()}`;
}

function buildAuditQuery() {
  const params = new URLSearchParams();
  if (els.adminFromInput.value) params.set("from", els.adminFromInput.value);
  if (els.adminToInput.value) params.set("to", els.adminToInput.value);
  if (els.adminActionInput.value.trim()) params.set("action", els.adminActionInput.value.trim());
  params.set("limit", "120");
  return `?${params.toString()}`;
}

function filterEmails(emails) {
  const status = els.adminEmailStatusSelect.value;
  return emails.filter((item) => !status || item.status === status);
}

function getBillingWebhooks(dashboard) {
  const fromBilling = Array.isArray(state.billing?.payment_webhooks) ? state.billing.payment_webhooks : [];
  if (fromBilling.length) return fromBilling;
  return Array.isArray(dashboard?.billing?.payment_webhooks) ? dashboard.billing.payment_webhooks : [];
}

function getManualPaymentOrders() {
  const fromBilling = Array.isArray(state.billing?.manual_orders) ? state.billing.manual_orders : [];
  if (fromBilling.length) return fromBilling;
  return Array.isArray(state.dashboard?.billing?.manual_orders) ? state.dashboard.billing.manual_orders : [];
}

function getCreditLedger() {
  const fromBilling = Array.isArray(state.billing?.credit_ledger) ? state.billing.credit_ledger : [];
  if (fromBilling.length) return fromBilling;
  return Array.isArray(state.dashboard?.billing?.credit_ledger) ? state.dashboard.billing.credit_ledger : [];
}

function getActiveOrgId() {
  return state.dashboard?.organization?.id || state.activeOrganization?.id || "";
}

function renderList(rows, emptyText) {
  els.adminContent.innerHTML = `<div class="cloud-admin-list">${rows.length ? rows.join("") : emptyRow(emptyText)}</div>`;
}

function row(title, detail) {
  return `<div><strong>${escapeHtml(String(title ?? ""))}</strong><span>${escapeHtml(String(detail ?? ""))}</span></div>`;
}

function emptyRow(text) {
  return `<div class="admin-empty-row">${escapeHtml(text)}</div>`;
}

function opsRow(title, detail, buttonText, buttonAttrs) {
  return `<div class="cloud-admin-ops-row"><strong>${escapeHtml(String(title ?? ""))}</strong><span>${escapeHtml(String(detail ?? ""))}</span><button type="button" ${buttonAttrs}>${escapeHtml(buttonText)}</button></div>`;
}

function metricCard(value, label) {
  return `<div><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>`;
}

async function copyJson(value, message) {
  await copyText(JSON.stringify(value || {}, null, 2), message);
}

async function copyText(text, message) {
  const copied = await copyTextToClipboard(text);
  toast(copied ? message : "复制失败，请手动复制", copied ? "info" : "warn");
}

function exportCsv(fileName, rows) {
  if (!rows.length) {
    toast("没有可导出的记录", "warn");
    return;
  }
  const csv = buildCsv(rows);
  if (downloadBlob(fileName, csv, "text/csv;charset=utf-8")) {
    toast("CSV 已导出");
  }
}

function downloadBlob(fileName, content, type) {
  const downloaded = triggerDownload(fileName, content, type);
  if (!downloaded) toast("下载失败，请检查浏览器下载权限后重试", "warn");
  return downloaded;
}

async function withLoading(button, label, fn) {
  if (!button) return fn();
  const original = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try {
    return await fn();
  } catch (error) {
    toast(error.message || "操作失败", "error");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function toast(message, type = "info") {
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  els.adminToastRegion.appendChild(item);
  window.setTimeout(() => item.remove(), 3200);
}

function debounce(fn, delay = 250) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  if (shouldReplaceLocalApiBaseUrl(raw)) return DEFAULT_API_BASE_URL;
  return (raw || DEFAULT_API_BASE_URL).replace(/\/+$/, "") || DEFAULT_API_BASE_URL;
}

function getDefaultApiBaseUrl() {
  const location = window.location;
  if (!location || !["http:", "https:"].includes(location.protocol)) {
    return LOCAL_API_BASE_URL;
  }
  if (isLocalDevelopmentHost(location.hostname)) {
    return LOCAL_API_BASE_URL;
  }
  return `${location.origin}/api`;
}

function isLocalDevelopmentHost(hostname) {
  return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(String(hostname || "").toLowerCase());
}

function shouldReplaceLocalApiBaseUrl(value) {
  if (DEFAULT_API_BASE_URL === LOCAL_API_BASE_URL) return false;
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]):8787\/api\/?$/i.test(String(value || "").trim());
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(value || "");
  return String(value || "").replace(/"/g, '\\"');
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
