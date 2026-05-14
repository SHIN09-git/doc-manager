import { escapeHtml } from "../../utils/helpers.js";

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
    const folderRows = [
      `<button class="folder-item ${allActive ? "active" : ""}" type="button" data-folder-id="all">
        <span class="folder-main"><span class="folder-color" style="background:#2d3234"></span><span>全部文档</span></span>
        <span>${state.docs.length}</span>
      </button>`,
      ...state.folders.map((folder) => {
        const count = state.docs.filter((doc) => doc.folderId === folder.id).length;
        const isReal = folder.kind === "real";
        const badge = isReal ? "真实" : "标签";
        return `<div class="folder-item ${ui.selectedFolderId === folder.id ? "active" : ""}">
          <button class="folder-main tiny-reset" type="button" data-folder-id="${folder.id}">
            <span class="folder-color" style="background:${folder.color}"></span>
            <span>${escapeHtml(folder.name)}</span>
            <small class="folder-kind">${badge}</small>
          </button>
          <span class="folder-actions">
            <span>${count}</span>
            ${isReal ? `<button class="tiny-button" type="button" title="从真实文件夹重新导入" data-sync-folder="${folder.id}"><i data-lucide="refresh-cw"></i></button>` : ""}
            <button class="tiny-button" type="button" title="重命名显示名称" data-rename-folder="${folder.id}"><i data-lucide="pencil"></i></button>
            <button class="tiny-button danger-text" type="button" title="${isReal ? "取消关联" : "删除标签"}" data-delete-folder="${folder.id}"><i data-lucide="x"></i></button>
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
      .map((folder) => `<option value="${folder.id}">${folder.kind === "real" ? "📁" : "#"} ${escapeHtml(folder.name)}</option>`)
      .join("");
  }

  return {
    renderFolders,
    renderFolderSelect,
  };
}
