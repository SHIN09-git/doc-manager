export function createTrashController({
  els,
  ui,
  renderTrashModal,
  restoreAllTrashDocuments,
  clearTrashDocuments,
  getFocusableElements,
}) {
  function bindEvents() {
    setTrashExpanded(false);
    els.trashTopBtn?.addEventListener("click", openTrashModal);
    els.closeTrashModalBtn?.addEventListener("click", closeTrashModal);
    els.restoreAllTrashBtn?.addEventListener("click", restoreAllTrashDocuments);
    els.clearTrashBtn?.addEventListener("click", clearTrashDocuments);
    els.trashModal?.addEventListener("keydown", handleTrashModalKeydown);
    els.trashModal?.addEventListener("mousedown", (event) => {
      if (event.target === els.trashModal) closeTrashModal();
    });
  }

  function openTrashModal() {
    if (!els.trashModal) return;
    ui.trashModalReturnFocus = document.activeElement;
    renderTrashModal();
    els.trashModal.hidden = false;
    document.body.classList.add("modal-open");
    setTrashExpanded(true);
    window.setTimeout(() => {
      const target = els.closeTrashModalBtn || els.trashModal.querySelector(".trash-modal");
      target?.focus?.();
    }, 0);
  }

  function closeTrashModal() {
    if (!els.trashModal || els.trashModal.hidden) return;
    els.trashModal.hidden = true;
    document.body.classList.remove("modal-open");
    setTrashExpanded(false);
    const returnTarget = ui.trashModalReturnFocus?.isConnected ? ui.trashModalReturnFocus : els.trashTopBtn;
    ui.trashModalReturnFocus = null;
    returnTarget?.focus?.();
  }

  function handleTrashModalKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeTrashModal();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = getFocusableElements(els.trashModal);
    if (focusable.length === 0) {
      event.preventDefault();
      els.trashModal.querySelector(".trash-modal")?.focus();
      return;
    }
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

  function setTrashExpanded(expanded) {
    els.trashTopBtn?.setAttribute("aria-expanded", String(expanded));
  }

  return {
    bindEvents,
    openTrashModal,
    closeTrashModal,
    handleTrashModalKeydown,
  };
}
