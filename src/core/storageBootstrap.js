import { STORAGE_BOOTSTRAP_KEY, STORAGE_KEY } from "../config/constants.js";
import { now } from "../utils/helpers.js";

function resolveStorage(storage) {
  return storage || globalThis.localStorage || null;
}

export function buildStorageBootstrap(snapshot = {}, storageMode = "indexedDB") {
  return {
    storage: storageMode,
    updatedAt: now(),
    selectedFolderId: snapshot.selectedFolderId || "all",
    selectedDocId: snapshot.selectedDocId || null,
    docCount: Array.isArray(snapshot.docs) ? snapshot.docs.length : 0,
    skillCount: Array.isArray(snapshot.styles) ? snapshot.styles.length : 0,
  };
}

export function readStorageBootstrap(storage) {
  try {
    const target = resolveStorage(storage);
    const raw = target?.getItem(STORAGE_BOOTSTRAP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeStorageBootstrap(snapshot, storageMode = "indexedDB", storage) {
  try {
    const target = resolveStorage(storage);
    if (!target) return false;
    target.setItem(STORAGE_BOOTSTRAP_KEY, JSON.stringify(buildStorageBootstrap(snapshot, storageMode)));
    return true;
  } catch {
    return false;
  }
}

export function readLegacyLocalStorageState(storage) {
  try {
    const target = resolveStorage(storage);
    const raw = target?.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeLegacyLocalStorageState(snapshot, storage) {
  const target = resolveStorage(storage);
  if (!target) return false;
  target.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  return true;
}

export function clearLegacyLocalStorageState(storage) {
  try {
    const target = resolveStorage(storage);
    if (!target) return false;
    target.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function shouldPreferLocalStorageFallback(bootstrap) {
  return bootstrap?.storage === "localStorage";
}
