import {
  getAuthorizedDirectoryHandle,
  removeDirectoryHandle,
  saveDirectoryHandle,
} from "../../core/storage.js";

export function createBrowserFileSystemAdapter(options = {}) {
  const win = options.win || globalThis.window || globalThis;
  const storage = {
    getAuthorizedDirectoryHandle,
    removeDirectoryHandle,
    saveDirectoryHandle,
    ...(options.storage || {}),
  };

  return {
    isSupported() {
      return typeof win?.showDirectoryPicker === "function";
    },

    pickDirectory(pickerOptions = { mode: "readwrite" }) {
      if (typeof win?.showDirectoryPicker !== "function") {
        throw new Error("当前浏览器不支持关联真实文件夹，请使用支持 File System Access API 的 Chromium 浏览器。");
      }
      return win.showDirectoryPicker(pickerOptions);
    },

    saveDirectoryHandle(folderId, handle) {
      return storage.saveDirectoryHandle(folderId, handle);
    },

    getAuthorizedDirectoryHandle(folder, mode = "read") {
      return storage.getAuthorizedDirectoryHandle(folder, mode);
    },

    removeDirectoryHandle(folderId) {
      return storage.removeDirectoryHandle(folderId);
    },

    async *listFiles(handle) {
      for await (const entry of handle.values()) {
        if (entry?.kind !== "file") continue;
        yield {
          entry,
          name: entry.name,
          getFile: () => entry.getFile(),
        };
      }
    },

    async writeTextFile(handle, fileName, content) {
      const fileHandle = await handle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
    },
  };
}
