import { escapeHtml, formatTime } from "../../utils/helpers.js";

export function createDocumentRenderer(deps) {
  const {
    state,
    ui,
    els,
    getType,
    getCurrentDoc,
    getDocumentLocation,
    onSelectDocument,
    onCopyDocument,
    onMoveDocument,
    onMoveDocumentToTop,
    onMoveDocumentToBottom,
    onDeleteDocument,
    onRestoreDocument,
    onRestoreAllTrash,
    onPermanentlyDeleteDocument,
    onClearTrash,
  } = deps;
  let draggedDocId = null;

  function getVisibleDocuments() {
    const query = els.searchInput.value.trim().toLowerCase();
    return state.docs
      .filter((doc) => !doc.deletedAt)
      .filter((doc) => ui.selectedFolderId === "all" || doc.folderId === ui.selectedFolderId)
      .filter((doc) => {
        if (!query) return true;
        return `${doc.title}\n${doc.content}`.toLowerCase().includes(query);
      });
  }

  function renderDocList() {
    const docs = getVisibleDocuments();
    const trashCount = state.docs.filter((doc) => doc.deletedAt).length;
    els.docCount.textContent = String(docs.length);
    if (els.trashCount) els.trashCount.textContent = String(trashCount);
    els.trashTopBtn?.classList.toggle("has-trash", trashCount > 0);
    els.docList.setAttribute("role", "listbox");
    els.docList.setAttribute("aria-label", "文档列表");

    if (docs.length === 0) {
      els.docList.innerHTML = `<div class="empty-state">没有匹配的文档</div>`;
      renderTrashModal();
      return;
    }

    els.docList.innerHTML = docs
      .map((doc) => {
        const type = getType(doc.type).name;
        const folder = state.folders.find((item) => item.id === doc.folderId);
        const active = doc.id === ui.selectedDocId;
        const docId = escapeHtml(doc.id);
        const actions = `<button class="tiny-button" type="button" title="复制" data-copy-doc="${docId}"><i data-lucide="copy"></i></button>
              <details class="doc-menu" data-doc-menu>
                <summary class="tiny-button" title="更多操作" aria-label="更多操作"><i data-lucide="more-horizontal"></i></summary>
                <div class="doc-menu-panel" role="menu">
                  <button type="button" role="menuitem" data-move-doc-top="${docId}"><i data-lucide="arrow-up-to-line"></i><span>置顶</span></button>
                  <button type="button" role="menuitem" data-move-doc-bottom="${docId}"><i data-lucide="arrow-down-to-line"></i><span>置底</span></button>
                </div>
              </details>
              <button class="tiny-button danger-text" type="button" title="移入垃圾箱" data-delete-doc="${docId}"><i data-lucide="trash-2"></i></button>`;
        return `<article class="doc-item ${active ? "active" : ""}" id="doc-option-${docId}" data-doc-id="${docId}" draggable="true" role="option" aria-selected="${String(active)}" tabindex="${active || (!ui.selectedDocId && docs.indexOf(doc) === 0) ? "0" : "-1"}">
          <div class="doc-title-row">
            <div class="doc-title">${escapeHtml(doc.title || "未命名文档")}</div>
            <span class="doc-actions">
              ${actions}
            </span>
          </div>
          <div class="doc-meta">
            <span>${escapeHtml(type)}</span>
            <span>${escapeHtml(folder?.name || "未归档")}</span>
            <span>${formatTime(doc.updatedAt)}</span>
          </div>
          <div class="doc-snippet">${escapeHtml(doc.content.replace(/\s+/g, " ").slice(0, 120) || "空白文档")}</div>
        </article>`;
      })
      .join("");

    els.docList.querySelectorAll(".doc-item").forEach((item) => {
      item.addEventListener("click", (event) => {
        if (isDocActionTarget(event.target)) return;
        onSelectDocument(item.dataset.docId);
      });
      item.addEventListener("keydown", (event) => handleDocItemKeydown(event, item));
      item.addEventListener("dragstart", (event) => {
        const doc = state.docs.find((entry) => entry.id === item.dataset.docId);
        if (!doc || doc.deletedAt || !event.dataTransfer) return;
        draggedDocId = doc.id;
        event.dataTransfer.effectAllowed = "copyMove";
        event.dataTransfer.setData("application/x-mowen-doc-id", doc.id);
        event.dataTransfer.setData("text/plain", doc.title || "未命名文档");
      });
      item.addEventListener("dragover", (event) => {
        if (!draggedDocId || draggedDocId === item.dataset.docId) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        markDragTarget(item, getDropPlacement(event, item));
      });
      item.addEventListener("dragleave", () => {
        item.classList.remove("drag-before", "drag-after");
      });
      item.addEventListener("drop", (event) => {
        const sourceId = event.dataTransfer?.getData("application/x-mowen-doc-id") || draggedDocId;
        if (!sourceId || sourceId === item.dataset.docId) return;
        event.preventDefault();
        event.stopPropagation();
        const placement = getDropPlacement(event, item);
        clearDocDragState();
        onMoveDocument(sourceId, item.dataset.docId, placement);
      });
      item.addEventListener("dragend", clearDocDragState);
    });
    els.docList.querySelectorAll("[data-copy-doc]").forEach((button) => {
      button.addEventListener("click", () => onCopyDocument(button.dataset.copyDoc));
    });
    els.docList.querySelectorAll("[data-doc-menu]").forEach((menu) => {
      menu.addEventListener("toggle", () => {
        menu.closest(".doc-item")?.classList.toggle("menu-open", menu.open);
        if (!menu.open) return;
        els.docList.querySelectorAll("[data-doc-menu][open]").forEach((otherMenu) => {
          if (otherMenu !== menu) otherMenu.removeAttribute("open");
        });
      });
    });
    els.docList.querySelectorAll("[data-move-doc-top]").forEach((button) => {
      button.addEventListener("click", () => onMoveDocumentToTop(button.dataset.moveDocTop));
    });
    els.docList.querySelectorAll("[data-move-doc-bottom]").forEach((button) => {
      button.addEventListener("click", () => onMoveDocumentToBottom(button.dataset.moveDocBottom));
    });
    els.docList.querySelectorAll("[data-delete-doc]").forEach((button) => {
      button.addEventListener("click", () => onDeleteDocument(button.dataset.deleteDoc));
    });
    renderTrashModal();
    if (window.lucide) window.lucide.createIcons();
  }

  function renderTrashModal() {
    const trashDocs = state.docs.filter((doc) => doc.deletedAt);
    if (els.trashModalCount) {
      els.trashModalCount.textContent = `${trashDocs.length} 份文档`;
    }
    if (els.restoreAllTrashBtn) els.restoreAllTrashBtn.disabled = trashDocs.length === 0;
    if (els.clearTrashBtn) els.clearTrashBtn.disabled = trashDocs.length === 0;
    if (!els.trashModalList) return;
    if (trashDocs.length === 0) {
      els.trashModalList.innerHTML = `<div class="empty-state">垃圾箱为空</div>`;
      return;
    }
    els.trashModalList.innerHTML = trashDocs
      .map((doc) => {
        const folder = state.folders.find((item) => item.id === doc.folderId);
        const type = getType(doc.type).name;
        const docId = escapeHtml(doc.id);
        return `<article class="trash-item" data-trash-doc-id="${docId}">
          <div class="trash-item-main">
            <strong>${escapeHtml(doc.title || "未命名文档")}</strong>
            <span>${escapeHtml(type)} · ${escapeHtml(folder?.name || "未归档")} · 删除于 ${formatTime(doc.deletedAt)}</span>
            <p>${escapeHtml(String(doc.content || "").replace(/\s+/g, " ").slice(0, 120) || "空白文档")}</p>
          </div>
          <div class="trash-item-actions">
            <button type="button" data-restore-doc="${docId}"><i data-lucide="rotate-ccw"></i><span>恢复</span></button>
            <button type="button" class="danger-text" data-permanent-delete-doc="${docId}"><i data-lucide="trash-2"></i><span>清除</span></button>
          </div>
        </article>`;
      })
      .join("");
    els.trashModalList.querySelectorAll("[data-restore-doc]").forEach((button) => {
      button.addEventListener("click", () => onRestoreDocument(button.dataset.restoreDoc));
    });
    els.trashModalList.querySelectorAll("[data-permanent-delete-doc]").forEach((button) => {
      button.addEventListener("click", () => onPermanentlyDeleteDocument(button.dataset.permanentDeleteDoc));
    });
    if (window.lucide) window.lucide.createIcons();
  }

  function isDocActionTarget(target) {
    return Boolean(
      target.closest(
        "[data-copy-doc], [data-delete-doc], [data-restore-doc], [data-permanent-delete-doc], [data-doc-menu], [data-move-doc-top], [data-move-doc-bottom]",
      ),
    );
  }

  function getDropPlacement(event, item) {
    const rect = item.getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2 ? "after" : "before";
  }

  function markDragTarget(item, placement) {
    els.docList.querySelectorAll(".doc-item.drag-before, .doc-item.drag-after").forEach((entry) => {
      if (entry !== item) entry.classList.remove("drag-before", "drag-after");
    });
    item.classList.toggle("drag-before", placement === "before");
    item.classList.toggle("drag-after", placement === "after");
  }

  function clearDocDragState() {
    draggedDocId = null;
    els.docList.querySelectorAll(".doc-item.drag-before, .doc-item.drag-after").forEach((entry) => {
      entry.classList.remove("drag-before", "drag-after");
    });
  }

  function handleDocItemKeydown(event, item) {
    if (isDocActionTarget(event.target)) return;
    const items = Array.from(els.docList.querySelectorAll(".doc-item"));
    const currentIndex = items.indexOf(item);
    if (currentIndex < 0) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectDocument(item.dataset.docId);
      return;
    }
    const keyMap = {
      ArrowDown: Math.min(currentIndex + 1, items.length - 1),
      ArrowRight: Math.min(currentIndex + 1, items.length - 1),
      ArrowUp: Math.max(currentIndex - 1, 0),
      ArrowLeft: Math.max(currentIndex - 1, 0),
      Home: 0,
      End: items.length - 1,
    };
    if (!(event.key in keyMap)) return;
    event.preventDefault();
    focusDocItem(items[keyMap[event.key]]);
  }

  function focusDocItem(item) {
    if (!item) return;
    els.docList.querySelectorAll(".doc-item").forEach((entry) => {
      entry.tabIndex = entry === item ? 0 : -1;
    });
    item.focus();
  }

  function renderEditor() {
    const doc = getCurrentDoc();
    if (!doc) {
      els.titleInput.value = "";
      els.contentEditor.value = "";
      [els.titleInput, els.typeSelect, els.folderSelect, els.styleSelect, els.contentEditor].forEach((input) => {
        input.disabled = true;
      });
      els.saveDocBtn.disabled = true;
      els.undoEditBtn.disabled = true;
      els.saveState.textContent = "请新建或导入文档";
      els.saveState.title = "当前没有可编辑的文档";
      els.saveState.classList.add("visible");
      return;
    }
    const trashed = Boolean(doc.deletedAt);
    els.titleInput.value = doc.title || "";
    els.typeSelect.value = doc.type || "custom";
    els.folderSelect.value = doc.folderId || state.folders[0]?.id || "";
    els.styleSelect.value = doc.styleId || "";
    els.contentEditor.value = doc.content || "";
    [els.titleInput, els.typeSelect, els.folderSelect, els.styleSelect, els.contentEditor].forEach((input) => {
      input.disabled = trashed;
    });
    els.saveDocBtn.disabled = trashed;
    els.undoEditBtn.disabled = trashed;
    els.saveState.textContent = trashed ? "在垃圾箱中" : "已保存";
    els.saveState.title = trashed ? "请先恢复文档再编辑或保存" : `保存位置：${getDocumentLocation(doc)}`;
    els.saveState.classList.toggle("visible", trashed);
  }

  return {
    getVisibleDocuments,
    renderDocList,
    renderTrashModal,
    renderEditor,
  };
}
