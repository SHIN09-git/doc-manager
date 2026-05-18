import { folderColors } from "../../config/constants.js";
import { EVENTS } from "../../core/eventBus.js";
import { canImportFile, readImportFileText } from "../../utils/fileReaders.js";
import { createId, now, sanitizeFileName } from "../../utils/helpers.js";
import { filterImportableFilesBySize } from "../../utils/importGuards.js";
import { guessTypeFromName } from "../../utils/validation.js";
import { createBrowserFileSystemAdapter } from "./fileSystemAdapter.js";

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
    fileSystem = createBrowserFileSystemAdapter(),
    confirmLargeImport = (message) => globalThis.window?.confirm?.(message) ?? true,
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
    if (!fileSystem.isSupported()) {
      toast("当前浏览器不支持关联真实文件夹，请使用支持 File System Access API 的 Chromium 浏览器。", "warn");
      return null;
    }
    try {
      const handle = await fileSystem.pickDirectory({ mode: "readwrite" });
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
      await fileSystem.saveDirectoryHandle(id, handle);
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
      const handle = await fileSystem.getAuthorizedDirectoryHandle(folder, "read");
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
    for await (const item of fileSystem.listFiles(handle)) {
      const entryName = item.name || item.entry?.name || "未命名文件";
      if (!canImportFile(entryName)) continue;
      const file = await item.getFile();
      const { accepted } = await filterImportableFilesBySize([file], {
        confirm: confirmLargeImport,
        notify: toast,
      });
      if (accepted.length === 0) continue;
      const sourceKey = `${folder.id}:${entryName}:${file.lastModified}:${file.size}`;
      if (state.docs.some((doc) => doc.sourceKey === sourceKey)) continue;
      let content = "";
      try {
        content = await readImportFileText(file);
      } catch (error) {
        console.warn("读取真实文件夹文件失败", entryName, error);
        continue;
      }
      state.docs.unshift({
        id: createId(),
        title: entryName.replace(/\.[^.]+$/, ""),
        type: guessTypeFromName(entryName),
        folderId: folder.id,
        styleId: state.styles[0]?.id || "",
        content,
        sourceKey,
        sourceFileName: entryName,
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
    const handle = await fileSystem.getAuthorizedDirectoryHandle(folder, "readwrite");
    const fileName = `${sanitizeFileName(doc.title || "未命名文档")}.txt`;
    await fileSystem.writeTextFile(handle, fileName, `${doc.title || "未命名文档"}\n\n${doc.content || ""}`);
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
      fileSystem.removeDirectoryHandle(folder.id).catch((error) => {
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
