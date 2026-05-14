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
    onDeleteDocument,
  } = deps;

  function getVisibleDocuments() {
    const query = els.searchInput.value.trim().toLowerCase();
    return state.docs
      .filter((doc) => ui.selectedFolderId === "all" || doc.folderId === ui.selectedFolderId)
      .filter((doc) => {
        if (!query) return true;
        return `${doc.title}\n${doc.content}`.toLowerCase().includes(query);
      })
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  function renderDocList() {
    const docs = getVisibleDocuments();
    els.docCount.textContent = String(docs.length);

    if (docs.length === 0) {
      els.docList.innerHTML = '<div class="empty-state">没有匹配的文档</div>';
      return;
    }

    els.docList.innerHTML = docs
      .map((doc) => {
        const type = getType(doc.type).name;
        const folder = state.folders.find((item) => item.id === doc.folderId);
        return `<article class="doc-item ${doc.id === ui.selectedDocId ? "active" : ""}" data-doc-id="${doc.id}">
          <div class="doc-title-row">
            <div class="doc-title">${escapeHtml(doc.title || "未命名文档")}</div>
            <span class="doc-actions">
              <button class="tiny-button" type="button" title="复制" data-copy-doc="${doc.id}"><i data-lucide="copy"></i></button>
              <button class="tiny-button danger-text" type="button" title="删除" data-delete-doc="${doc.id}"><i data-lucide="trash-2"></i></button>
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
        if (event.target.closest("[data-copy-doc], [data-delete-doc]")) return;
        onSelectDocument(item.dataset.docId);
      });
    });
    els.docList.querySelectorAll("[data-copy-doc]").forEach((button) => {
      button.addEventListener("click", () => onCopyDocument(button.dataset.copyDoc));
    });
    els.docList.querySelectorAll("[data-delete-doc]").forEach((button) => {
      button.addEventListener("click", () => onDeleteDocument(button.dataset.deleteDoc));
    });
    if (window.lucide) window.lucide.createIcons();
  }

  function renderEditor() {
    const doc = getCurrentDoc();
    if (!doc) {
      els.titleInput.value = "";
      els.contentEditor.value = "";
      return;
    }
    els.titleInput.value = doc.title || "";
    els.typeSelect.value = doc.type || "custom";
    els.folderSelect.value = doc.folderId || state.folders[0]?.id || "";
    els.styleSelect.value = doc.styleId || "";
    els.contentEditor.value = doc.content || "";
    els.saveState.textContent = "已保存";
    els.saveState.title = `保存位置：${getDocumentLocation(doc)}`;
  }

  return {
    getVisibleDocuments,
    renderDocList,
    renderEditor,
  };
}
