export function createCloudActionsController(deps = {}) {
  const {
    state = {},
    els = {},
    cloudRequest = async () => ({}),
    withLoading = async (_button, _label, task) => task(),
    persist = () => {},
    renderCloudPanel = () => {},
    renderCloudManualPaymentMethods = () => {},
    downloadBlob = () => {},
    toast = () => {},
    switchTab = () => {},
    switchMainView = () => {},
    windowRef = globalThis.window,
    dateProvider = () => new Date(),
  } = deps;
  let eventsBound = false;

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;
    els.cloudManualOrderBtn?.addEventListener("click", cloudSubmitManualOrder);
    els.cloudManualPackageSelect?.addEventListener("change", renderCloudManualPaymentMethods);
    els.cloudManualPaymentMethodSelect?.addEventListener("change", renderCloudManualPaymentMethods);
    els.cloudExportDataBtn?.addEventListener("click", cloudExportMyData);
    els.cloudDeleteAccountBtn?.addEventListener("click", cloudDeleteAccount);
    els.cloudSendFeedbackBtn?.addEventListener("click", cloudSendFeedback);
    windowRef?.addEventListener?.("hashchange", handleHashRoute);
    handleHashRoute();
  }

  async function refreshCloudUsage(options = {}) {
    if (!state.cloud?.authenticated) return null;
    const data = await cloudRequest("/usage/current", { method: "GET" });
    state.cloud.usage = data.usage || null;
    state.cloud.limits = data.limits || null;
    if (!options.silent) toast("云端用量已刷新");
    return data;
  }

  async function refreshCloudBilling(options = {}) {
    if (!state.cloud?.authenticated) return null;
    try {
      const data = await cloudRequest("/billing/summary", { method: "GET" });
      state.cloud.billing = data || null;
      if (!options.silent) toast("账单与套餐已刷新");
      return state.cloud.billing;
    } catch (error) {
      if (error.status === 403) {
        try {
          const data = await cloudRequest("/billing/manual-orders", { method: "GET" });
          state.cloud.billing = {
            organization: state.cloud.activeOrganization || null,
            checkout: { enabled: false, available_plans: [] },
            manual_payment: data.manual_payment || {},
            manual_orders: data.orders || [],
            credits: data.credits || null,
            credit_ledger: data.credit_ledger || [],
          };
          return state.cloud.billing;
        } catch {
          state.cloud.billing = null;
        }
      }
      state.cloud.billing = null;
      if (error.status !== 403 && !options.silent) {
        toast(`账单信息读取失败：${error.message}`, "warn");
      }
      return null;
    }
  }

  async function cloudSubmitManualOrder() {
    const packageId = els.cloudManualPackageSelect?.value || "";
    const paymentChannel = els.cloudManualPaymentMethodSelect?.value || "wechat";
    const payerNote = (els.cloudManualOrderNoteInput?.value || "").trim();
    const proofText = (els.cloudManualProofInput?.value || "").trim();
    if (!packageId) {
      toast("请选择充值套餐", "warn");
      return null;
    }
    if (!payerNote && !proofText) {
      toast("请填写付款备注或凭证说明，方便管理员核对", "warn");
      els.cloudManualOrderNoteInput?.focus?.();
      return null;
    }
    return withLoading(els.cloudManualOrderBtn, "提交中", async () => {
      const data = await cloudRequest("/billing/manual-orders", {
        method: "POST",
        body: JSON.stringify({
          package_id: packageId,
          payment_channel: paymentChannel,
          payer_note: payerNote,
          proof_text: proofText,
        }),
      });
      if (els.cloudManualOrderNoteInput) els.cloudManualOrderNoteInput.value = "";
      if (els.cloudManualProofInput) els.cloudManualProofInput.value = "";
      await refreshCloudBilling({ silent: true });
      renderCloudPanel();
      const orderId = data.order?.id ? `（订单号：${data.order.id}）` : "";
      toast(`充值订单已提交：${data.order?.title || packageId}${orderId}`);
      return data;
    });
  }

  async function cloudExportMyData() {
    return withLoading(els.cloudExportDataBtn, "导出中", async () => {
      const data = await cloudRequest("/me/export", { method: "GET" });
      const date = dateProvider().toISOString().slice(0, 10);
      downloadBlob(`mowen-cloud-export-${date}.json`, JSON.stringify(data, null, 2), "application/json;charset=utf-8");
      toast("我的云端数据已导出");
      return data;
    });
  }

  async function cloudDeleteAccount() {
    if (!windowRef?.confirm?.("确定删除云端账号吗？这会退出云端并停用当前账号。")) return false;
    return withLoading(els.cloudDeleteAccountBtn, "删除中", async () => {
      await cloudRequest("/me", { method: "DELETE" });
      state.cloud = {
        ...(state.cloud || {}),
        authenticated: false,
        user: null,
        activeOrganization: null,
        membership: null,
        members: [],
        invitations: [],
        usage: null,
        limits: null,
        billing: null,
      };
      persist();
      renderCloudPanel();
      toast("云端账号已删除，本地数据仍保留", "warn");
      return true;
    });
  }

  function openStandaloneAdminPage() {
    if (!["owner", "admin"].includes(state.cloud?.membership?.role || "")) {
      toast("只有管理员可以查看管理后台", "warn");
      switchTab("cloud");
      return false;
    }
    if (windowRef?.location) windowRef.location.href = "./admin.html";
    return true;
  }

  function handleHashRoute() {
    if (windowRef?.location?.hash === "#admin") {
      return openStandaloneAdminPage();
    }
    if (windowRef?.location?.hash === "#cloud") {
      switchMainView("cloud");
      return true;
    }
    return false;
  }

  async function cloudSendFeedback() {
    const message = els.cloudFeedbackInput?.value.trim() || "";
    if (!message) {
      toast("请先填写反馈内容", "warn");
      return null;
    }
    return withLoading(els.cloudSendFeedbackBtn, "提交中", async () => {
      const data = await cloudRequest("/feedback", {
        method: "POST",
        body: JSON.stringify({ message, source: "cloud_panel" }),
      });
      if (els.cloudFeedbackInput) els.cloudFeedbackInput.value = "";
      toast("反馈已提交");
      return data;
    });
  }

  return {
    bindEvents,
    refreshCloudUsage,
    refreshCloudBilling,
    cloudSubmitManualOrder,
    cloudExportMyData,
    cloudDeleteAccount,
    openStandaloneAdminPage,
    handleHashRoute,
    cloudSendFeedback,
  };
}
