import {
  HANDLE_DB_NAME,
  HANDLE_STORE_NAME,
  WORKSPACE_DB_NAME,
  WORKSPACE_STATE_ID,
  WORKSPACE_STORE_NAME,
} from "../config/constants.js";
import { now } from "../utils/helpers.js";

export function openWorkspaceDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("当前浏览器不支持 IndexedDB"));
      return;
    }
    const request = indexedDB.open(WORKSPACE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(WORKSPACE_STORE_NAME)) {
        db.createObjectStore(WORKSPACE_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readWorkspaceState() {
  const db = await openWorkspaceDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WORKSPACE_STORE_NAME, "readonly");
    const request = tx.objectStore(WORKSPACE_STORE_NAME).get(WORKSPACE_STATE_ID);
    request.onsuccess = () => resolve(request.result?.data || null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export async function writeWorkspaceState(snapshot) {
  const db = await openWorkspaceDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WORKSPACE_STORE_NAME, "readwrite");
    tx.objectStore(WORKSPACE_STORE_NAME).put({
      id: WORKSPACE_STATE_ID,
      data: snapshot,
      updatedAt: now(),
    });
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export function openHandleDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(HANDLE_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDirectoryHandle(folderId, handle) {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE_NAME, "readwrite");
    tx.objectStore(HANDLE_STORE_NAME).put(handle, folderId);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function getDirectoryHandle(folderId) {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE_NAME, "readonly");
    const request = tx.objectStore(HANDLE_STORE_NAME).get(folderId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export async function removeDirectoryHandle(folderId) {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE_NAME, "readwrite");
    tx.objectStore(HANDLE_STORE_NAME).delete(folderId);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function getAuthorizedDirectoryHandle(folder, mode = "read") {
  const handle = await getDirectoryHandle(folder.id);
  if (!handle) {
    throw new Error("未找到该真实文件夹的浏览器授权，请重新关联。");
  }
  const options = { mode };
  if ((await handle.queryPermission(options)) === "granted") {
    return handle;
  }
  if ((await handle.requestPermission(options)) === "granted") {
    return handle;
  }
  throw new Error("没有该真实文件夹的访问权限。");
}
