import { EXPORT_LAYOUTS } from "./documentManager.js";

export function createExportMenuController({
  els,
  state,
  persist = () => {},
  exportCurrentDocument = async () => null,
  documentRef = globalThis.document,
}) {
  function bindEvents() {
    els.exportFormatBtn?.addEventListener("click", toggleMenu);
    els.exportFormatMenu?.addEventListener("click", handleMenuClick);
    els.exportFormatMenu?.addEventListener("keydown", handleMenuKeydown);
    documentRef?.addEventListener?.("pointerdown", handleOutsidePointer);
    documentRef?.addEventListener?.("keydown", (event) => {
      if (event.key === "Escape" && isOpen()) closeMenu({ restoreFocus: true });
    });
    syncLayout();
  }

  function getLayout() {
    const layout = state.settings?.exportLayout;
    return EXPORT_LAYOUTS[layout] ? layout : "standard";
  }

  function syncLayout() {
    const layout = getLayout();
    const label = EXPORT_LAYOUTS[layout].label;
    els.exportDocBtn?.setAttribute("title", `导出当前文档为 Word（${label}）`);
    els.exportDocBtn?.setAttribute("data-export-layout", layout);
    els.exportFormatMenu?.querySelectorAll("[data-export-layout]").forEach((item) => {
      item.setAttribute("aria-checked", String(item.dataset.exportLayout === layout));
    });
  }

  function isOpen() {
    return Boolean(els.exportFormatMenu && !els.exportFormatMenu.hidden);
  }

  function toggleMenu() {
    if (isOpen()) closeMenu();
    else openMenu();
  }

  function openMenu() {
    if (!els.exportFormatMenu || !els.exportFormatBtn) return;
    syncLayout();
    els.exportFormatMenu.hidden = false;
    els.exportFormatBtn.setAttribute("aria-expanded", "true");
    // 菜单用 fixed 定位，避免被窄屏顶栏的横向滚动容器裁切
    const rect = els.exportFormatBtn.getBoundingClientRect?.();
    if (rect) {
      const menuWidth = els.exportFormatMenu.offsetWidth || 280;
      const viewportWidth = globalThis.window?.innerWidth || rect.right;
      els.exportFormatMenu.style.top = `${Math.round(rect.bottom + 6)}px`;
      els.exportFormatMenu.style.left = `${Math.round(Math.max(8, Math.min(rect.right - menuWidth, viewportWidth - menuWidth - 8)))}px`;
    }
    const checked = els.exportFormatMenu.querySelector('[aria-checked="true"]') || getItems()[0];
    checked?.focus?.();
  }

  function closeMenu({ restoreFocus = false } = {}) {
    if (!els.exportFormatMenu) return;
    els.exportFormatMenu.hidden = true;
    els.exportFormatBtn?.setAttribute("aria-expanded", "false");
    if (restoreFocus) els.exportFormatBtn?.focus?.();
  }

  function getItems() {
    return [...(els.exportFormatMenu?.querySelectorAll("[data-export-layout]") || [])];
  }

  async function handleMenuClick(event) {
    const item = event.target?.closest?.("[data-export-layout]");
    if (!item) return null;
    return chooseLayout(item.dataset.exportLayout);
  }

  async function chooseLayout(layout) {
    if (!EXPORT_LAYOUTS[layout]) return null;
    state.settings = state.settings && typeof state.settings === "object" ? state.settings : {};
    state.settings.exportLayout = layout;
    persist();
    syncLayout();
    closeMenu({ restoreFocus: true });
    return exportCurrentDocument({ layout });
  }

  function handleMenuKeydown(event) {
    const items = getItems();
    const index = items.indexOf(documentRef?.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus?.();
    } else if (event.key === "Tab") {
      closeMenu();
    }
  }

  function handleOutsidePointer(event) {
    if (!isOpen()) return;
    if (els.exportFormatMenu.contains(event.target) || els.exportFormatBtn?.contains(event.target)) return;
    closeMenu();
  }

  return { bindEvents, syncLayout, getLayout, chooseLayout, openMenu, closeMenu };
}
