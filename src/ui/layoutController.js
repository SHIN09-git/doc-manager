const WORKSPACE_LAYOUT_KEY = "mowen-nibi-workbench:workspace-layout";
const DEFAULT_WORKSPACE_LAYOUT = { sidebar: 284, inspector: 360 };

export function createLayoutController({ els, ui }) {
  function bindEvents() {
    els.responsiveInspectorToggle?.addEventListener("click", toggleResponsiveTools);
    els.responsiveBackdrop?.addEventListener("click", closeResponsiveInspector);
    els.mobileWorkspaceNav?.addEventListener("click", handleMobileWorkspaceNav);
  }

  function restoreWorkspaceLayout() {
    const layout = readWorkspaceLayout();
    applyWorkspaceLayout(layout);
  }

  function setupWorkspaceResizers() {
    setupWorkspaceResizer(els.leftWorkspaceResizer, "left");
    setupWorkspaceResizer(els.rightWorkspaceResizer, "right");
  }

  function setupResponsiveWorkspace() {
    setMobileView(ui.mobileView || "editor", { focus: false });
    syncResponsiveWorkspace();
    window.addEventListener("resize", syncResponsiveWorkspace);
  }

  function syncResponsiveWorkspace() {
    document.body.classList.toggle("is-mobile-workspace", isMobileWorkspace());
    if (!isResponsiveWorkspace() || isMobileWorkspace()) closeResponsiveInspector();
    updateResponsiveControls();
  }

  function handleMobileWorkspaceNav(event) {
    const button = event.target.closest("[data-mobile-view]");
    if (!button) return;
    setMobileView(button.dataset.mobileView, { focus: true });
  }

  function setMobileView(view, options = {}) {
    const nextView = ["docs", "editor", "tools"].includes(view) ? view : "editor";
    ui.mobileView = nextView;
    document.body.dataset.mobileView = nextView;
    updateResponsiveControls();
    if (!options.focus || !isMobileWorkspace()) return;
    const focusTarget = {
      docs: els.searchInput,
      editor: els.titleInput,
      tools: document.querySelector(".tab.active"),
    }[nextView];
    window.setTimeout(() => focusTarget?.focus?.(), 0);
  }

  function toggleResponsiveTools() {
    if (isMobileWorkspace()) {
      setMobileView("tools", { focus: true });
      return;
    }
    if (!isResponsiveWorkspace()) return;
    if (document.body.classList.contains("inspector-open")) {
      closeResponsiveInspector();
    } else {
      openResponsiveInspector();
    }
  }

  function openResponsiveTools() {
    if (isMobileWorkspace()) {
      setMobileView("tools", { focus: true });
      return;
    }
    if (isResponsiveWorkspace()) openResponsiveInspector();
  }

  function openResponsiveInspector() {
    document.body.classList.add("inspector-open");
    updateResponsiveControls();
    window.setTimeout(() => document.querySelector(".tab.active")?.focus?.(), 0);
  }

  function closeResponsiveInspector() {
    if (!document.body.classList.contains("inspector-open")) return;
    document.body.classList.remove("inspector-open");
    updateResponsiveControls();
  }

  function updateResponsiveControls() {
    const inspectorOpen = document.body.classList.contains("inspector-open");
    els.responsiveInspectorToggle?.setAttribute("aria-expanded", String(inspectorOpen || ui.mobileView === "tools"));
    document.querySelectorAll(".mobile-view-tab").forEach((button) => {
      const active = button.dataset.mobileView === ui.mobileView;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function isResponsiveWorkspace() {
    return window.matchMedia?.("(max-width: 1100px)")?.matches || window.innerWidth <= 1100;
  }

  function isMobileWorkspace() {
    return window.matchMedia?.("(max-width: 768px)")?.matches || window.innerWidth <= 768;
  }

  function setupWorkspaceResizer(handle, side) {
    if (!handle || !els.workspace) return;
    handle.addEventListener("pointerdown", (event) => {
      if (window.matchMedia("(max-width: 1180px)").matches) return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      handle.classList.add("dragging");
      const startX = event.clientX;
      const startLayout = readWorkspaceLayout();
      const onPointerMove = (moveEvent) => {
        const delta = moveEvent.clientX - startX;
        const nextLayout = resizeWorkspaceLayout(startLayout, side, delta);
        applyWorkspaceLayout(nextLayout);
      };
      const onPointerUp = () => {
        handle.classList.remove("dragging");
        const nextLayout = readWorkspaceLayoutFromCss();
        saveWorkspaceLayout(nextLayout);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
      };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    });
    handle.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 24 : -24;
      const layout = resizeWorkspaceLayout(readWorkspaceLayout(), side, delta);
      applyWorkspaceLayout(layout);
      saveWorkspaceLayout(layout);
    });
  }

  function resizeWorkspaceLayout(layout, side, delta) {
    if (side === "left") return normalizeWorkspaceLayout({ ...layout, sidebar: layout.sidebar + delta });
    return normalizeWorkspaceLayout({ ...layout, inspector: layout.inspector - delta });
  }

  function readWorkspaceLayout() {
    try {
      const parsed = JSON.parse(localStorage.getItem(WORKSPACE_LAYOUT_KEY) || "null");
      return normalizeWorkspaceLayout({ ...DEFAULT_WORKSPACE_LAYOUT, ...parsed });
    } catch {
      return normalizeWorkspaceLayout(DEFAULT_WORKSPACE_LAYOUT);
    }
  }

  function readWorkspaceLayoutFromCss() {
    const styles = getComputedStyle(document.documentElement);
    return normalizeWorkspaceLayout({
      sidebar: Number.parseInt(styles.getPropertyValue("--sidebar-w"), 10),
      inspector: Number.parseInt(styles.getPropertyValue("--inspector-w"), 10),
    });
  }

  function saveWorkspaceLayout(layout) {
    try {
      localStorage.setItem(WORKSPACE_LAYOUT_KEY, JSON.stringify(normalizeWorkspaceLayout(layout)));
    } catch {
      // Layout preferences are optional; ignore storage failures.
    }
  }

  function applyWorkspaceLayout(layout) {
    const normalized = normalizeWorkspaceLayout(layout);
    document.documentElement.style.setProperty("--sidebar-w", `${normalized.sidebar}px`);
    document.documentElement.style.setProperty("--inspector-w", `${normalized.inspector}px`);
  }

  function normalizeWorkspaceLayout(layout) {
    const workspaceWidth = els.workspace?.clientWidth || window.innerWidth || 1280;
    const handleWidth = 16;
    const minEditor = 420;
    const sidebar = clampNumber(layout.sidebar, 220, Math.min(440, workspaceWidth - 300 - minEditor - handleWidth));
    const inspector = clampNumber(layout.inspector, 300, Math.min(560, workspaceWidth - sidebar - minEditor - handleWidth));
    return { sidebar, inspector };
  }

  function clampNumber(value, min, max) {
    const finiteValue = Number.isFinite(value) ? value : min;
    const safeMax = Math.max(min, max);
    return Math.min(Math.max(finiteValue, min), safeMax);
  }

  return {
    bindEvents,
    restoreWorkspaceLayout,
    setupWorkspaceResizers,
    setupResponsiveWorkspace,
    setMobileView,
    openResponsiveTools,
    closeResponsiveInspector,
    isMobileWorkspace,
  };
}
