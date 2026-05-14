import { folderColors } from "../../config/constants.js";
import { EVENTS } from "../../core/eventBus.js";
import {
  getAuthorizedDirectoryHandle,
  removeDirectoryHandle,
  saveDirectoryHandle,
} from "../../core/storage.js";
import { createId, now, sanitizeFileName } from "../../utils/helpers.js";
import { guessTypeFromName, isSupportedTextFile } from "../../utils/validation.js";

export function createFolderManager(deps) {
  const {
    state,
    ui,
    els,
    persist,
    eventBus,
    getFolderLocation,
    getDocumentLocation,
    toast,
  } = deps;

  function normalizeFolder(folder) {
    return {
      ...folder,
      kind: folder.kind === "real" ? "real" : "tag",
      color: folder.color || folderColors[state.folders?.length % folderColors.length] || folderColors[0],
      createdAt: folder.createdAt || now(),
    };
  }

  function getFolderById(folderId) {
    return state.folders.find((folder) => folder.id === folderId) || null;
  }

  function createDefaultFolder() {
    const folder = {
      id: createId(),
      name: "未归档",
      kind: "tag",
      color: folderColors[state.folders.length % folderColors.length],
      createdAt: now(),
    };
    state.folders.push(folder);
    return folder.id;
  }

  async function linkRealFolder() {
    if (!window.showDirectoryPicker) {
      toast("当前浏览器不支持关联真实文件夹，请使用支持 File System Access API 的 Chromium 浏览器。", "warn");
      return null;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      const id = createId();
      const folder = {
        id,
        name: handle.name,
        realName: handle.name,
        kind: "real",
        color: folderColors[state.folders.length % folderColors.length],
        createdAt: now(),
        updatedAt: now(),
      };
      await saveDirectoryHandle(id, handle);
      state.folders.push(folder);
      ui.selectedFolderId = id;
      const importedCount = await importFilesFromDirectoryHandle(folder, handle);
      persist();
      eventBus.emit(EVENTS.RENDER_ALL);
      toast(`已关联真实文件夹：${getFolderLocation(folder)}${importedCount ? `，并导入 ${importedCount} 份文档` : ""}`);
      return folder;
    } catch (error) {
      if (error?.name !== "AbortError") {
        toast(`关联真实文件夹失败：${error.message || error}`, "error");
      }
      return null;
    }
  }

  async function syncRealFolder(folderId) {
    const folder = getFolderById(folderId);
    if (!folder || folder.kind !== "real") return 0;
    try {
      const handle = await getAuthorizedDirectoryHandle(folder, "read");
      const importedCount = await importFilesFromDirectoryHandle(folder, handle);
      persist();
      eventBus.emit(EVENTS.RENDER_ALL);
      toast(`已从真实文件夹重新导入：${getFolderLocation(folder)}${importedCount ? `，新增 ${importedCount} 份文档` : "，没有新增文档"}`);
      return importedCount;
    } catch (error) {
      toast(`读取真实文件夹失败：${error.message || error}`, "error");
      return 0;
    }
  }

  async function importFilesFromDirectoryHandle(folder, handle) {
    let importedCount = 0;
    for await (const entry of handle.values()) {
      if (entry.kind !== "file" || !isSupportedTextFile(entry.name)) continue;
      const file = await entry.getFile();
      const sourceKey = `${folder.id}:${entry.name}:${file.lastModified}:${file.size}`;
      if (state.docs.some((doc) => doc.sourceKey === sourceKey)) continue;
      const content = await file.text();
      state.docs.unshift({
        id: createId(),
        title: entry.name.replace(/\.[^.]+$/, ""),
        type: guessTypeFromName(entry.name),
        folderId: folder.id,
        styleId: state.styles[0]?.id || "",
        content,
        sourceKey,
        sourceFileName: entry.name,
        createdAt: now(),
        updatedAt: now(),
      });
      importedCount += 1;
    }
    return importedCount;
  }

  async function syncDocumentToRealFolder(doc) {
    const folder = getFolderById(doc.folderId);
    if (!folder || folder.kind !== "real") return getDocumentLocation(doc);
    const handle = await getAuthorizedDirectoryHandle(folder, "readwrite");
    const fileName = `${sanitizeFileName(doc.title || "未命名文档")}.txt`;
    const fileHandle = await handle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(`${doc.title || "未命名文档"}\n\n${doc.content || ""}`);
    await writable.close();
    doc.syncedFileName = fileName;
    doc.updatedAt = now();
    persist();
    return `${getFolderLocation(folder)} / ${fileName}`;
  }

  function addFolder() {
    const name = els.folderNameInput.value.trim();
    if (!name) {
      toast("请输入标签名称", "warn");
      return null;
    }
    const folder = {
      id: createId(),
      name,
      kind: "tag",
      color: folderColors[state.folders.length % folderColors.length],
      createdAt: now(),
    };
    state.folders.push(folder);
    ui.selectedFolderId = folder.id;
    els.folderNameInput.value = "";
    els.folderCreateBox.hidden = true;
    persist();
    eventBus.emit(EVENTS.RENDER_ALL);
    toast(`已创建标签：${getFolderLocation(folder)}`);
    return folder;
  }

  function renameFolder(folderId, promptName = (message, current) => window.prompt(message, current)) {
    const folder = getFolderById(folderId);
    if (!folder) return null;
    const name = promptName(folder.kind === "real" ? "真实文件夹显示名称" : "标签名称", folder.name);
    if (!name || !name.trim()) return null;
    folder.name = name.trim();
    folder.updatedAt = now();
    persist();
    eventBus.emit(EVENTS.RENDER_ALL);
    return folder;
  }

  function deleteFolder(folderId, confirmDelete = (message) => window.confirm(message)) {
    const folder = getFolderById(folderId);
    if (!folder) return false;
    const docsInFolder = state.docs.filter((doc) => doc.folderId === folderId).length;
    const ok = confirmDelete(
      folder.kind === "real"
        ? `取消关联真实文件夹“${folder.name}”？不会删除磁盘中的真实文件，其中 ${docsInFolder} 份文档会移动到其他标签/文件夹。`
        : `删除标签“${folder.name}”？其中 ${docsInFolder} 份文档会移动到其他标签/文件夹。`,
    );
    if (!ok) return false;
    state.folders = state.folders.filter((item) => item.id !== folderId);
    const fallbackFolder = state.folders[0]?.id || createDefaultFolder();
    state.docs.forEach((doc) => {
      if (doc.folderId === folderId) doc.folderId = fallbackFolder;
    });
    ui.selectedFolderId = "all";
    persist();
    if (folder.kind === "real") {
      removeDirectoryHandle(folder.id).catch((error) => {
        console.warn("移除真实文件夹授权失败", error);
      });
    }
    eventBus.emit(EVENTS.RENDER_ALL);
    toast(`已${folder.kind === "real" ? "取消关联真实文件夹" : "删除标签"}，相关文档已移动到：${getFolderLocation(state.folders.find((item) => item.id === fallbackFolder))}`, "warn");
    return true;
  }

  return {
    normalizeFolder,
    getFolderById,
    createDefaultFolder,
    linkRealFolder,
    syncRealFolder,
    importFilesFromDirectoryHandle,
    syncDocumentToRealFolder,
    addFolder,
    renameFolder,
    deleteFolder,
  };
}
