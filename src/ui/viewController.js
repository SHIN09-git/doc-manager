export function createViewController(deps = {}) {
  const {
    els = {},
    ui = {},
    layoutController = {},
    renderCloudPanel = () => {},
    documentRef = globalThis.document,
    windowRef = globalThis.window,
  } = deps;
  let eventsBound = false;

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;
    els.apiTopBtn?.addEventListener("click", () => {
      switchMainView("editor");
      switchTab("api");
      layoutController.openResponsiveTools?.();
    });
    els.cloudTopBtn?.addEventListener("click", () => {
      switchMainView(ui.mainView === "cloud" ? "editor" : "cloud");
      renderCloudPanel();
    });
    els.cloudBackToEditorBtn?.addEventListener("click", () => switchMainView("editor"));
    els.pptBackToEditorBtn?.addEventListener("click", () => switchMainView("editor"));
    documentRef?.querySelector?.(".tabs")?.addEventListener("click", handleTabClick);
  }

  function handleTabClick(event) {
    const button = event.target?.closest?.(".tab");
    if (!button) return false;
    switchTab(button.dataset?.tab);
    if (layoutController.isMobileWorkspace?.()) {
      layoutController.setMobileView?.(button.dataset?.tab === "ppt" ? "editor" : "tools");
    }
    return true;
  }

  function switchTab(tabName) {
    if (tabName === "cloud") {
      switchMainView("cloud");
      return;
    }
    if (tabName === "ppt") {
      switchMainView("ppt");
      return;
    }
    switchMainView("editor");
    const targetPanelId = `${tabName}Panel`;
    if (documentRef?.getElementById && !documentRef.getElementById(targetPanelId)) return;
    documentRef?.querySelectorAll?.(".tab").forEach((button) => {
      const active = button.dataset?.tab === tabName;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    documentRef?.querySelectorAll?.(".tab-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === targetPanelId);
    });
    if (els.apiTopBtn) {
      const apiActive = tabName === "api";
      els.apiTopBtn.classList.toggle("active", apiActive);
      els.apiTopBtn.setAttribute("aria-pressed", String(apiActive));
    }
    if (els.cloudTopBtn) {
      els.cloudTopBtn.classList.toggle("active", ui.mainView === "cloud");
      els.cloudTopBtn.setAttribute("aria-pressed", String(ui.mainView === "cloud"));
    }
    windowRef?.lucide?.createIcons?.();
  }

  function switchMainView(view = "editor") {
    const cloudActive = view === "cloud";
    const pptActive = view === "ppt";
    ui.mainView = cloudActive ? "cloud" : pptActive ? "ppt" : "editor";
    if (els.editorPanel) {
      els.editorPanel.dataset.mainView = ui.mainView;
      els.editorPanel.setAttribute("aria-label", cloudActive ? "我的云端" : pptActive ? "PPT 生成" : "文档编辑");
    }
    if (els.cloudPanel) {
      els.cloudPanel.hidden = !cloudActive;
    }
    if (els.pptPanel) {
      els.pptPanel.hidden = !pptActive;
      els.pptPanel.classList.toggle("active", pptActive);
    }
    if (pptActive) {
      setActiveTabAndPanel("ppt", "pptPanel");
    } else if (!cloudActive && !documentRef?.querySelector?.(".tab-panel.active:not(#pptPanel)")) {
      setActiveTabAndPanel("style", "stylePanel");
    }
    if (els.cloudTopBtn) {
      els.cloudTopBtn.classList.toggle("active", cloudActive);
      els.cloudTopBtn.setAttribute("aria-pressed", String(cloudActive));
    }
    if ((cloudActive || pptActive) && els.apiTopBtn) {
      els.apiTopBtn.classList.remove("active");
      els.apiTopBtn.setAttribute("aria-pressed", "false");
    }
    if (cloudActive || pptActive) {
      if (layoutController.isMobileWorkspace?.()) layoutController.setMobileView?.("editor");
      if (cloudActive) renderCloudPanel();
      windowRef?.requestAnimationFrame?.(() => {
        (cloudActive ? els.cloudPanel : els.pptPanel)?.focus?.({ preventScroll: true });
      });
    }
  }

  function setActiveTabAndPanel(tabName, panelId) {
    documentRef?.querySelectorAll?.(".tab").forEach((button) => {
      const active = button.dataset?.tab === tabName;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    documentRef?.querySelectorAll?.(".tab-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === panelId);
    });
  }

  return {
    bindEvents,
    handleTabClick,
    switchTab,
    switchMainView,
  };
}
