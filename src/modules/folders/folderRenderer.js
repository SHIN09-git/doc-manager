import { escapeHtml, sanitizeCssColor } from "../../utils/helpers.js";

export function createFolderRenderer(deps) {
  const {
    state,
    ui,
    els,
    onSelectFolder,
    onRenameFolder,
    onSyncFolder,
    onDeleteFolder,
  } = deps;

  function renderFolders() {
    const allActive = ui.selectedFolderId === "all";
    const counts = new Map();
    let activeCount = 0;
    for (const doc of state.docs) {
      if (doc.deletedAt) continue;
      activeCount++;
      counts.set(doc.folderId, (counts.get(doc.folderId) || 0) + 1);
    }
    const folderRows = [
      `<button class="folder-item ${allActive ? "active" : ""}" type="button" data-folder-id="all">
        <span class="folder-main"><span class="folder-color folder-color-all"></span><span class="folder-name">全部文档</span></span>
        <span class="folder-count">${activeCount}</span>
      </button>`,
      ...state.folders.map((folder) => {
        const count = counts.get(folder.id) || 0;
        const isReal = folder.kind === "real";
        const folderId = escapeHtml(folder.id);
        const color = sanitizeCssColor(folder.color);
        return `<div class="folder-item ${ui.selectedFolderId === folder.id ? "active" : ""}">
          <button class="folder-main tiny-reset" type="button" data-folder-id="${folderId}">
            <span class="folder-color" style="background:${color}"></span>
            <span class="folder-name">${escapeHtml(folder.name)}</span>
            ${isReal ? '<small class="folder-kind">真实文件夹</small>' : ""}
          </button>
          <span class="folder-count">${count}</span>
          <span class="folder-actions">
            ${isReal ? `<button class="tiny-button" type="button" title="从真实文件夹重新导入" data-sync-folder="${folderId}"><i data-lucide="refresh-cw"></i></button>` : ""}
            <button class="tiny-button" type="button" title="重命名显示名称" data-rename-folder="${folderId}"><i data-lucide="pencil"></i></button>
            <button class="tiny-button danger-text" type="button" title="${isReal ? "取消关联" : "删除标签"}" data-delete-folder="${folderId}"><i data-lucide="x"></i></button>
          </span>
        </div>`;
      }),
    ].join("");

    els.folderList.innerHTML = folderRows;
    els.folderList.querySelectorAll("[data-folder-id]").forEach((button) => {
      button.addEventListener("click", () => onSelectFolder(button.dataset.folderId));
    });
    els.folderList.querySelectorAll("[data-rename-folder]").forEach((button) => {
      button.addEventListener("click", () => onRenameFolder(button.dataset.renameFolder));
    });
    els.folderList.querySelectorAll("[data-sync-folder]").forEach((button) => {
      button.addEventListener("click", () => onSyncFolder(button.dataset.syncFolder));
    });
    els.folderList.querySelectorAll("[data-delete-folder]").forEach((button) => {
      button.addEventListener("click", () => onDeleteFolder(button.dataset.deleteFolder));
    });
  }

  function renderFolderSelect() {
    els.folderSelect.innerHTML = state.folders
      .map((folder) => `<option value="${escapeHtml(folder.id)}">${folder.kind === "real" ? "📁" : "#"} ${escapeHtml(folder.name)}</option>`)
      .join("");
  }

  return {
    renderFolders,
    renderFolderSelect,
  };
}
