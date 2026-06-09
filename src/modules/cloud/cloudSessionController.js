export function createCloudSessionController(deps = {}) {
  const {
    state = {},
    els = {},
    normalizeCloudBaseUrl = (value) => String(value || "").trim(),
    cloudRequest = async () => ({}),
    refreshCloudUsage = async () => {},
    refreshCloudBilling = async () => {},
    withLoading = async (_button, _label, task) => task(),
    persist = () => {},
    renderCloudPanel = () => {},
    toast = () => {},
    getCloudSettingsLocation = () => "",
    windowRef = globalThis.window,
  } = deps;
  let eventsBound = false;

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;
    els.cloudBaseUrlInput?.addEventListener("change", saveCloudBaseUrlFromInput);
    els.cloudRefreshBtn?.addEventListener("click", refreshCloudStatus);
    els.cloudLoginBtn?.addEventListener("click", cloudLogin);
    els.cloudRegisterBtn?.addEventListener("click", cloudRegister);
    els.cloudLogoutBtn?.addEventListener("click", cloudLogout);
    els.cloudRequestVerifyBtn?.addEventListener("click", cloudRequestEmailVerification);
    els.cloudVerifyEmailBtn?.addEventListener("click", cloudVerifyEmail);
    els.cloudRequestResetBtn?.addEventListener("click", cloudRequestPasswordReset);
    els.cloudConfirmResetBtn?.addEventListener("click", cloudConfirmPasswordReset);
    els.cloudLogoutAllBtn?.addEventListener("click", cloudLogoutAllDevices);
  }

  function ensureCloudState() {
    state.cloud = state.cloud || {};
    return state.cloud;
  }

  function saveCloudBaseUrlFromInput() {
    ensureCloudState().apiBaseUrl = normalizeCloudBaseUrl(els.cloudBaseUrlInput?.value);
    persist();
    renderCloudPanel();
    toast(`云端地址已保存到：${getCloudSettingsLocation()}`);
  }

  function applyCloudSession(data = {}) {
    const organization = data.organization || data.activeOrganization || data.organizations?.[0] || null;
    state.cloud = {
      ...ensureCloudState(),
      authenticated: Boolean(data.authenticated ?? data.user),
      user: data.user || null,
      organizations: Array.isArray(data.organizations) ? data.organizations : organization ? [organization] : [],
      activeOrganization: organization,
      membership: data.membership || null,
    };
    return state.cloud;
  }

  async function refreshCloudStatus() {
    return withLoading(els.cloudRefreshBtn, "刷新中", async () => {
      try {
        ensureCloudState().apiBaseUrl = normalizeCloudBaseUrl(els.cloudBaseUrlInput?.value);
        const data = await cloudRequest("/me", { method: "GET" });
        applyCloudSession(data);
        if (state.cloud.authenticated) {
          await refreshCloudUsage({ silent: true });
          await refreshCloudBilling({ silent: true });
        }
        persist();
        renderCloudPanel();
        toast(state.cloud.authenticated ? "云端状态已刷新" : "当前为本地模式");
        return state.cloud;
      } catch (error) {
        ensureCloudState().authenticated = false;
        state.cloud.user = null;
        state.cloud.usage = null;
        state.cloud.billing = null;
        persist();
        renderCloudPanel();
        toast(`云端连接失败：${error.message}`, "error");
        return null;
      }
    });
  }

  async function cloudLogin() {
    return withLoading(els.cloudLoginBtn, "登录中", async () => {
      ensureCloudState().apiBaseUrl = normalizeCloudBaseUrl(els.cloudBaseUrlInput?.value);
      const data = await cloudRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: els.cloudEmailInput?.value.trim() || "",
          password: els.cloudPasswordInput?.value || "",
        }),
      });
      applyCloudSession(data);
      if (data.email_verification_token && els.cloudEmailTokenInput) {
        els.cloudEmailTokenInput.value = data.email_verification_token;
      }
      await refreshCloudUsage({ silent: true });
      await refreshCloudBilling({ silent: true });
      persist();
      renderCloudPanel();
      toast(`已登录云端：${getCloudSettingsLocation()}`);
      return data;
    });
  }

  async function cloudRegister() {
    return withLoading(els.cloudRegisterBtn, "注册中", async () => {
      ensureCloudState().apiBaseUrl = normalizeCloudBaseUrl(els.cloudBaseUrlInput?.value);
      const name = els.cloudNameInput?.value.trim() || els.cloudEmailInput?.value.trim() || "";
      const data = await cloudRequest("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: els.cloudEmailInput?.value.trim() || "",
          password: els.cloudPasswordInput?.value || "",
          name,
          organizationName: `${name || "我的"}工作区`,
        }),
      });
      applyCloudSession(data);
      await refreshCloudUsage({ silent: true });
      await refreshCloudBilling({ silent: true });
      persist();
      renderCloudPanel();
      if (data.email_delivery?.status === "failed") {
        toast("云端账号已创建，但验证邮件暂时未发出，请稍后点击发送验证码。", "warn");
      } else {
        toast(`云端账号已创建：${getCloudSettingsLocation()}`);
      }
      return data;
    });
  }

  async function cloudLogout() {
    return withLoading(els.cloudLogoutBtn, "退出中", async () => {
      await cloudRequest("/auth/logout", { method: "POST", body: JSON.stringify({}) }).catch(() => null);
      resetCloudSession();
      persist();
      renderCloudPanel();
      toast("已退出云端账号", "warn");
    });
  }

  async function cloudLogoutAllDevices() {
    if (!windowRef?.confirm?.("确定要退出所有云端设备吗？当前页面也会退出。")) return false;
    return withLoading(els.cloudLogoutAllBtn, "退出中", async () => {
      await cloudRequest("/auth/logout-all", { method: "POST", body: JSON.stringify({}) });
      resetCloudSession();
      persist();
      renderCloudPanel();
      toast("已退出所有云端设备", "warn");
      return true;
    });
  }

  async function cloudRequestEmailVerification() {
    const email = els.cloudEmailInput?.value.trim() || state.cloud?.user?.email || "";
    return withLoading(els.cloudRequestVerifyBtn, "申请中", async () => {
      const data = await cloudRequest("/auth/request-email-verification", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      if (data.email_verification_token) {
        if (els.cloudEmailTokenInput) els.cloudEmailTokenInput.value = data.email_verification_token;
        toast("邮箱验证码已生成，灰度环境可直接复制使用");
      } else {
        toast(data.verified ? "邮箱已验证" : "验证请求已提交");
      }
      return data;
    });
  }

  async function cloudVerifyEmail() {
    const email = els.cloudEmailInput?.value.trim() || state.cloud?.user?.email || "";
    const token = els.cloudEmailTokenInput?.value.trim() || "";
    if (!token) {
      toast("请先填写邮箱验证码", "warn");
      return null;
    }
    return withLoading(els.cloudVerifyEmailBtn, "验证中", async () => {
      const data = await cloudRequest("/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ email, token }),
      });
      ensureCloudState().user = data.user || state.cloud.user;
      if (els.cloudEmailTokenInput) els.cloudEmailTokenInput.value = "";
      persist();
      renderCloudPanel();
      toast("邮箱已验证");
      return data;
    });
  }

  async function cloudRequestPasswordReset() {
    const email = els.cloudEmailInput?.value.trim() || "";
    if (!email) {
      toast("请先填写邮箱", "warn");
      return null;
    }
    return withLoading(els.cloudRequestResetBtn, "申请中", async () => {
      const data = await cloudRequest("/auth/request-password-reset", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      if (data.reset_token) {
        if (els.cloudResetTokenInput) els.cloudResetTokenInput.value = data.reset_token;
        toast("重置码已生成，灰度环境可直接复制使用");
      } else {
        toast("如果账号存在，重置请求已提交");
      }
      return data;
    });
  }

  async function cloudConfirmPasswordReset() {
    const email = els.cloudEmailInput?.value.trim() || "";
    const token = els.cloudResetTokenInput?.value.trim() || "";
    const password = els.cloudNewPasswordInput?.value || "";
    if (!email || !token || !password) {
      toast("请填写邮箱、重置码和新密码", "warn");
      return null;
    }
    return withLoading(els.cloudConfirmResetBtn, "重置中", async () => {
      await cloudRequest("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ email, token, password }),
      });
      if (els.cloudResetTokenInput) els.cloudResetTokenInput.value = "";
      if (els.cloudNewPasswordInput) els.cloudNewPasswordInput.value = "";
      toast("密码已重置，请重新登录");
      return true;
    });
  }

  function resetCloudSession() {
    state.cloud = {
      ...ensureCloudState(),
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
    return state.cloud;
  }

  return {
    bindEvents,
    saveCloudBaseUrlFromInput,
    applyCloudSession,
    refreshCloudStatus,
    cloudLogin,
    cloudRegister,
    cloudLogout,
    cloudLogoutAllDevices,
    cloudRequestEmailVerification,
    cloudVerifyEmail,
    cloudRequestPasswordReset,
    cloudConfirmPasswordReset,
    resetCloudSession,
  };
}
