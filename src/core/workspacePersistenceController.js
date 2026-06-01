import { clone as defaultClone, normalizeHandle as defaultNormalizeHandle } from "../utils/helpers.js";
import { readWorkspaceState as defaultReadWorkspaceState, writeWorkspaceState as defaultWriteWorkspaceState } from "./storage.js";
import {
  clearLegacyLocalStorageState as defaultClearLegacyLocalStorageState,
  readLegacyLocalStorageState as defaultReadLegacyLocalStorageState,
  readStorageBootstrap as defaultReadStorageBootstrap,
  shouldPreferLocalStorageFallback as defaultShouldPreferLocalStorageFallback,
  writeLegacyLocalStorageState as defaultWriteLegacyLocalStorageState,
  writeStorageBootstrap as defaultWriteStorageBootstrap,
} from "./storageBootstrap.js";

export function createWorkspacePersistenceController({
  state = {},
  ui = {},
  els = {},
  toast = () => {},
  clone = defaultClone,
  normalizeHandle = defaultNormalizeHandle,
  readWorkspaceState = defaultReadWorkspaceState,
  writeWorkspaceState = defaultWriteWorkspaceState,
  readStorageBootstrap = defaultReadStorageBootstrap,
  writeStorageBootstrap = defaultWriteStorageBootstrap,
  clearLegacyLocalStorageState = defaultClearLegacyLocalStorageState,
  readLegacyLocalStorageState = defaultReadLegacyLocalStorageState,
  writeLegacyLocalStorageState = defaultWriteLegacyLocalStorageState,
  shouldPreferLocalStorageFallback = defaultShouldPreferLocalStorageFallback,
  logger = console,
} = {}) {
  function persist() {
    state.selectedFolderId = ui.selectedFolderId;
    state.selectedDocId = ui.selectedDocId;
    const snapshot = clone(state);
    ui.persistPromise = (ui.persistPromise || Promise.resolve())
      .catch(() => null)
      .then(async () => {
        await writeWorkspaceState(snapshot);
        writeStorageBootstrap(snapshot);
        clearLegacyLocalStorageState();
      })
      .catch((error) => {
        logger.error?.("保存工作台数据失败", error);
        tryLocalStorageFallback(snapshot);
      });
    return ui.persistPromise;
  }

  async function hydrateState() {
    const loaded = await loadState();
    Object.assign(state, loaded);
    ui.selectedFolderId = state.selectedFolderId || "all";
    ui.selectedDocId = state.selectedDocId || null;
    if (els.storageLabel) {
      els.storageLabel.textContent = "本机文档库（IndexedDB）";
    }
    return state;
  }

  async function loadState() {
    const bootstrap = readStorageBootstrap();
    if (shouldPreferLocalStorageFallback(bootstrap)) {
      const fallback = readLegacyLocalStorageState();
      if (fallback) return fallback;
    }

    try {
      const indexedDbState = await readWorkspaceState();
      if (indexedDbState) return indexedDbState;
    } catch (error) {
      logger.warn?.("读取 IndexedDB 工作台数据失败，将尝试旧 localStorage 数据", error);
    }

    const legacy = readLegacyLocalStorageState();
    if (legacy) {
      try {
        await writeWorkspaceState(legacy);
        writeStorageBootstrap(legacy);
        clearLegacyLocalStorageState();
      } catch (error) {
        logger.warn?.("迁移旧 localStorage 数据到 IndexedDB 失败，暂时继续使用旧数据", error);
      }
      return legacy;
    }

    return {};
  }

  function tryLocalStorageFallback(snapshot) {
    try {
      writeLegacyLocalStorageState(snapshot);
      writeStorageBootstrap(snapshot, "localStorage");
      return true;
    } catch (error) {
      toast("本机存储空间不足，部分最新更改可能无法保存。请导出备份或减少大型样本文件。", "error");
      return false;
    }
  }

  function getStorageRootLocation() {
    return "本机浏览器存储 / 摹文拟笔工作台";
  }

  function getFolderLocation(folder) {
    if (folder?.kind === "real") {
      return `本机真实文件夹 / ${folder.name || folder.realName || "未命名文件夹"}（浏览器授权目录）`;
    }
    return `${getStorageRootLocation()} / 文档库 / ${folder?.name || "未归档"}`;
  }

  function getDocumentLocation(doc) {
    const folder = state.folders?.find((item) => item.id === doc?.folderId);
    return `${getFolderLocation(folder)} / ${doc?.title || "未命名文档"}`;
  }

  function getSkillLocation(skill) {
    const handle = normalizeHandle(skill?.handle || skill?.name || "未命名执笔人");
    return `${getStorageRootLocation()} / 执笔人库 / @${handle}`;
  }

  function getSkillTrainingLocation(skill) {
    return `${getSkillLocation(skill)} / 训练文本`;
  }

  function getApiSettingsLocation() {
    return `${getStorageRootLocation()} / AI接口配置`;
  }

  function getDownloadLocation(fileName) {
    return `浏览器下载目录 / ${fileName}`;
  }

  return {
    persist,
    hydrateState,
    loadState,
    tryLocalStorageFallback,
    getStorageRootLocation,
    getFolderLocation,
    getDocumentLocation,
    getSkillLocation,
    getSkillTrainingLocation,
    getApiSettingsLocation,
    getDownloadLocation,
  };
}
