(() => {
  // src/ui/icons.js
  var ICONS = {
    archive: '<path d="M21 8v12H3V8"/><path d="M3 8l2-4h14l2 4"/><path d="M10 12h4"/>',
    "at-sign": '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
    "book-open-text": '<path d="M12 7v14"/><path d="M3 5a6 6 0 0 1 9 2 6 6 0 0 1 9-2v14a6 6 0 0 0-9 2 6 6 0 0 0-9-2Z"/><path d="M7 9h2"/><path d="M7 13h3"/><path d="M16 9h2"/><path d="M16 13h3"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
    "file-plus-2": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15h6"/>',
    "file-up": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="m9 15 3-3 3 3"/>',
    "folder-input": '<path d="M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z"/><path d="M12 11H6"/><path d="m9 8 3 3-3 3"/>',
    moon: '<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 1 0 9.8 9.8Z"/>',
    "panel-right-open": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/><path d="m10 9 3 3-3 3"/>',
    paperclip: '<path d="m21.4 11.6-8.5 8.5a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 1 1-2.8-2.8l8.5-8.5"/>',
    pencil: '<path d="M17 3a2.8 2.8 0 0 1 4 4L8 20l-5 1 1-5Z"/><path d="m15 5 4 4"/>',
    pilcrow: '<path d="M13 4v16"/><path d="M17 4v16"/><path d="M19 4H9a5 5 0 0 0 0 10h4"/>',
    "plug-zap": '<path d="M13 2 3 14h8l-1 8 10-12h-8Z"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    "refresh-cw": '<path d="M21 12a9 9 0 0 1-15.5 6.2"/><path d="M3 18h3v-3"/><path d="M3 12A9 9 0 0 1 18.5 5.8"/><path d="M21 6h-3v3"/>',
    replace: '<path d="M14 4h6v6"/><path d="m20 4-7 7"/><path d="M10 20H4v-6"/><path d="m4 20 7-7"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
    "scan-text": '<path d="M7 4H5a1 1 0 0 0-1 1v2"/><path d="M17 4h2a1 1 0 0 1 1 1v2"/><path d="M7 20H5a1 1 0 0 1-1-1v-2"/><path d="M17 20h2a1 1 0 0 0 1-1v-2"/><path d="M7 9h10"/><path d="M7 13h8"/><path d="M7 17h6"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9"/><path d="M8.1 8.1 20 20"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    sparkles: '<path d="M12 3 9.8 8.8 4 11l5.8 2.2L12 19l2.2-5.8L20 11l-5.8-2.2Z"/><path d="M5 3v4"/><path d="M3 5h4"/><path d="M19 17v4"/><path d="M17 19h4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.3 17.7-1.4 1.4"/><path d="m19.1 4.9-1.4 1.4"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    "trash-2": '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    upload: '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/>',
    "wand-sparkles": '<path d="m21 3-9 9"/><path d="m15 3 6 6"/><path d="M9 13 3 19l2 2 6-6"/><path d="M5 3v4"/><path d="M3 5h4"/><path d="M19 17v4"/><path d="M17 19h4"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
  };
  function renderIcon(element) {
    if (element.tagName.toLowerCase() === "svg") return;
    const name = element.getAttribute("data-lucide");
    const paths = ICONS[name] || ICONS.sparkles;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("data-lucide", name);
    svg.className = element.className || "";
    svg.innerHTML = paths;
    element.replaceWith(svg);
  }
  function createIcons(root = document) {
    root.querySelectorAll("[data-lucide]").forEach(renderIcon);
  }
  window.lucide = {
    ...window.lucide || {},
    createIcons
  };

  // src/config/constants.js
  var STORAGE_KEY = "school-doc-manager:v1";
  var STORAGE_BOOTSTRAP_KEY = `${STORAGE_KEY}:bootstrap`;
  var WORKSPACE_DB_NAME = "school-doc-manager-workspace";
  var WORKSPACE_STORE_NAME = "workspace-state";
  var WORKSPACE_STATE_ID = "current";
  var HANDLE_DB_NAME = "school-doc-manager-handles";
  var HANDLE_STORE_NAME = "directory-handles";
  var SUPPORTED_TEXT_EXTENSIONS = [".txt", ".md", ".text", ".csv"];
  var SEARCH_RENDER_DEBOUNCE_MS = 160;
  var AI_REQUEST_TIMEOUT_MS = 9e4;
  var AI_RETRY_BASE_DELAY_MS = 1e3;
  var AI_MAX_RETRIES = 3;
  var DOCUMENT_TYPES = [
    {
      id: "notice",
      name: "\u901A\u77E5",
      structure: "\u6807\u9898\u3001\u53D1\u5E03\u5BF9\u8C61\u3001\u4E8B\u9879\u80CC\u666F\u3001\u5177\u4F53\u5B89\u6392\u3001\u5DE5\u4F5C\u8981\u6C42\u3001\u843D\u6B3E\u65E5\u671F"
    },
    {
      id: "plan",
      name: "\u5DE5\u4F5C\u65B9\u6848",
      structure: "\u6307\u5BFC\u601D\u60F3\u3001\u5DE5\u4F5C\u76EE\u6807\u3001\u7EC4\u7EC7\u5B89\u6392\u3001\u5B9E\u65BD\u6B65\u9AA4\u3001\u4FDD\u969C\u63AA\u65BD"
    },
    {
      id: "summary",
      name: "\u5DE5\u4F5C\u603B\u7ED3",
      structure: "\u57FA\u672C\u60C5\u51B5\u3001\u4E3B\u8981\u505A\u6CD5\u3001\u6210\u6548\u4EAE\u70B9\u3001\u95EE\u9898\u4E0D\u8DB3\u3001\u4E0B\u4E00\u6B65\u5B89\u6392"
    },
    {
      id: "request",
      name: "\u8BF7\u793A\u62A5\u544A",
      structure: "\u8BF7\u793A\u7F18\u7531\u3001\u4E8B\u9879\u4F9D\u636E\u3001\u5177\u4F53\u8BF7\u6C42\u3001\u7ECF\u8D39\u6216\u8D44\u6E90\u8BF4\u660E\u3001\u59A5\u5426\u8BF7\u6279\u793A"
    },
    {
      id: "minutes",
      name: "\u4F1A\u8BAE\u7EAA\u8981",
      structure: "\u4F1A\u8BAE\u65F6\u95F4\u3001\u5730\u70B9\u3001\u53C2\u4F1A\u4EBA\u5458\u3001\u8BAE\u9898\u3001\u8BAE\u5B9A\u4E8B\u9879\u3001\u8D23\u4EFB\u5206\u5DE5"
    },
    {
      id: "letter",
      name: "\u51FD\u4EF6",
      structure: "\u79F0\u8C13\u3001\u6765\u51FD\u80CC\u666F\u3001\u9700\u6C9F\u901A\u4E8B\u9879\u3001\u529E\u7406\u5EFA\u8BAE\u3001\u7ED3\u675F\u8BED"
    },
    {
      id: "speech",
      name: "\u8BB2\u8BDD\u7A3F",
      structure: "\u5F00\u573A\u3001\u91CD\u70B9\u5DE5\u4F5C\u3001\u8981\u6C42\u90E8\u7F72\u3001\u9F13\u52B1\u53F7\u53EC\u3001\u7ED3\u675F\u8BED"
    },
    {
      id: "custom",
      name: "\u81EA\u5B9A\u4E49",
      structure: "\u6309\u8F93\u5165\u8981\u70B9\u7EC4\u7EC7\u7ED3\u6784\uFF0C\u4FDD\u6301\u516C\u6587\u8868\u8FBE\u6E05\u6670\u89C4\u8303"
    }
  ];
  var DEFAULT_SYSTEM_PROMPT = "\u4F60\u662F\u4E2D\u6587\u4E8B\u52A1\u6587\u6863\u5199\u4F5C\u52A9\u624B\uFF0C\u64C5\u957F\u64B0\u5199\u901A\u77E5\u3001\u65B9\u6848\u3001\u603B\u7ED3\u3001\u4F1A\u8BAE\u7EAA\u8981\u3001\u8BF7\u793A\u62A5\u544A\u3001\u51FD\u4EF6\u548C\u8BB2\u8BDD\u7A3F\u3002\u8F93\u51FA\u8981\u51C6\u786E\u3001\u7A33\u59A5\u3001\u6761\u7406\u6E05\u6670\uFF0C\u907F\u514D\u7F16\u9020\u4E8B\u5B9E\uFF1B\u7F3A\u5C11\u4FE1\u606F\u65F6\u7528\u53EF\u66FF\u6362\u5360\u4F4D\u8868\u8FBE\u3002";
  var DEFAULT_STYLE_SKILL = "\u9002\u7528\u573A\u666F\uFF1A\u7EC4\u7EC7\u5185\u90E8\u901A\u77E5\u3001\u5DE5\u4F5C\u5B89\u6392\u3001\u4E8B\u9879\u544A\u77E5\u7B49\u6B63\u5F0F\u6587\u672C\u3002\n\u7ED3\u6784\u8981\u6C42\uFF1A\u6807\u9898\u660E\u786E\uFF1B\u6B63\u6587\u5148\u8BF4\u660E\u4E8B\u9879\u80CC\u666F\uFF0C\u518D\u5217\u51FA\u65F6\u95F4\u3001\u5730\u70B9\u3001\u5BF9\u8C61\u3001\u5B89\u6392\u548C\u8981\u6C42\uFF1B\u672B\u5C3E\u4FDD\u7559\u843D\u6B3E\u4E0E\u65E5\u671F\u3002\n\u8BED\u8A00\u98CE\u683C\uFF1A\u5E84\u91CD\u3001\u7B80\u6D01\u3001\u53EF\u6267\u884C\uFF1B\u591A\u7528\u201C\u8BF7\u201D\u201C\u73B0\u5C06\u6709\u5173\u4E8B\u9879\u901A\u77E5\u5982\u4E0B\u201D\u201C\u8BF7\u5404\u90E8\u95E8\u7ED3\u5408\u5B9E\u9645\u843D\u5B9E\u201D\u7B49\u8868\u8FBE\u3002\n\u683C\u5F0F\u8981\u6C42\uFF1A\u5C42\u7EA7\u7F16\u53F7\u6E05\u6670\uFF0C\u91CD\u8981\u4E8B\u9879\u5206\u6761\u5217\u793A\uFF0C\u907F\u514D\u53E3\u8BED\u5316\u548C\u5938\u5F20\u5F62\u5BB9\u3002";
  var folderColors = ["#0f766e", "#b65a00", "#7a4d9f", "#b42318", "#3f6f87"];

  // src/utils/helpers.js
  function createId() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
  function now() {
    return (/* @__PURE__ */ new Date()).toISOString();
  }
  function formatTime(value) {
    if (!value) return "";
    const date = new Date(value);
    return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
  }
  function formatLocalDate(value) {
    if (!value) return "";
    const date = new Date(value);
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  function describeLengthChange(delta) {
    if (delta === 0) return "\u65E0\u53D8\u5316";
    return delta > 0 ? `\u589E\u52A0 ${delta} \u5B57` : `\u51CF\u5C11 ${Math.abs(delta)} \u5B57`;
  }
  function sanitizeFileName(name) {
    return String(name || "\u672A\u547D\u540D\u6587\u6863").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
  }
  function normalizeHandle(value) {
    return String(value || "").trim().replace(/^@+/, "").replace(/\s+/g, "").replace(/[^\u4e00-\u9fa5A-Za-z0-9_-]/g, "").slice(0, 24);
  }
  function normalizeEndpointPath(value) {
    const path = String(value || "/chat/completions").trim() || "/chat/completions";
    return path.startsWith("/") ? path : `/${path}`;
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function stableTextHash(value) {
    let hash = 0;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash = hash * 31 + text.charCodeAt(index) >>> 0;
    }
    return hash.toString(16);
  }

  // src/core/storage.js
  function openWorkspaceDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("\u5F53\u524D\u6D4F\u89C8\u5668\u4E0D\u652F\u6301 IndexedDB"));
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
  async function readWorkspaceState() {
    const db = await openWorkspaceDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WORKSPACE_STORE_NAME, "readonly");
      const request = tx.objectStore(WORKSPACE_STORE_NAME).get(WORKSPACE_STATE_ID);
      request.onsuccess = () => resolve(request.result?.data || null);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
  }
  async function writeWorkspaceState(snapshot) {
    const db = await openWorkspaceDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WORKSPACE_STORE_NAME, "readwrite");
      tx.objectStore(WORKSPACE_STORE_NAME).put({
        id: WORKSPACE_STATE_ID,
        data: snapshot,
        updatedAt: now()
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
  function openHandleDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(HANDLE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(HANDLE_STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function saveDirectoryHandle(folderId, handle) {
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
  async function getDirectoryHandle(folderId) {
    const db = await openHandleDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE_NAME, "readonly");
      const request = tx.objectStore(HANDLE_STORE_NAME).get(folderId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
  }
  async function removeDirectoryHandle(folderId) {
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
  async function getAuthorizedDirectoryHandle(folder, mode = "read") {
    const handle = await getDirectoryHandle(folder.id);
    if (!handle) {
      throw new Error("\u672A\u627E\u5230\u8BE5\u771F\u5B9E\u6587\u4EF6\u5939\u7684\u6D4F\u89C8\u5668\u6388\u6743\uFF0C\u8BF7\u91CD\u65B0\u5173\u8054\u3002");
    }
    const options = { mode };
    if (await handle.queryPermission(options) === "granted") {
      return handle;
    }
    if (await handle.requestPermission(options) === "granted") {
      return handle;
    }
    throw new Error("\u6CA1\u6709\u8BE5\u771F\u5B9E\u6587\u4EF6\u5939\u7684\u8BBF\u95EE\u6743\u9650\u3002");
  }

  // src/core/eventBus.js
  var EventBus = class {
    constructor() {
      this.listeners = /* @__PURE__ */ new Map();
    }
    on(event, callback) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, []);
      }
      this.listeners.get(event).push(callback);
      return () => this.off(event, callback);
    }
    off(event, callback) {
      if (!this.listeners.has(event)) return;
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) callbacks.splice(index, 1);
    }
    emit(event, data) {
      if (!this.listeners.has(event)) return;
      this.listeners.get(event).slice().forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`EventBus listener failed for ${event}`, error);
        }
      });
    }
    clear() {
      this.listeners.clear();
    }
  };
  var EVENTS = {
    RENDER_ALL: "render:all",
    RENDER_FOLDERS: "render:folders",
    RENDER_FOLDER_SELECT: "render:folder-select",
    RENDER_DOC_LIST: "render:doc-list",
    RENDER_EDITOR: "render:editor",
    RENDER_STYLE_SELECT: "render:style-select",
    RENDER_STYLE_EDITOR: "render:style-editor",
    RENDER_STYLE_EXAMPLES: "render:style-examples",
    RENDER_STYLE_LIST: "render:style-list",
    RENDER_SKILL_QUALITY: "render:skill-quality",
    RENDER_SKILL_TEST: "render:skill-test",
    RENDER_API_SETTINGS: "render:api-settings"
  };
  var eventBus = new EventBus();

  // src/utils/validation.js
  function isSupportedTextFile(name) {
    const lower = String(name || "").toLowerCase();
    return SUPPORTED_TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }
  function guessTypeFromName(name) {
    if (/纪要|会议/.test(name)) return "minutes";
    if (/总结/.test(name)) return "summary";
    if (/方案|计划/.test(name)) return "plan";
    if (/请示|报告/.test(name)) return "request";
    if (/讲话|发言/.test(name)) return "speech";
    if (/函/.test(name)) return "letter";
    return "notice";
  }
  function coerceArray(value) {
    if (Array.isArray(value)) return value.filter((item) => item !== null && item !== void 0 && item !== "");
    if (value === null || value === void 0 || value === "") return [];
    return [value];
  }
  function clampConfidence(value) {
    const number = Number(value);
    if (Number.isNaN(number)) return 0.5;
    return Math.max(0, Math.min(1, number));
  }

  // src/utils/formatters.js
  function stripCodeFence(value) {
    return String(value || "").trim().replace(/^```(?:json|markdown|md)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  function extractJsonValue(text) {
    const raw = stripCodeFence(text);
    const objectStart = raw.indexOf("{");
    const arrayStart = raw.indexOf("[");
    const candidates = [
      { start: objectStart, end: raw.lastIndexOf("}") },
      { start: arrayStart, end: raw.lastIndexOf("]") }
    ].filter((item) => item.start >= 0 && item.end > item.start);
    if (candidates.length === 0) return "";
    candidates.sort((a, b) => a.start - b.start);
    return raw.slice(candidates[0].start, candidates[0].end + 1);
  }
  function extractJsonObject(text) {
    const raw = stripCodeFence(text);
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return "";
    return raw.slice(start, end + 1);
  }
  function parseLooseJson(value) {
    const raw = stripCodeFence(value);
    const json = extractJsonValue(raw) || raw;
    const attempts = [
      json,
      json.replace(/,\s*([}\]])/g, "$1"),
      json.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/,\s*([}\]])/g, "$1")
    ];
    for (const attempt of attempts) {
      try {
        return { ok: true, value: JSON.parse(attempt) };
      } catch {
      }
    }
    return { ok: false, value: null };
  }
  function formatPossiblyJson(value) {
    const raw = stripCodeFence(value);
    const jsonValue = extractJsonValue(raw);
    if (!jsonValue) return raw;
    try {
      return JSON.stringify(JSON.parse(jsonValue), null, 2);
    } catch {
      return raw;
    }
  }
  function formatListItems(items) {
    const values = coerceArray(items).map((item) => typeof item === "string" ? item : JSON.stringify(item));
    return values.length ? values.map((item) => `- ${item}`).join("\n") : "- \u6682\u65E0";
  }
  function formatAggregationMarkdown(data) {
    const section = (title, items) => `## ${title}
${formatListItems(items)}`;
    return [
      `# \u591A\u7BC7\u6587\u6863\u805A\u5408`,
      `\u6837\u672C\u6570\u91CF\uFF1A${data.document_count || 0}`,
      `\u6574\u4F53\u7F6E\u4FE1\u5EA6\uFF1A${data.overall_confidence || "low"}`,
      section("\u5171\u540C\u7ED3\u6784", data.common_structure),
      section("\u5171\u540C\u6587\u98CE", data.common_style),
      section("\u683C\u5F0F\u89C4\u8303", data.common_format),
      section("\u5E38\u7528\u8868\u8FBE", data.common_expressions),
      section("\u5F3A\u89C4\u5219", (data.strong_rules || []).map((rule) => `${rule.rule}\uFF08\u8BC1\u636E ${rule.evidence_count} \u7BC7\uFF09`)),
      section("\u5019\u9009\u89C4\u5219", (data.candidate_rules || []).map((rule) => `${rule.rule}\uFF08\u5019\u9009\uFF0C\u8BC1\u636E ${rule.evidence_count || 1} \u7BC7\uFF09`)),
      section("\u51B2\u7A81\u89C4\u5219\u63D0\u793A", (data.conflicts || []).map((item) => item.topic || JSON.stringify(item))),
      section("\u4E2A\u6848\u89C4\u5219\u6392\u9664", data.case_specific_exclusions),
      section("\u9690\u79C1\u4FE1\u606F\u8FC7\u6EE4", data.privacy_findings),
      section("\u4EBA\u5DE5\u6821\u51C6\u5EFA\u8BAE", data.recommended_calibration)
    ].join("\n\n");
  }

  // src/modules/ai/aiClient.js
  function createAiClient({ getSettings, notify = () => {
  } }) {
    async function callAi(messages, options = {}) {
      const settings = getSettings() || {};
      if (!settings.baseUrl || !settings.model) {
        throw new Error("\u8BF7\u5148\u5728\u201C\u63A5\u53E3\u201D\u4E2D\u914D\u7F6E Base URL \u548C\u6A21\u578B\u3002");
      }
      const endpointPath = normalizeEndpointPath(settings.endpointPath);
      const url = `${settings.baseUrl.replace(/\/+$/, "")}${endpointPath}`;
      const headers = { "Content-Type": "application/json" };
      if (settings.apiKey) {
        headers.Authorization = `Bearer ${settings.apiKey}`;
      }
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs || AI_REQUEST_TIMEOUT_MS);
      let response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            model: settings.model,
            messages,
            temperature: options.temperature ?? 0.35
          })
        });
      } catch (error) {
        if (error.name === "AbortError") {
          const timeoutError = new Error("AI \u8BF7\u6C42\u8D85\u65F6");
          timeoutError.code = "timeout";
          timeoutError.retryable = true;
          throw timeoutError;
        }
        const networkError = new Error("AI \u63A5\u53E3\u65E0\u6CD5\u8FDE\u63A5");
        networkError.cause = error;
        networkError.retryable = true;
        throw networkError;
      } finally {
        window.clearTimeout(timeout);
      }
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        const error = new Error(`AI \u63A5\u53E3\u8FD4\u56DE ${response.status}\uFF1A${text.slice(0, 180) || response.statusText}`);
        error.status = response.status;
        error.responseText = text;
        error.retryAfter = response.headers.get("retry-after");
        error.retryable = isRetryableStatus(response.status);
        throw error;
      }
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || data?.output_text || data?.content;
      if (!content) {
        throw new Error("AI \u63A5\u53E3\u672A\u8FD4\u56DE\u53EF\u7528\u6587\u672C\u3002");
      }
      return String(content).trim();
    }
    async function callAiWithRetry2(messages, options = {}, maxRetries = AI_MAX_RETRIES) {
      let lastError = null;
      for (let attempt = 0; attempt < maxRetries; attempt += 1) {
        try {
          return await callAi(messages, options);
        } catch (error) {
          lastError = error;
          const friendly = friendlyAiErrorMessage(error);
          const shouldRetry = attempt < maxRetries - 1 && shouldRetryAiError(error);
          if (!shouldRetry) {
            throw new Error(friendly);
          }
          const delayMs = getRetryDelayMs(error, attempt);
          notify(`${friendly}\uFF0C${Math.round(delayMs / 1e3)} \u79D2\u540E\u91CD\u8BD5\uFF08${attempt + 2}/${maxRetries}\uFF09`, "warn");
          await sleep(delayMs);
        }
      }
      throw new Error(friendlyAiErrorMessage(lastError));
    }
    async function callAiJsonWithRepair2(messages, label, options = {}) {
      const first = await callAiWithRetry2(messages, { temperature: options.temperature ?? 0.15 });
      const parsed = parseLooseJson(first);
      if (parsed.ok) return parsed.value;
      const repairMessages = [
        ...messages,
        { role: "assistant", content: first.slice(0, 12e3) },
        {
          role: "user",
          content: `\u4E0A\u4E00\u6B21\u201C${label}\u201D\u4E0D\u662F\u6709\u6548 JSON\u3002\u8BF7\u4FEE\u590D\u4E3A\u4E25\u683C JSON\uFF1A\u4E0D\u52A0 Markdown\u3001\u4E0D\u52A0\u89E3\u91CA\u3001\u4E0D\u8981\u5C3E\u968F\u9017\u53F7\u3001\u5B57\u7B26\u4E32\u5FC5\u987B\u7528\u53CC\u5F15\u53F7\u3002`
        }
      ];
      const second = await callAiWithRetry2(repairMessages, { temperature: 0 });
      const repaired = parseLooseJson(second);
      if (repaired.ok) return repaired.value;
      throw new Error(`${label} \u89E3\u6790\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u6216\u68C0\u67E5\u6A21\u578B\u8F93\u51FA\u683C\u5F0F\u3002`);
    }
    return {
      callAi,
      callAiWithRetry: callAiWithRetry2,
      callAiJsonWithRepair: callAiJsonWithRepair2,
      friendlyAiErrorMessage,
      sleep
    };
  }
  function friendlyAiErrorMessage(error) {
    const message = String(error?.message || "");
    const status = error?.status || Number(message.match(/\b(401|403|404|408|409|429|500|502|503|504)\b/)?.[1]);
    if (status === 401 || status === 403) return "API Key \u65E0\u6548\u6216\u65E0\u6743\u9650\uFF0C\u8BF7\u68C0\u67E5\u63A5\u53E3\u914D\u7F6E";
    if (status === 404) return "AI \u63A5\u53E3\u5730\u5740\u6216\u6A21\u578B\u4E0D\u5B58\u5728\uFF0C\u8BF7\u68C0\u67E5 Base URL\u3001Endpoint Path \u548C\u6A21\u578B\u540D\u79F0";
    if (status === 429) return "\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41\u6216\u989D\u5EA6\u4E0D\u8DB3";
    if (status >= 500) return "AI \u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528";
    if (error?.code === "timeout" || /timeout|超时|AbortError/i.test(message)) return "AI \u8BF7\u6C42\u8D85\u65F6";
    if (/Failed to fetch|无法连接|NetworkError|Load failed/i.test(message)) {
      return "AI \u63A5\u53E3\u65E0\u6CD5\u8FDE\u63A5\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u3001Base URL \u6216\u8DE8\u57DF\u8BBE\u7F6E";
    }
    if (/Base URL|模型/.test(message)) return message;
    return message || "AI \u8C03\u7528\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5";
  }
  function shouldRetryAiError(error) {
    if (error?.retryable) return true;
    const message = String(error?.message || "");
    return /timeout|超时|无法连接|Failed to fetch|NetworkError|Load failed/i.test(message);
  }
  function isRetryableStatus(status) {
    return [408, 409, 425, 429, 500, 502, 503, 504].includes(Number(status));
  }
  function getRetryDelayMs(error, attempt) {
    const retryAfter = Number(error?.retryAfter || 0);
    if (retryAfter > 0) return retryAfter * 1e3;
    return AI_RETRY_BASE_DELAY_MS * (attempt + 1);
  }
  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  // src/modules/documents/documentEditor.js
  function createDocumentEditor(deps) {
    const {
      state: state2,
      ui: ui2,
      els: els2,
      saveDelayMs,
      getCurrentDoc: getCurrentDoc2,
      createDefaultFolder: createDefaultFolder2,
      getDocumentLocation: getDocumentLocation2,
      getFolderById: getFolderById2,
      persist: persist2,
      eventBus: eventBus2,
      syncDocumentToRealFolder: syncDocumentToRealFolder2,
      toast: toast2
    } = deps;
    function queueEditorSave2() {
      els2.saveState.textContent = "\u4FDD\u5B58\u4E2D";
      window.clearTimeout(ui2.saveTimer);
      ui2.saveTimer = window.setTimeout(() => saveEditor2(false), saveDelayMs);
    }
    function saveEditor2(showToast2) {
      const doc = getCurrentDoc2();
      if (!doc) return;
      doc.title = els2.titleInput.value.trim() || "\u672A\u547D\u540D\u6587\u6863";
      doc.type = els2.typeSelect.value || "custom";
      doc.folderId = els2.folderSelect.value || state2.folders[0]?.id || createDefaultFolder2();
      doc.styleId = els2.styleSelect.value || "";
      doc.content = els2.contentEditor.value;
      doc.updatedAt = now();
      ui2.selectedDocId = doc.id;
      persist2();
      els2.saveState.textContent = "\u5DF2\u4FDD\u5B58";
      els2.saveState.title = `\u4FDD\u5B58\u4F4D\u7F6E\uFF1A${getDocumentLocation2(doc)}`;
      eventBus2.emit(EVENTS.RENDER_DOC_LIST);
      if (showToast2) {
        showSaveLocation(doc);
      }
    }
    function showSaveLocation(doc) {
      if (getFolderById2(doc.folderId)?.kind === "real") {
        syncDocumentToRealFolder2(doc).then((location) => toast2(`\u5DF2\u4FDD\u5B58\u5230\uFF1A${location}`)).catch(
          (error) => toast2(`\u5DF2\u4FDD\u5B58\u5230\uFF1A${getDocumentLocation2(doc)}\uFF1B\u540C\u6B65\u771F\u5B9E\u6587\u4EF6\u5939\u5931\u8D25\uFF1A${error.message}`, "warn")
        );
        return;
      }
      toast2(`\u5DF2\u4FDD\u5B58\u5230\uFF1A${getDocumentLocation2(doc)}`);
    }
    return {
      queueEditorSave: queueEditorSave2,
      saveEditor: saveEditor2
    };
  }

  // src/modules/documents/documentManager.js
  function createDocumentManager(deps) {
    const {
      state: state2,
      ui: ui2,
      saveEditor: saveEditor2,
      persist: persist2,
      eventBus: eventBus2,
      focusTitleInput,
      createDefaultFolder: createDefaultFolder2,
      getFolderLocation: getFolderLocation2,
      getDocumentLocation: getDocumentLocation2,
      getDownloadLocation: getDownloadLocation2,
      getType: getType2,
      downloadBlob: downloadBlob2,
      toast: toast2
    } = deps;
    function getCurrentDoc2() {
      return state2.docs.find((doc) => doc.id === ui2.selectedDocId) || null;
    }
    function selectFirstDocumentIfNeeded2() {
      if (!ui2.selectedDocId || !state2.docs.some((doc) => doc.id === ui2.selectedDocId)) {
        ui2.selectedDocId = state2.docs[0]?.id || null;
      }
    }
    function resolveTargetFolder(seed = {}) {
      return seed.folderId || (ui2.selectedFolderId !== "all" ? ui2.selectedFolderId : state2.folders[0]?.id) || createDefaultFolder2();
    }
    function buildDocument(seed = {}) {
      return {
        id: createId(),
        title: seed.title || "\u672A\u547D\u540D\u6587\u6863",
        type: seed.type || "notice",
        folderId: resolveTargetFolder(seed),
        styleId: seed.styleId || state2.styles[0]?.id || "",
        content: seed.content || "",
        createdAt: now(),
        updatedAt: now()
      };
    }
    function createDocument2(seed = {}) {
      const doc = buildDocument(seed);
      saveEditor2(false);
      state2.docs.unshift(doc);
      ui2.selectedDocId = doc.id;
      persist2();
      eventBus2.emit(EVENTS.RENDER_ALL);
      focusTitleInput();
      return doc;
    }
    function duplicateDocument2(docId) {
      const source = state2.docs.find((doc) => doc.id === docId);
      if (!source) return null;
      const copy = {
        ...clone(source),
        id: createId(),
        title: `${source.title || "\u672A\u547D\u540D\u6587\u6863"} \u526F\u672C`,
        createdAt: now(),
        updatedAt: now()
      };
      state2.docs.unshift(copy);
      ui2.selectedDocId = copy.id;
      persist2();
      eventBus2.emit(EVENTS.RENDER_ALL);
      toast2(`\u5DF2\u590D\u5236\u6587\u6863\u5230\uFF1A${getDocumentLocation2(copy)}`);
      return copy;
    }
    function duplicateCurrentDocument() {
      const current = getCurrentDoc2();
      return current ? duplicateDocument2(current.id) : null;
    }
    function deleteCurrentDocument2(confirmDelete = (message) => window.confirm(message)) {
      const current = getCurrentDoc2();
      if (!current) return false;
      const ok = confirmDelete(`\u5220\u9664\u201C${current.title || "\u672A\u547D\u540D\u6587\u6863"}\u201D\uFF1F`);
      if (!ok) return false;
      const oldLocation = getDocumentLocation2(current);
      state2.docs = state2.docs.filter((doc) => doc.id !== current.id);
      ui2.selectedDocId = state2.docs[0]?.id || null;
      persist2();
      eventBus2.emit(EVENTS.RENDER_ALL);
      toast2(`\u5DF2\u4ECE ${oldLocation} \u5220\u9664\u6587\u6863`, "warn");
      return true;
    }
    async function importDocumentFiles2(files) {
      if (!files || files.length === 0) return 0;
      const folderId = ui2.selectedFolderId !== "all" ? ui2.selectedFolderId : state2.folders[0]?.id || createDefaultFolder2();
      saveEditor2(false);
      let importedCount = 0;
      for (const file of files) {
        const content = await file.text();
        const doc = buildDocument({
          title: file.name.replace(/\.[^.]+$/, ""),
          type: guessTypeFromName(file.name),
          folderId,
          content
        });
        state2.docs.unshift(doc);
        ui2.selectedDocId = doc.id;
        importedCount += 1;
      }
      persist2();
      eventBus2.emit(EVENTS.RENDER_ALL);
      const folder = state2.folders.find((item) => item.id === folderId);
      toast2(`\u5DF2\u5BFC\u5165 ${importedCount} \u4EFD\u6587\u6863\u5230\uFF1A${getFolderLocation2(folder)}`);
      return importedCount;
    }
    function exportCurrentDocument2() {
      saveEditor2(false);
      const doc = getCurrentDoc2();
      if (!doc) return null;
      const type = getType2(doc.type).name;
      const content = `${doc.title}

${doc.content}`;
      const fileName = `${sanitizeFileName(doc.title || "\u672A\u547D\u540D\u6587\u6863")}.txt`;
      downloadBlob2(fileName, content, "text/plain;charset=utf-8");
      toast2(`\u5DF2\u5BFC\u51FA ${type} \u5230\uFF1A${getDownloadLocation2(fileName)}`);
      return fileName;
    }
    function exportWorkspaceBackup2() {
      saveEditor2(false);
      const backup = {
        exportedAt: now(),
        app: "mowen-nibi-workbench",
        version: 1,
        data: state2
      };
      const fileName = `\u6479\u6587\u62DF\u7B14\u5DE5\u4F5C\u53F0\u5907\u4EFD-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
      downloadBlob2(fileName, JSON.stringify(backup, null, 2), "application/json;charset=utf-8");
      toast2(`\u5DF2\u5BFC\u51FA\u5907\u4EFD\u5230\uFF1A${getDownloadLocation2(fileName)}`);
      return fileName;
    }
    return {
      createDocument: createDocument2,
      duplicateCurrentDocument,
      duplicateDocument: duplicateDocument2,
      deleteCurrentDocument: deleteCurrentDocument2,
      getCurrentDoc: getCurrentDoc2,
      selectFirstDocumentIfNeeded: selectFirstDocumentIfNeeded2,
      importDocumentFiles: importDocumentFiles2,
      exportCurrentDocument: exportCurrentDocument2,
      exportWorkspaceBackup: exportWorkspaceBackup2
    };
  }

  // src/modules/documents/documentRenderer.js
  function createDocumentRenderer(deps) {
    const {
      state: state2,
      ui: ui2,
      els: els2,
      getType: getType2,
      getCurrentDoc: getCurrentDoc2,
      getDocumentLocation: getDocumentLocation2,
      onSelectDocument,
      onCopyDocument,
      onDeleteDocument
    } = deps;
    function getVisibleDocuments() {
      const query = els2.searchInput.value.trim().toLowerCase();
      return state2.docs.filter((doc) => ui2.selectedFolderId === "all" || doc.folderId === ui2.selectedFolderId).filter((doc) => {
        if (!query) return true;
        return `${doc.title}
${doc.content}`.toLowerCase().includes(query);
      }).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }
    function renderDocList2() {
      const docs = getVisibleDocuments();
      els2.docCount.textContent = String(docs.length);
      if (docs.length === 0) {
        els2.docList.innerHTML = '<div class="empty-state">\u6CA1\u6709\u5339\u914D\u7684\u6587\u6863</div>';
        return;
      }
      els2.docList.innerHTML = docs.map((doc) => {
        const type = getType2(doc.type).name;
        const folder = state2.folders.find((item) => item.id === doc.folderId);
        return `<article class="doc-item ${doc.id === ui2.selectedDocId ? "active" : ""}" data-doc-id="${doc.id}">
          <div class="doc-title-row">
            <div class="doc-title">${escapeHtml(doc.title || "\u672A\u547D\u540D\u6587\u6863")}</div>
            <span class="doc-actions">
              <button class="tiny-button" type="button" title="\u590D\u5236" data-copy-doc="${doc.id}"><i data-lucide="copy"></i></button>
              <button class="tiny-button danger-text" type="button" title="\u5220\u9664" data-delete-doc="${doc.id}"><i data-lucide="trash-2"></i></button>
            </span>
          </div>
          <div class="doc-meta">
            <span>${escapeHtml(type)}</span>
            <span>${escapeHtml(folder?.name || "\u672A\u5F52\u6863")}</span>
            <span>${formatTime(doc.updatedAt)}</span>
          </div>
          <div class="doc-snippet">${escapeHtml(doc.content.replace(/\s+/g, " ").slice(0, 120) || "\u7A7A\u767D\u6587\u6863")}</div>
        </article>`;
      }).join("");
      els2.docList.querySelectorAll(".doc-item").forEach((item) => {
        item.addEventListener("click", (event) => {
          if (event.target.closest("[data-copy-doc], [data-delete-doc]")) return;
          onSelectDocument(item.dataset.docId);
        });
      });
      els2.docList.querySelectorAll("[data-copy-doc]").forEach((button) => {
        button.addEventListener("click", () => onCopyDocument(button.dataset.copyDoc));
      });
      els2.docList.querySelectorAll("[data-delete-doc]").forEach((button) => {
        button.addEventListener("click", () => onDeleteDocument(button.dataset.deleteDoc));
      });
      if (window.lucide) window.lucide.createIcons();
    }
    function renderEditor2() {
      const doc = getCurrentDoc2();
      if (!doc) {
        els2.titleInput.value = "";
        els2.contentEditor.value = "";
        return;
      }
      els2.titleInput.value = doc.title || "";
      els2.typeSelect.value = doc.type || "custom";
      els2.folderSelect.value = doc.folderId || state2.folders[0]?.id || "";
      els2.styleSelect.value = doc.styleId || "";
      els2.contentEditor.value = doc.content || "";
      els2.saveState.textContent = "\u5DF2\u4FDD\u5B58";
      els2.saveState.title = `\u4FDD\u5B58\u4F4D\u7F6E\uFF1A${getDocumentLocation2(doc)}`;
    }
    return {
      getVisibleDocuments,
      renderDocList: renderDocList2,
      renderEditor: renderEditor2
    };
  }

  // src/modules/folders/folderManager.js
  function createFolderManager(deps) {
    const {
      state: state2,
      ui: ui2,
      els: els2,
      persist: persist2,
      eventBus: eventBus2,
      getFolderLocation: getFolderLocation2,
      getDocumentLocation: getDocumentLocation2,
      toast: toast2
    } = deps;
    function normalizeFolder2(folder) {
      return {
        ...folder,
        kind: folder.kind === "real" ? "real" : "tag",
        color: folder.color || folderColors[state2.folders?.length % folderColors.length] || folderColors[0],
        createdAt: folder.createdAt || now()
      };
    }
    function getFolderById2(folderId) {
      return state2.folders.find((folder) => folder.id === folderId) || null;
    }
    function createDefaultFolder2() {
      const folder = {
        id: createId(),
        name: "\u672A\u5F52\u6863",
        kind: "tag",
        color: folderColors[state2.folders.length % folderColors.length],
        createdAt: now()
      };
      state2.folders.push(folder);
      return folder.id;
    }
    async function linkRealFolder2() {
      if (!window.showDirectoryPicker) {
        toast2("\u5F53\u524D\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u5173\u8054\u771F\u5B9E\u6587\u4EF6\u5939\uFF0C\u8BF7\u4F7F\u7528\u652F\u6301 File System Access API \u7684 Chromium \u6D4F\u89C8\u5668\u3002", "warn");
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
          color: folderColors[state2.folders.length % folderColors.length],
          createdAt: now(),
          updatedAt: now()
        };
        await saveDirectoryHandle(id, handle);
        state2.folders.push(folder);
        ui2.selectedFolderId = id;
        const importedCount = await importFilesFromDirectoryHandle(folder, handle);
        persist2();
        eventBus2.emit(EVENTS.RENDER_ALL);
        toast2(`\u5DF2\u5173\u8054\u771F\u5B9E\u6587\u4EF6\u5939\uFF1A${getFolderLocation2(folder)}${importedCount ? `\uFF0C\u5E76\u5BFC\u5165 ${importedCount} \u4EFD\u6587\u6863` : ""}`);
        return folder;
      } catch (error) {
        if (error?.name !== "AbortError") {
          toast2(`\u5173\u8054\u771F\u5B9E\u6587\u4EF6\u5939\u5931\u8D25\uFF1A${error.message || error}`, "error");
        }
        return null;
      }
    }
    async function syncRealFolder2(folderId) {
      const folder = getFolderById2(folderId);
      if (!folder || folder.kind !== "real") return 0;
      try {
        const handle = await getAuthorizedDirectoryHandle(folder, "read");
        const importedCount = await importFilesFromDirectoryHandle(folder, handle);
        persist2();
        eventBus2.emit(EVENTS.RENDER_ALL);
        toast2(`\u5DF2\u4ECE\u771F\u5B9E\u6587\u4EF6\u5939\u91CD\u65B0\u5BFC\u5165\uFF1A${getFolderLocation2(folder)}${importedCount ? `\uFF0C\u65B0\u589E ${importedCount} \u4EFD\u6587\u6863` : "\uFF0C\u6CA1\u6709\u65B0\u589E\u6587\u6863"}`);
        return importedCount;
      } catch (error) {
        toast2(`\u8BFB\u53D6\u771F\u5B9E\u6587\u4EF6\u5939\u5931\u8D25\uFF1A${error.message || error}`, "error");
        return 0;
      }
    }
    async function importFilesFromDirectoryHandle(folder, handle) {
      let importedCount = 0;
      for await (const entry of handle.values()) {
        if (entry.kind !== "file" || !isSupportedTextFile(entry.name)) continue;
        const file = await entry.getFile();
        const sourceKey = `${folder.id}:${entry.name}:${file.lastModified}:${file.size}`;
        if (state2.docs.some((doc) => doc.sourceKey === sourceKey)) continue;
        const content = await file.text();
        state2.docs.unshift({
          id: createId(),
          title: entry.name.replace(/\.[^.]+$/, ""),
          type: guessTypeFromName(entry.name),
          folderId: folder.id,
          styleId: state2.styles[0]?.id || "",
          content,
          sourceKey,
          sourceFileName: entry.name,
          createdAt: now(),
          updatedAt: now()
        });
        importedCount += 1;
      }
      return importedCount;
    }
    async function syncDocumentToRealFolder2(doc) {
      const folder = getFolderById2(doc.folderId);
      if (!folder || folder.kind !== "real") return getDocumentLocation2(doc);
      const handle = await getAuthorizedDirectoryHandle(folder, "readwrite");
      const fileName = `${sanitizeFileName(doc.title || "\u672A\u547D\u540D\u6587\u6863")}.txt`;
      const fileHandle = await handle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(`${doc.title || "\u672A\u547D\u540D\u6587\u6863"}

${doc.content || ""}`);
      await writable.close();
      doc.syncedFileName = fileName;
      doc.updatedAt = now();
      persist2();
      return `${getFolderLocation2(folder)} / ${fileName}`;
    }
    function addFolder2() {
      const name = els2.folderNameInput.value.trim();
      if (!name) {
        toast2("\u8BF7\u8F93\u5165\u6807\u7B7E\u540D\u79F0", "warn");
        return null;
      }
      const folder = {
        id: createId(),
        name,
        kind: "tag",
        color: folderColors[state2.folders.length % folderColors.length],
        createdAt: now()
      };
      state2.folders.push(folder);
      ui2.selectedFolderId = folder.id;
      els2.folderNameInput.value = "";
      els2.folderCreateBox.hidden = true;
      persist2();
      eventBus2.emit(EVENTS.RENDER_ALL);
      toast2(`\u5DF2\u521B\u5EFA\u6807\u7B7E\uFF1A${getFolderLocation2(folder)}`);
      return folder;
    }
    function renameFolder2(folderId, promptName = (message, current) => window.prompt(message, current)) {
      const folder = getFolderById2(folderId);
      if (!folder) return null;
      const name = promptName(folder.kind === "real" ? "\u771F\u5B9E\u6587\u4EF6\u5939\u663E\u793A\u540D\u79F0" : "\u6807\u7B7E\u540D\u79F0", folder.name);
      if (!name || !name.trim()) return null;
      folder.name = name.trim();
      folder.updatedAt = now();
      persist2();
      eventBus2.emit(EVENTS.RENDER_ALL);
      return folder;
    }
    function deleteFolder2(folderId, confirmDelete = (message) => window.confirm(message)) {
      const folder = getFolderById2(folderId);
      if (!folder) return false;
      const docsInFolder = state2.docs.filter((doc) => doc.folderId === folderId).length;
      const ok = confirmDelete(
        folder.kind === "real" ? `\u53D6\u6D88\u5173\u8054\u771F\u5B9E\u6587\u4EF6\u5939\u201C${folder.name}\u201D\uFF1F\u4E0D\u4F1A\u5220\u9664\u78C1\u76D8\u4E2D\u7684\u771F\u5B9E\u6587\u4EF6\uFF0C\u5176\u4E2D ${docsInFolder} \u4EFD\u6587\u6863\u4F1A\u79FB\u52A8\u5230\u5176\u4ED6\u6807\u7B7E/\u6587\u4EF6\u5939\u3002` : `\u5220\u9664\u6807\u7B7E\u201C${folder.name}\u201D\uFF1F\u5176\u4E2D ${docsInFolder} \u4EFD\u6587\u6863\u4F1A\u79FB\u52A8\u5230\u5176\u4ED6\u6807\u7B7E/\u6587\u4EF6\u5939\u3002`
      );
      if (!ok) return false;
      state2.folders = state2.folders.filter((item) => item.id !== folderId);
      const fallbackFolder = state2.folders[0]?.id || createDefaultFolder2();
      state2.docs.forEach((doc) => {
        if (doc.folderId === folderId) doc.folderId = fallbackFolder;
      });
      ui2.selectedFolderId = "all";
      persist2();
      if (folder.kind === "real") {
        removeDirectoryHandle(folder.id).catch((error) => {
          console.warn("\u79FB\u9664\u771F\u5B9E\u6587\u4EF6\u5939\u6388\u6743\u5931\u8D25", error);
        });
      }
      eventBus2.emit(EVENTS.RENDER_ALL);
      toast2(`\u5DF2${folder.kind === "real" ? "\u53D6\u6D88\u5173\u8054\u771F\u5B9E\u6587\u4EF6\u5939" : "\u5220\u9664\u6807\u7B7E"}\uFF0C\u76F8\u5173\u6587\u6863\u5DF2\u79FB\u52A8\u5230\uFF1A${getFolderLocation2(state2.folders.find((item) => item.id === fallbackFolder))}`, "warn");
      return true;
    }
    return {
      normalizeFolder: normalizeFolder2,
      getFolderById: getFolderById2,
      createDefaultFolder: createDefaultFolder2,
      linkRealFolder: linkRealFolder2,
      syncRealFolder: syncRealFolder2,
      importFilesFromDirectoryHandle,
      syncDocumentToRealFolder: syncDocumentToRealFolder2,
      addFolder: addFolder2,
      renameFolder: renameFolder2,
      deleteFolder: deleteFolder2
    };
  }

  // src/modules/folders/folderRenderer.js
  function createFolderRenderer(deps) {
    const {
      state: state2,
      ui: ui2,
      els: els2,
      onSelectFolder,
      onRenameFolder,
      onSyncFolder,
      onDeleteFolder
    } = deps;
    function renderFolders2() {
      const allActive = ui2.selectedFolderId === "all";
      const folderRows = [
        `<button class="folder-item ${allActive ? "active" : ""}" type="button" data-folder-id="all">
        <span class="folder-main"><span class="folder-color" style="background:#2d3234"></span><span>\u5168\u90E8\u6587\u6863</span></span>
        <span>${state2.docs.length}</span>
      </button>`,
        ...state2.folders.map((folder) => {
          const count = state2.docs.filter((doc) => doc.folderId === folder.id).length;
          const isReal = folder.kind === "real";
          const badge = isReal ? "\u771F\u5B9E" : "\u6807\u7B7E";
          return `<div class="folder-item ${ui2.selectedFolderId === folder.id ? "active" : ""}">
          <button class="folder-main tiny-reset" type="button" data-folder-id="${folder.id}">
            <span class="folder-color" style="background:${folder.color}"></span>
            <span>${escapeHtml(folder.name)}</span>
            <small class="folder-kind">${badge}</small>
          </button>
          <span class="folder-actions">
            <span>${count}</span>
            ${isReal ? `<button class="tiny-button" type="button" title="\u4ECE\u771F\u5B9E\u6587\u4EF6\u5939\u91CD\u65B0\u5BFC\u5165" data-sync-folder="${folder.id}"><i data-lucide="refresh-cw"></i></button>` : ""}
            <button class="tiny-button" type="button" title="\u91CD\u547D\u540D\u663E\u793A\u540D\u79F0" data-rename-folder="${folder.id}"><i data-lucide="pencil"></i></button>
            <button class="tiny-button danger-text" type="button" title="${isReal ? "\u53D6\u6D88\u5173\u8054" : "\u5220\u9664\u6807\u7B7E"}" data-delete-folder="${folder.id}"><i data-lucide="x"></i></button>
          </span>
        </div>`;
        })
      ].join("");
      els2.folderList.innerHTML = folderRows;
      els2.folderList.querySelectorAll("[data-folder-id]").forEach((button) => {
        button.addEventListener("click", () => onSelectFolder(button.dataset.folderId));
      });
      els2.folderList.querySelectorAll("[data-rename-folder]").forEach((button) => {
        button.addEventListener("click", () => onRenameFolder(button.dataset.renameFolder));
      });
      els2.folderList.querySelectorAll("[data-sync-folder]").forEach((button) => {
        button.addEventListener("click", () => onSyncFolder(button.dataset.syncFolder));
      });
      els2.folderList.querySelectorAll("[data-delete-folder]").forEach((button) => {
        button.addEventListener("click", () => onDeleteFolder(button.dataset.deleteFolder));
      });
    }
    function renderFolderSelect2() {
      els2.folderSelect.innerHTML = state2.folders.map((folder) => `<option value="${folder.id}">${folder.kind === "real" ? "\u{1F4C1}" : "#"} ${escapeHtml(folder.name)}</option>`).join("");
    }
    return {
      renderFolders: renderFolders2,
      renderFolderSelect: renderFolderSelect2
    };
  }

  // src/modules/skills/skillAnalyzer.js
  function normalizeSingleDocumentAnalysis(result, example, index) {
    return {
      document_id: example.id || stableTextHash(example.name + example.text),
      document_name: result.document_name || example.name || `\u6837\u672C\u6587\u6863${index + 1}`,
      document_type: result.document_type || "",
      scenario: result.scenario || "",
      title_format: result.title_format || "",
      opening_pattern: result.opening_pattern || "",
      body_structure: coerceArray(result.body_structure),
      paragraph_functions: coerceArray(result.paragraph_functions),
      ending_pattern: result.ending_pattern || "",
      tone_style: coerceArray(result.tone_style),
      format_rules: coerceArray(result.format_rules),
      common_words_sentences: coerceArray(result.common_words_sentences),
      reusable_expressions: coerceArray(result.reusable_expressions),
      variable_slots: coerceArray(result.variable_slots),
      candidate_rules: coerceArray(result.candidate_rules).map((rule) => ({
        category: rule.category || "style",
        rule: String(rule.rule || rule).trim(),
        evidence: rule.evidence || "",
        confidence: clampConfidence(rule.confidence ?? 0.4)
      })).filter((rule) => rule.rule),
      case_specific_items: coerceArray(result.case_specific_items),
      privacy_or_sensitive_items: coerceArray(result.privacy_or_sensitive_items),
      forbidden_to_reuse: coerceArray(result.forbidden_to_reuse),
      review_standards: coerceArray(result.review_standards),
      text_hash: stableTextHash(example.text || "")
    };
  }
  function normalizeAggregationData(result, documentCount) {
    return {
      document_count: Number(result.document_count || documentCount || 0),
      overall_confidence: result.overall_confidence || (documentCount >= 3 ? "medium" : "low"),
      common_structure: coerceArray(result.common_structure),
      common_style: coerceArray(result.common_style),
      common_format: coerceArray(result.common_format),
      common_expressions: coerceArray(result.common_expressions),
      review_standards: coerceArray(result.review_standards),
      strong_rules: coerceArray(result.strong_rules).filter((rule) => Number(rule.evidence_count || 0) >= 2).map(normalizeAggregatedRule),
      candidate_rules: coerceArray(result.candidate_rules).map(normalizeAggregatedRule),
      conflicts: coerceArray(result.conflicts),
      case_specific_exclusions: coerceArray(result.case_specific_exclusions),
      privacy_findings: coerceArray(result.privacy_findings),
      must_not_promote: coerceArray(result.must_not_promote),
      recommended_calibration: coerceArray(result.recommended_calibration)
    };
  }
  function normalizeAggregatedRule(rule) {
    return {
      category: rule.category || "style",
      rule: String(rule.rule || rule).trim(),
      evidence_count: Number(rule.evidence_count || 1),
      confidence: clampConfidence(rule.confidence ?? 0.5),
      source_documents: coerceArray(rule.source_documents),
      reason: rule.reason || ""
    };
  }
  function normalizeSkillDraftOutput(result, style, aggregationData) {
    const skillJson = result.skill_json || result.skillJson || {};
    const normalizedSkillJson = {
      ...skillJson,
      name: skillJson.name || style.name || "\u672A\u547D\u540D\u6267\u7B14\u4EBA",
      handle: normalizeHandle(skillJson.handle || style.handle || style.name),
      enabled: style.enabled !== false,
      category: skillJson.category || style.category || "\u81EA\u5B9A\u4E49",
      description: skillJson.description || style.description || "",
      confidence: skillJson.confidence || aggregationData.overall_confidence || "low",
      source_documents: skillJson.source_documents || (style.examples || []).map((example) => example.name),
      style_rules: normalizeStyleRules(skillJson.style_rules, aggregationData),
      format_rules: coerceArray(skillJson.format_rules || aggregationData.common_format),
      common_expression_library: coerceArray(skillJson.common_expression_library || aggregationData.common_expressions),
      variable_slots: coerceArray(skillJson.variable_slots),
      forbidden: [
        ...coerceArray(skillJson.forbidden),
        ...coerceArray(aggregationData.case_specific_exclusions),
        ...coerceArray(aggregationData.must_not_promote)
      ],
      privacy_filters: coerceArray(skillJson.privacy_filters || aggregationData.privacy_findings),
      case_specific_exclusions: coerceArray(skillJson.case_specific_exclusions || aggregationData.case_specific_exclusions),
      review_standards: coerceArray(skillJson.review_standards || aggregationData.review_standards),
      quality_controls: {
        ...skillJson.quality_controls || {},
        rule_confidence: skillJson.confidence || aggregationData.overall_confidence || "low",
        single_document_rule_policy: "\u5355\u7BC7\u6837\u672C\u53EA\u4EA7\u751F\u5019\u9009\u89C4\u5219\uFF1B\u81F3\u5C11 2 \u7BC7\u5171\u540C\u9A8C\u8BC1\u540E\u624D\u80FD\u6210\u4E3A\u5F3A\u89C4\u5219",
        exclude_case_specific_info: true,
        privacy_filter: true
      }
    };
    return {
      markdown: result.markdown || buildSkillMarkdownFromJson(normalizedSkillJson, aggregationData),
      skillJson: normalizedSkillJson,
      qualityReport: result.quality_report || {},
      exampleInput: result.example_input || normalizedSkillJson.example_input || {}
    };
  }
  function normalizeStyleRules(styleRules, aggregationData) {
    const strong = aggregationData.strong_rules || [];
    const candidates = aggregationData.candidate_rules || [];
    if (styleRules && !Array.isArray(styleRules)) {
      return {
        must: coerceArray(styleRules.must).length ? coerceArray(styleRules.must) : strong.map((rule) => rule.rule),
        recommended: coerceArray(styleRules.recommended).length ? coerceArray(styleRules.recommended) : candidates.map((rule) => rule.rule),
        optional: coerceArray(styleRules.optional)
      };
    }
    return {
      must: strong.map((rule) => rule.rule),
      recommended: candidates.map((rule) => rule.rule),
      optional: coerceArray(styleRules)
    };
  }
  function normalizeSkillQualityReport(style, aggregationData, draftReport, testReport) {
    return {
      confidence: draftReport?.confidence || aggregationData.overall_confidence || "low",
      document_count: aggregationData.document_count || (style.examples || []).length,
      strong_rules: aggregationData.strong_rules || [],
      candidate_rules: aggregationData.candidate_rules || [],
      conflicts: aggregationData.conflicts || [],
      case_specific_exclusions: aggregationData.case_specific_exclusions || [],
      privacy_findings: aggregationData.privacy_findings || [],
      privacy_filter_notes: draftReport?.privacy_filter_notes || [],
      test_report: testReport || {}
    };
  }
  function pickSkillMetadata(style) {
    return {
      name: style.name,
      handle: normalizeHandle(style.handle || style.name),
      category: style.category,
      description: style.description,
      enabled: style.enabled !== false,
      example_count: (style.examples || []).length
    };
  }
  function buildSkillMarkdownFromJson(skillJson, aggregationData) {
    return [
      `# ${skillJson.name || "\u672A\u547D\u540D\u6267\u7B14\u4EBA"}`,
      "",
      `@\u8C03\u7528\u540D\uFF1A@${skillJson.handle || ""}`,
      `\u7F6E\u4FE1\u5EA6\uFF1A${skillJson.confidence || aggregationData.overall_confidence || "low"}`,
      "",
      "## \u9002\u7528\u8303\u56F4",
      skillJson.applicable_scope || "\u5F85\u8865\u5145",
      "",
      "## \u5FC5\u987B\u9075\u5B88",
      formatListItems(skillJson.style_rules?.must || []),
      "",
      "## \u63A8\u8350\u4F7F\u7528",
      formatListItems(skillJson.style_rules?.recommended || []),
      "",
      "## \u7981\u6B62\u4E8B\u9879",
      formatListItems(skillJson.forbidden || []),
      "",
      "## \u81EA\u68C0\u6E05\u5355",
      formatListItems(skillJson.self_checklist || [])
    ].join("\n");
  }

  // src/modules/skills/skillBuilder.js
  function createSkillBuilder(deps) {
    const {
      callAiJsonWithRepair: callAiJsonWithRepair2,
      getSystemPrompt = () => DEFAULT_SYSTEM_PROMPT,
      normalizeSkillJsonText: normalizeSkillJsonText2
    } = deps;
    async function buildSkillWithAiChain(style, progress = null) {
      const examples = (style.examples || []).slice(0, 8);
      const analyses = [];
      for (const [index, example] of examples.entries()) {
        const baseProgress = 8 + Math.round(index / Math.max(examples.length, 1) * 36);
        progress?.update(`\u6B63\u5728\u5206\u6790\u6837\u672C\u6587\u6863 ${index + 1}/${examples.length}\uFF1A${example.name}`, baseProgress);
        const analysis = await analyzeSingleDocument(style, example, index);
        example.analysis = analysis;
        example.analyzedAt = now();
        analyses.push(analysis);
      }
      progress?.update("\u6B63\u5728\u805A\u5408\u591A\u7BC7\u6587\u6863\u89C4\u5219", 52);
      const aggregationData = await aggregateDocumentAnalyses(style, analyses);
      progress?.update("\u6B63\u5728\u751F\u6210\u6267\u7B14\u4EBA\u8349\u6848", 66);
      let draft = await generateSkillDraft(style, aggregationData);
      if ((style.feedbacks || []).length > 0) {
        progress?.update("\u6B63\u5728\u5438\u6536\u7528\u6237\u53CD\u9988\u4F18\u5316\u6267\u7B14\u4EBA", 74);
        draft = await optimizeSkillWithFeedback(style, draft, aggregationData);
      }
      progress?.update("\u6B63\u5728\u751F\u6210\u6D4B\u8BD5\u6587\u6863\u5E76\u81EA\u68C0", 82);
      const test = await testSkillOnGeneration(style, draft.skillJson, draft.exampleInput);
      const qualityReport = normalizeSkillQualityReport(style, aggregationData, draft.qualityReport, test.report);
      return {
        analyses,
        analysis: JSON.stringify(analyses, null, 2),
        aggregationData,
        aggregation: formatAggregationMarkdown(aggregationData),
        markdown: draft.markdown,
        skillJson: normalizeSkillJsonText2(JSON.stringify(draft.skillJson, null, 2), style),
        qualityReport,
        testDoc: test.document,
        testReport: JSON.stringify(test.report, null, 2)
      };
    }
    async function analyzeSingleDocument(style, example, index) {
      const prompt = [
        "\u4F60\u662F\u591A\u6587\u6863\u6267\u7B14\u4EBA\u6784\u5EFA\u7CFB\u7EDF\u7684\u201C\u5355\u7BC7\u6587\u6863\u5206\u6790\u5668\u201D\u3002\u8BF7\u53EA\u5206\u6790\u8FD9\u4E00\u7BC7\u6837\u672C\u6587\u6863\uFF0C\u4E0D\u80FD\u628A\u5355\u7BC7\u73B0\u8C61\u5199\u6210\u5F3A\u89C4\u5219\u3002",
        "\u8BF7\u8BC6\u522B\u7ED3\u6784\u3001\u6587\u98CE\u3001\u53E5\u5F0F\u3001\u683C\u5F0F\u3001\u53D8\u91CF\u69FD\u4F4D\u3001\u5019\u9009\u89C4\u5219\u3001\u9690\u79C1/\u654F\u611F\u4FE1\u606F\u3001\u4E2A\u6848\u4FE1\u606F\u3001\u7981\u6B62\u590D\u7528\u5185\u5BB9\u3002",
        "\u8D28\u91CF\u8981\u6C42\uFF1A\u5177\u4F53\u4EBA\u540D\u3001\u65F6\u95F4\u3001\u5730\u70B9\u3001\u6D3B\u52A8\u540D\u79F0\u3001\u4E34\u65F6\u5B89\u6392\u3001\u4E00\u6B21\u6027\u653F\u7B56\u53EA\u80FD\u8FDB\u5165 case_specific_items \u6216 forbidden_to_reuse\uFF0C\u4E0D\u80FD\u8FDB\u5165 reusable_expressions \u6216 candidate_rules\u3002",
        "\u53EA\u8F93\u51FA JSON\uFF0C\u4E0D\u8981 Markdown\u3002",
        'JSON \u7ED3\u6784\uFF1A{\n  "document_id": "...",\n  "document_name": "...",\n  "document_type": "...",\n  "scenario": "...",\n  "title_format": "...",\n  "opening_pattern": "...",\n  "body_structure": [],\n  "paragraph_functions": [],\n  "ending_pattern": "...",\n  "tone_style": [],\n  "format_rules": [],\n  "common_words_sentences": [],\n  "reusable_expressions": [],\n  "variable_slots": [],\n  "candidate_rules": [{"category":"structure|style|format|expression|review", "rule":"...", "evidence":"...", "confidence":0.0}],\n  "case_specific_items": [],\n  "privacy_or_sensitive_items": [],\n  "forbidden_to_reuse": [],\n  "review_standards": []\n}',
        `\u6267\u7B14\u4EBA\u540D\u79F0\uFF1A${style.name}`,
        `\u6837\u672C\u5E8F\u53F7\uFF1A${index + 1}`,
        `\u6837\u672C\u6587\u4EF6\u540D\uFF1A${example.name}`,
        `\u6837\u672C\u6587\u672C\uFF1A
${String(example.text || "").slice(0, 12e3)}`
      ].join("\n\n");
      const result = await callAiJsonWithRepair2(buildMessages(prompt), "\u5355\u7BC7\u6587\u6863\u5206\u6790 JSON");
      return normalizeSingleDocumentAnalysis(result, example, index);
    }
    async function aggregateDocumentAnalyses(style, analyses) {
      const prompt = [
        "\u4F60\u662F\u591A\u6587\u6863\u6267\u7B14\u4EBA\u6784\u5EFA\u7CFB\u7EDF\u7684\u201C\u591A\u7BC7\u805A\u5408\u5668\u201D\u3002\u8BF7\u6A2A\u5411\u6BD4\u8F83\u591A\u7BC7\u5355\u7BC7\u5206\u6790\uFF0C\u63D0\u70BC\u5171\u540C\u70B9\u3001\u5DEE\u5F02\u70B9\u548C\u51B2\u7A81\u70B9\u3002",
        "\u6838\u5FC3\u539F\u5219\uFF1A\u5355\u7BC7\u6587\u6863\u53EA\u80FD\u4EA7\u751F\u5019\u9009\u89C4\u5219\uFF1B\u53EA\u6709\u81F3\u5C11 2 \u7BC7\u6837\u672C\u6587\u6863\u5171\u540C\u9A8C\u8BC1\uFF0C\u624D\u53EF\u4EE5\u6210\u4E3A strong_rules\u3002\u82E5\u6837\u672C\u603B\u6570\u5C11\u4E8E 3\uFF0Coverall_confidence \u4E0D\u80FD\u9AD8\u4E8E medium\u3002",
        "\u5FC5\u987B\u6392\u9664\u5177\u4F53\u4EBA\u540D\u3001\u65F6\u95F4\u3001\u5730\u70B9\u3001\u6D3B\u52A8\u540D\u79F0\u3001\u4E34\u65F6\u5B89\u6392\u3001\u4E00\u6B21\u6027\u653F\u7B56\uFF0C\u4E0D\u80FD\u628A\u5B83\u4EEC\u5F53\u6210\u901A\u7528\u5199\u4F5C\u89C4\u5219\u3002",
        "\u53EA\u8F93\u51FA JSON\uFF0C\u4E0D\u8981 Markdown\u3002",
        'JSON \u7ED3\u6784\uFF1A{\n  "document_count": 0,\n  "overall_confidence": "low|medium|high",\n  "common_structure": [],\n  "common_style": [],\n  "common_format": [],\n  "common_expressions": [],\n  "review_standards": [],\n  "strong_rules": [{"category":"structure|style|format|expression|review", "rule":"...", "evidence_count":2, "confidence":0.0, "source_documents":[]}],\n  "candidate_rules": [{"category":"...", "rule":"...", "evidence_count":1, "confidence":0.0, "reason":"..."}],\n  "conflicts": [{"topic":"...", "variants":[], "resolution":"..."}],\n  "case_specific_exclusions": [],\n  "privacy_findings": [],\n  "must_not_promote": [],\n  "recommended_calibration": []\n}',
        `\u6267\u7B14\u4EBA\u540D\u79F0\uFF1A${style.name}`,
        `\u5355\u7BC7\u5206\u6790\uFF1A
${JSON.stringify(analyses, null, 2)}`
      ].join("\n\n");
      const result = await callAiJsonWithRepair2(buildMessages(prompt), "\u591A\u7BC7\u805A\u5408 JSON");
      return normalizeAggregationData(result, analyses.length);
    }
    async function generateSkillDraft(style, aggregationData) {
      const prompt = [
        "\u4F60\u662F\u591A\u6587\u6863\u6267\u7B14\u4EBA\u6784\u5EFA\u7CFB\u7EDF\u7684\u201C\u6267\u7B14\u4EBA\u8349\u6848\u751F\u6210\u5668\u201D\u3002\u8BF7\u6839\u636E\u591A\u7BC7\u805A\u5408\u7ED3\u679C\u751F\u6210\u53EF\u590D\u7528\u3001\u53EF\u7F16\u8F91\u3001\u53EF\u6D4B\u8BD5\u7684\u6587\u672C\u751F\u6210\u6267\u7B14\u4EBA\u3002",
        "\u751F\u6210 skill_json \u5B57\u6BB5\u65F6\uFF0Cstrong_rules \u5FC5\u987B\u6765\u81EA\u805A\u5408\u7ED3\u679C strong_rules\uFF1Bcandidate_rules \u53EA\u80FD\u653E\u5165 recommended \u6216 optional\uFF0C\u4E0D\u5F97\u4F2A\u88C5\u6210\u5FC5\u987B\u89C4\u5219\u3002",
        "skill_json \u662F\u7A0B\u5E8F\u8C03\u7528\u7684\u6267\u7B14\u4EBA\u89C4\u5219 JSON\uFF0C\u8981\u80FD\u88AB\u540E\u7EED\u6587\u6863\u751F\u6210\u6A21\u5757\u8C03\u7528\uFF0C\u7528\u6765\u63A7\u5236\u6587\u79CD\u7ED3\u6784\u3001\u884C\u6587\u98CE\u683C\u3001\u683C\u5F0F\u89C4\u8303\u3001\u5E38\u7528\u8868\u8FBE\u548C\u5BA1\u7A3F\u6807\u51C6\u3002",
        "\u53EA\u8F93\u51FA JSON\uFF0C\u4E0D\u8981 Markdown\u3002",
        'JSON \u7ED3\u6784\uFF1A{\n  "markdown":"# \u6267\u7B14\u4EBA\u540D\u79F0\\n...",\n  "skill_json": {\n    "name":"...",\n    "handle":"...",\n    "version":"...",\n    "enabled": true,\n    "category":"...",\n    "description":"...",\n    "applicable_scope":"...",\n    "confidence":"low|medium|high",\n    "source_documents": [],\n    "user_input_fields": [],\n    "document_structure_template": [],\n    "style_rules": {"must": [], "recommended": [], "optional": []},\n    "format_rules": [],\n    "common_expression_library": [],\n    "scene_variations": [],\n    "variable_slots": [],\n    "forbidden": [],\n    "privacy_filters": [],\n    "case_specific_exclusions": [],\n    "generation_steps": [],\n    "self_checklist": [],\n    "review_standards": [],\n    "quality_controls": {"rule_confidence":"...", "conflict_resolution": [], "single_document_rule_policy":"..."},\n    "example_input": {},\n    "example_output": "..."\n  },\n  "quality_report": {"confidence":"...", "strong_rule_count":0, "candidate_rule_count":0, "conflicts":[], "excluded_case_specific_items":[], "privacy_filter_notes":[]},\n  "example_input": {}\n}',
        `\u6267\u7B14\u4EBA\u57FA\u672C\u4FE1\u606F\uFF1A${JSON.stringify(pickSkillMetadata(style), null, 2)}`,
        `\u805A\u5408\u7ED3\u679C\uFF1A
${JSON.stringify(aggregationData, null, 2)}`
      ].join("\n\n");
      const result = await callAiJsonWithRepair2(buildMessages(prompt), "\u6267\u7B14\u4EBA\u8349\u6848 JSON");
      return normalizeSkillDraftOutput(result, style, aggregationData);
    }
    async function optimizeSkillWithFeedback(style, draft, aggregationData) {
      const feedbacks = (style.feedbacks || []).map((feedback, index) => `${index + 1}. ${feedback.text}`).join("\n");
      const prompt = [
        "\u4F60\u662F\u591A\u6587\u6863\u6267\u7B14\u4EBA\u6784\u5EFA\u7CFB\u7EDF\u7684\u201C\u53CD\u9988\u4F18\u5316\u5668\u201D\u3002\u8BF7\u5728\u4E0D\u7834\u574F\u5F3A\u89C4\u5219\u8BC1\u636E\u94FE\u7684\u524D\u63D0\u4E0B\uFF0C\u6839\u636E\u7528\u6237\u53CD\u9988\u4F18\u5316\u6267\u7B14\u4EBA\u3002",
        "\u53CD\u9988\u53EF\u4EE5\u589E\u5F3A\u8868\u8FBE\u3001\u8865\u5145\u7981\u5FCC\u3001\u8C03\u6574\u6D4B\u8BD5\u6807\u51C6\uFF1B\u4F46\u4E0D\u80FD\u628A\u5355\u7BC7\u4E2A\u6848\u6216\u7528\u6237\u968F\u53E3\u63D0\u5230\u7684\u5177\u4F53\u4EBA\u540D\u3001\u65F6\u95F4\u3001\u5730\u70B9\u3001\u6D3B\u52A8\u540D\u79F0\u63D0\u5347\u4E3A\u901A\u7528\u89C4\u5219\u3002",
        "\u53EA\u8F93\u51FA\u4E0E generateSkillDraft \u76F8\u540C\u7ED3\u6784\u7684 JSON\u3002",
        `\u7528\u6237\u53CD\u9988\uFF1A
${feedbacks}`,
        `\u805A\u5408\u7ED3\u679C\uFF1A
${JSON.stringify(aggregationData, null, 2)}`,
        `\u5F53\u524D\u8349\u6848\uFF1A
${JSON.stringify(draft, null, 2)}`
      ].join("\n\n");
      const result = await callAiJsonWithRepair2(buildMessages(prompt), "\u53CD\u9988\u4F18\u5316\u6267\u7B14\u4EBA JSON");
      return normalizeSkillDraftOutput(result, style, aggregationData);
    }
    async function testSkillOnGeneration(style, skillJson, exampleInput = null) {
      const testInput = exampleInput && Object.keys(exampleInput).length > 0 ? exampleInput : {
        \u4E3B\u9898: `${style.name || "\u8BE5\u7C7B\u6587\u6863"}\u6D4B\u8BD5\u751F\u6210`,
        \u4F7F\u7528\u573A\u666F: "\u7EC4\u7EC7\u5185\u90E8\u6B63\u5F0F\u6587\u6863\u8D77\u8349",
        \u5173\u952E\u4E8B\u9879: "\u8BF7\u4F7F\u7528\u5360\u4F4D\u7B26\u8865\u8DB3\u672A\u63D0\u4F9B\u7684\u65F6\u95F4\u3001\u5730\u70B9\u3001\u5BF9\u8C61\u548C\u843D\u6B3E\u4FE1\u606F"
      };
      const prompt = [
        "\u4F60\u662F\u591A\u6587\u6863\u6267\u7B14\u4EBA\u6784\u5EFA\u7CFB\u7EDF\u7684\u201C\u751F\u6210\u6D4B\u8BD5\u4E0E\u89C4\u5219\u547D\u4E2D\u68C0\u67E5\u5668\u201D\u3002\u8BF7\u4F7F\u7528\u6267\u7B14\u4EBA\u89C4\u5219 JSON \u751F\u6210\u4E00\u7BC7\u6D4B\u8BD5\u6587\u6863\uFF0C\u5E76\u68C0\u67E5\u89C4\u5219\u547D\u4E2D\u60C5\u51B5\u3002",
        "\u68C0\u67E5\u91CD\u70B9\uFF1A\u7ED3\u6784\u89C4\u5219\u3001\u6587\u98CE\u89C4\u5219\u3001\u683C\u5F0F\u89C4\u5219\u3001\u5E38\u7528\u8868\u8FBE\u3001\u7981\u5FCC\u4E8B\u9879\u3001\u9690\u79C1\u8FC7\u6EE4\u3001\u662F\u5426\u8BEF\u7528\u4E2A\u6848\u4FE1\u606F\u3002",
        "\u53EA\u8F93\u51FA JSON\uFF0C\u4E0D\u8981 Markdown\u3002",
        'JSON \u7ED3\u6784\uFF1A{\n  "test_document_markdown":"...",\n  "check_report": {\n    "passed": true,\n    "score": 0,\n    "rule_hits": [],\n    "rule_misses": [],\n    "privacy_risks": [],\n    "case_specific_leaks": [],\n    "format_issues": [],\n    "suggested_fixes": []\n  }\n}',
        `\u6267\u7B14\u4EBA\u89C4\u5219 JSON\uFF1A
${JSON.stringify(skillJson, null, 2)}`,
        `\u6D4B\u8BD5\u8F93\u5165\uFF1A
${JSON.stringify(testInput, null, 2)}`
      ].join("\n\n");
      const result = await callAiJsonWithRepair2(buildMessages(prompt), "\u6267\u7B14\u4EBA\u751F\u6210\u6D4B\u8BD5 JSON");
      return {
        document: result.test_document_markdown || result.document || "",
        report: result.check_report || result.report || {}
      };
    }
    function createSkillVersion(style, outputs) {
      const versionNumber = (style.versions || []).length + 1;
      return {
        id: createId(),
        version: versionNumber,
        createdAt: now(),
        sourceExamples: (style.examples || []).map((example) => ({
          id: example.id || createId(),
          name: example.name,
          length: example.text?.length || 0
        })),
        analyses: outputs.analyses || [],
        analysis: outputs.analysis || "",
        aggregationData: outputs.aggregationData || null,
        aggregation: outputs.aggregation || "",
        summary: outputs.markdown || "",
        skillJson: outputs.skillJson || "",
        qualityReport: outputs.qualityReport || null,
        testDoc: outputs.testDoc || "",
        testReport: outputs.testReport || ""
      };
    }
    function buildMessages(prompt) {
      return [
        { role: "system", content: getSystemPrompt() || DEFAULT_SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ];
    }
    return {
      buildSkillWithAiChain,
      analyzeSingleDocument,
      aggregateDocumentAnalyses,
      generateSkillDraft,
      optimizeSkillWithFeedback,
      testSkillOnGeneration,
      createSkillVersion,
      normalizeSkillQualityReport
    };
  }

  // src/modules/skills/skillManager.js
  function createSkillManager(deps) {
    const {
      state: state2,
      ui: ui2,
      els: els2,
      persist: persist2,
      eventBus: eventBus2,
      toast: toast2,
      getSkillLocation: getSkillLocation2
    } = deps;
    function createEmptyStyle2() {
      return {
        id: null,
        name: "",
        handle: "",
        category: "\u81EA\u5B9A\u4E49",
        description: "",
        enabled: true,
        analysis: "",
        aggregation: "",
        summary: "",
        skillJson: "",
        examples: [],
        analyses: [],
        aggregationData: null,
        qualityReport: null,
        versions: [],
        feedbacks: [],
        lastTest: null,
        createdAt: now(),
        updatedAt: now()
      };
    }
    function isSkillEnabled2(skill) {
      return skill?.enabled !== false;
    }
    function normalizeSkill2(style) {
      const name = String(style.name || "\u672A\u547D\u540D\u6267\u7B14\u4EBA").trim();
      return {
        ...style,
        name,
        handle: normalizeHandle(style.handle || name),
        category: style.category || "\u81EA\u5B9A\u4E49",
        description: style.description || "",
        enabled: style.enabled !== false,
        analysis: style.analysis || "",
        aggregation: style.aggregation || "",
        summary: style.summary || "",
        skillJson: style.skillJson || synthesizeSkillJson(style),
        examples: Array.isArray(style.examples) ? style.examples : [],
        analyses: Array.isArray(style.analyses) ? style.analyses : [],
        aggregationData: style.aggregationData || null,
        qualityReport: style.qualityReport || null,
        versions: Array.isArray(style.versions) ? style.versions.map((version, index) => ({
          id: version.id || createId(),
          version: Number(version.version || index + 1),
          createdAt: version.createdAt || now(),
          sourceExamples: Array.isArray(version.sourceExamples) ? version.sourceExamples : [],
          analysis: version.analysis || "",
          aggregation: version.aggregation || "",
          aggregationData: version.aggregationData || null,
          summary: version.summary || "",
          skillJson: version.skillJson || "",
          qualityReport: version.qualityReport || null,
          testDoc: version.testDoc || "",
          testReport: version.testReport || ""
        })) : [],
        feedbacks: Array.isArray(style.feedbacks) ? style.feedbacks.map((feedback) => ({
          id: feedback.id || createId(),
          text: feedback.text || "",
          createdAt: feedback.createdAt || now()
        })) : [],
        lastTest: style.lastTest || null
      };
    }
    function synthesizeSkillJson(style) {
      const name = String(style.name || "\u672A\u547D\u540D\u6267\u7B14\u4EBA").trim();
      const handle = normalizeHandle(style.handle || name);
      return JSON.stringify(
        {
          name,
          handle,
          enabled: style.enabled !== false,
          category: style.category || "\u81EA\u5B9A\u4E49",
          description: style.description || "",
          applicable_scope: "",
          confidence: "low",
          source_documents: [],
          required_user_inputs: [],
          document_structure_template: [],
          style_rules: { must: [], recommended: [], optional: [] },
          reusable_expressions: [],
          variable_slots: [],
          scene_variations: [],
          forbidden: [],
          generation_steps: [],
          self_checklist: [],
          quality_controls: {
            promote_to_strong_rule: "\u4EC5\u5F53\u591A\u7BC7\u6837\u672C\u6587\u6863\u5171\u540C\u9A8C\u8BC1\u65F6\u624D\u63D0\u5347\u4E3A\u5F3A\u89C4\u5219",
            exclude_case_specific_info: true,
            privacy_filter: true
          },
          example_input: "",
          example_output: ""
        },
        null,
        2
      );
    }
    function normalizeSkillJsonText2(value, style) {
      const fallback = synthesizeSkillJson(style);
      const raw = String(value || "").trim();
      if (!raw) return fallback;
      try {
        const parsed = JSON.parse(extractJsonObject(raw) || raw);
        const normalized = {
          ...parsed,
          name: parsed.name || style.name || "\u672A\u547D\u540D\u6267\u7B14\u4EBA",
          handle: normalizeHandle(parsed.handle || style.handle || style.name),
          category: parsed.category || style.category || "\u81EA\u5B9A\u4E49",
          description: parsed.description || style.description || ""
        };
        return JSON.stringify(normalized, null, 2);
      } catch {
        return raw;
      }
    }
    function parseSkillJsonObject2(value, style) {
      const raw = normalizeSkillJsonText2(value, style);
      try {
        return JSON.parse(extractJsonObject(raw) || raw);
      } catch {
        return JSON.parse(synthesizeSkillJson(style));
      }
    }
    function syncEditingStyleFromInputs2() {
      const draft = ui2.editingStyle || createEmptyStyle2();
      draft.name = els2.styleNameInput.value.trim() || draft.name || "";
      draft.handle = normalizeHandle(els2.skillHandleInput.value || draft.handle || draft.name);
      draft.category = els2.skillCategorySelect.value || draft.category || "\u81EA\u5B9A\u4E49";
      draft.description = els2.skillDescriptionInput.value.trim();
      draft.enabled = els2.skillEnabledInput.checked;
      draft.analysis = els2.skillAnalysisInput.value.trim();
      draft.aggregation = els2.skillAggregationInput.value.trim();
      draft.summary = els2.styleSummaryInput.value.trim();
      draft.skillJson = els2.skillJsonInput.value.trim() || draft.skillJson || "";
      ui2.editingStyle = draft;
      return draft;
    }
    function saveStyle2() {
      const draft = ui2.editingStyle;
      const name = els2.styleNameInput.value.trim();
      if (!name) {
        toast2("\u8BF7\u8F93\u5165\u6267\u7B14\u4EBA\u540D\u79F0", "warn");
        return null;
      }
      draft.name = name;
      draft.handle = normalizeHandle(els2.skillHandleInput.value || name);
      if (!draft.handle) {
        toast2("\u8BF7\u8F93\u5165 @ \u8C03\u7528\u540D", "warn");
        return null;
      }
      draft.category = els2.skillCategorySelect.value || "\u81EA\u5B9A\u4E49";
      draft.description = els2.skillDescriptionInput.value.trim();
      draft.enabled = els2.skillEnabledInput.checked;
      draft.analysis = els2.skillAnalysisInput.value.trim();
      draft.aggregation = els2.skillAggregationInput.value.trim();
      draft.summary = els2.styleSummaryInput.value.trim();
      draft.skillJson = normalizeSkillJsonText2(els2.skillJsonInput.value, draft);
      draft.updatedAt = now();
      const existingIndex = state2.styles.findIndex((style) => style.id === draft.id);
      const duplicate = state2.styles.find((style) => style.id !== draft.id && style.handle === draft.handle);
      if (duplicate) {
        toast2(`@${draft.handle} \u5DF2\u88AB\u201C${duplicate.name}\u201D\u4F7F\u7528`, "warn");
        return null;
      }
      if (existingIndex >= 0) {
        state2.styles[existingIndex] = normalizeSkill2(clone(draft));
      } else {
        draft.id = createId();
        draft.createdAt = now();
        state2.styles.push(normalizeSkill2(clone(draft)));
      }
      ui2.editingStyle = clone(draft);
      persist2();
      eventBus2.emit(EVENTS.RENDER_STYLE_SELECT);
      eventBus2.emit(EVENTS.RENDER_STYLE_LIST);
      toast2(`\u5DF2\u4FDD\u5B58 @${draft.handle} \u5230\uFF1A${getSkillLocation2(draft)}`);
      return draft;
    }
    function commitSkillToState2(draft) {
      const name = String(draft.name || "").trim();
      if (!name) throw new Error("\u8BF7\u8F93\u5165\u6267\u7B14\u4EBA\u540D\u79F0");
      draft.name = name;
      draft.handle = normalizeHandle(draft.handle || name);
      if (!draft.handle) throw new Error("\u8BF7\u8F93\u5165 @ \u8C03\u7528\u540D");
      draft.category = draft.category || "\u81EA\u5B9A\u4E49";
      draft.enabled = draft.enabled !== false;
      draft.updatedAt = now();
      if (!draft.id) {
        draft.id = createId();
        draft.createdAt = draft.createdAt || now();
      }
      const existingIndex = state2.styles.findIndex((style) => style.id === draft.id);
      const duplicate = state2.styles.find((style) => style.id !== draft.id && style.handle === draft.handle);
      if (duplicate) throw new Error(`@${draft.handle} \u5DF2\u88AB\u201C${duplicate.name}\u201D\u4F7F\u7528`);
      const normalized = normalizeSkill2(clone(draft));
      if (existingIndex >= 0) {
        state2.styles[existingIndex] = normalized;
      } else {
        state2.styles.push(normalized);
      }
      ui2.editingStyle = clone(normalized);
      persist2();
      eventBus2.emit(EVENTS.RENDER_STYLE_SELECT);
      eventBus2.emit(EVENTS.RENDER_STYLE_LIST);
      return normalized;
    }
    function deleteStyle2(confirmDelete = (message) => window.confirm(message)) {
      const draft = ui2.editingStyle;
      if (!draft?.id || !state2.styles.some((style) => style.id === draft.id)) {
        ui2.editingStyle = createEmptyStyle2();
        eventBus2.emit(EVENTS.RENDER_STYLE_EDITOR);
        return false;
      }
      const ok = confirmDelete(`\u5220\u9664\u6267\u7B14\u4EBA\u201C${draft.name}\u201D\uFF1F`);
      if (!ok) return false;
      state2.styles = state2.styles.filter((style) => style.id !== draft.id);
      state2.docs.forEach((doc) => {
        if (doc.styleId === draft.id) doc.styleId = "";
      });
      ui2.editingStyle = clone(state2.styles[0] || createEmptyStyle2());
      persist2();
      eventBus2.emit(EVENTS.RENDER_ALL);
      toast2(`\u5DF2\u5220\u9664\u6267\u7B14\u4EBA\uFF1A${getSkillLocation2(draft)}`, "warn");
      return true;
    }
    function resolveInvokedSkills2(text, fallbackSkillId) {
      const mentioned = Array.from(String(text || "").matchAll(/@([\u4e00-\u9fa5A-Za-z0-9_-]+)/g)).map(
        (match) => normalizeHandle(match[1])
      );
      const skills = [];
      mentioned.forEach((handle) => {
        const found = state2.styles.find((skill) => skill.handle === handle || skill.name === handle);
        if (found && isSkillEnabled2(found) && !skills.some((skill) => skill.id === found.id)) {
          skills.push(found);
        }
      });
      if (skills.length === 0 && fallbackSkillId) {
        const fallback = state2.styles.find((skill) => skill.id === fallbackSkillId);
        if (fallback && isSkillEnabled2(fallback)) skills.push(fallback);
      }
      return skills;
    }
    function buildSkillPromptForDocumentGeneration2(skills) {
      const enabledSkills = (skills || []).filter(isSkillEnabled2);
      if (enabledSkills.length === 0) return "";
      return [
        "\u88AB\u8C03\u7528\u7684\u6267\u7B14\u4EBA\uFF08\u4EC5\u4F7F\u7528\u5DF2\u542F\u7528\u6267\u7B14\u4EBA\uFF09\uFF1A",
        "\u6267\u884C\u539F\u5219\uFF1A\u5FC5\u987B\u4F18\u5148\u9075\u5B88 style_rules.must\uFF1Brecommended \u4EC5\u5728\u7528\u6237\u4EFB\u52A1\u5339\u914D\u65F6\u4F7F\u7528\uFF1Boptional \u4E0D\u5F97\u538B\u8FC7\u7528\u6237\u4E8B\u5B9E\u3002\u7981\u6B62\u590D\u7528 case_specific_exclusions\u3001privacy_filters \u548C forbidden \u4E2D\u7684\u5185\u5BB9\u3002\u4E8B\u5B9E\u7F3A\u5931\u65F6\u4F7F\u7528\u53EF\u66FF\u6362\u5360\u4F4D\u7B26\uFF0C\u4E0D\u80FD\u7F16\u9020\u3002",
        ...enabledSkills.map((skill, index) => {
          const skillJson = parseSkillJsonObject2(skill.skillJson, skill);
          const strongRules = coerceArray(skillJson.style_rules?.must);
          const recommendedRules = coerceArray(skillJson.style_rules?.recommended);
          const forbidden = coerceArray(skillJson.forbidden);
          const payload = {
            ...skillJson,
            style_rules: {
              must: strongRules,
              recommended: recommendedRules,
              optional: coerceArray(skillJson.style_rules?.optional)
            },
            forbidden,
            quality_controls: {
              ...skillJson.quality_controls || {},
              single_document_rule_policy: "\u5355\u7BC7\u6837\u672C\u53EA\u4F5C\u4E3A\u5019\u9009\u89C4\u5219\uFF1B\u751F\u6210\u65F6\u4E0D\u5F97\u628A\u4E2A\u6848\u4FE1\u606F\u5F53\u6210\u901A\u7528\u89C4\u5219",
              privacy_filter: true
            }
          };
          return [
            `${index + 1}. @${skill.handle} \xB7 ${skill.name}`,
            skill.category ? `\u5206\u7C7B\uFF1A${skill.category}` : "",
            skill.description ? `\u80FD\u529B\uFF1A${skill.description}` : "",
            `\u89C4\u5219\u7F6E\u4FE1\u5EA6\uFF1A${skillJson.confidence || skill.qualityReport?.confidence || "low"}`,
            `\u7A0B\u5E8F\u8C03\u7528\u89C4\u5219 JSON\uFF1A
${JSON.stringify(payload, null, 2)}`
          ].filter(Boolean).join("\n");
        })
      ].join("\n\n");
    }
    return {
      createEmptyStyle: createEmptyStyle2,
      isSkillEnabled: isSkillEnabled2,
      normalizeSkill: normalizeSkill2,
      synthesizeSkillJson,
      normalizeSkillJsonText: normalizeSkillJsonText2,
      parseSkillJsonObject: parseSkillJsonObject2,
      syncEditingStyleFromInputs: syncEditingStyleFromInputs2,
      saveStyle: saveStyle2,
      commitSkillToState: commitSkillToState2,
      deleteStyle: deleteStyle2,
      resolveInvokedSkills: resolveInvokedSkills2,
      buildSkillPromptForDocumentGeneration: buildSkillPromptForDocumentGeneration2
    };
  }

  // src/modules/skills/skillRenderer.js
  function createSkillRenderer(deps) {
    const {
      state: state2,
      ui: ui2,
      els: els2,
      createEmptyStyle: createEmptyStyle2,
      isSkillEnabled: isSkillEnabled2,
      commitSkillToState: commitSkillToState2,
      getSkillLocation: getSkillLocation2,
      toast: toast2
    } = deps;
    function renderStyleSelect2() {
      const enabledStyles = state2.styles.filter(isSkillEnabled2);
      els2.styleSelect.innerHTML = [
        '<option value="">\u65E0\u9ED8\u8BA4\u6267\u7B14\u4EBA</option>',
        ...enabledStyles.map((style) => `<option value="${style.id}">@${escapeHtml(style.handle)} \xB7 ${escapeHtml(style.name)}</option>`)
      ].join("");
      els2.editorSkillSelect.innerHTML = enabledStyles.map((style) => `<option value="${style.id}">@${escapeHtml(style.handle)}</option>`).join("");
    }
    function renderStyleEditor2() {
      if (!ui2.editingStyle) {
        ui2.editingStyle = clone(state2.styles[0] || createEmptyStyle2());
      }
      els2.styleNameInput.value = ui2.editingStyle.name || "";
      els2.skillHandleInput.value = ui2.editingStyle.handle ? `@${ui2.editingStyle.handle}` : "";
      els2.skillCategorySelect.value = ui2.editingStyle.category || "\u81EA\u5B9A\u4E49";
      els2.skillDescriptionInput.value = ui2.editingStyle.description || "";
      els2.skillEnabledInput.checked = ui2.editingStyle.enabled !== false;
      els2.skillAnalysisInput.value = ui2.editingStyle.analysis || "";
      els2.skillAggregationInput.value = ui2.editingStyle.aggregation || "";
      els2.styleSummaryInput.value = ui2.editingStyle.summary || "";
      els2.skillJsonInput.value = ui2.editingStyle.skillJson || "";
      renderSkillQualityReport2();
      renderStyleExamples2();
      renderSkillVersions();
      renderSkillTest2();
    }
    function renderStyleExamples2() {
      const examples = ui2.editingStyle.examples || [];
      if (examples.length === 0) {
        els2.styleExampleList.innerHTML = '<div class="empty-state">\u5C1A\u672A\u6DFB\u52A0\u793A\u8303\u6587\u4EF6</div>';
        return;
      }
      els2.styleExampleList.innerHTML = examples.map(
        (example, index) => `<div class="example-item">
          <div class="example-title">
            <span>${escapeHtml(example.name)}</span>
            <button class="tiny-button danger-text" type="button" title="\u79FB\u9664" data-remove-example="${index}"><i data-lucide="x"></i></button>
          </div>
          <div class="example-size">${example.text.length} \u5B57\u7B26</div>
          <details class="example-preview">
            <summary>\u9884\u89C8\u6587\u672C</summary>
            <pre>${escapeHtml(example.text.slice(0, 2e3))}${example.text.length > 2e3 ? "\n..." : ""}</pre>
          </details>
        </div>`
      ).join("");
      els2.styleExampleList.querySelectorAll("[data-remove-example]").forEach((button) => {
        button.addEventListener("click", () => {
          ui2.editingStyle.examples.splice(Number(button.dataset.removeExample), 1);
          renderStyleExamples2();
        });
      });
      if (window.lucide) window.lucide.createIcons();
    }
    function renderSkillQualityReport2() {
      if (!els2.skillQualityReport || !ui2.editingStyle) return;
      const style = ui2.editingStyle;
      const report = style.qualityReport || {};
      const aggregationData = style.aggregationData || {};
      const lines = [
        `\u542F\u7528\u72B6\u6001\uFF1A${style.enabled === false ? "\u672A\u542F\u7528" : "\u5DF2\u542F\u7528"}`,
        `\u89C4\u5219\u7F6E\u4FE1\u5EA6\uFF1A${report.confidence || aggregationData.overall_confidence || "\u672A\u8BC4\u4F30"}`,
        `\u5F3A\u89C4\u5219\uFF1A${(aggregationData.strong_rules || report.strong_rules || []).length || 0} \u6761`,
        `\u5019\u9009\u89C4\u5219\uFF1A${(aggregationData.candidate_rules || report.candidate_rules || []).length || 0} \u6761`,
        `\u51B2\u7A81\u63D0\u793A\uFF1A${(aggregationData.conflicts || report.conflicts || []).length || 0} \u6761`,
        `\u4E2A\u6848\u6392\u9664\uFF1A${(aggregationData.case_specific_exclusions || report.case_specific_exclusions || []).length || 0} \u6761`,
        `\u9690\u79C1\u8FC7\u6EE4\uFF1A${(aggregationData.privacy_findings || report.privacy_findings || []).length || 0} \u6761`
      ];
      if (style.lastTest?.report) {
        lines.push("", "\u6700\u8FD1\u6D4B\u8BD5\uFF1A", formatPossiblyJson(style.lastTest.report).slice(0, 1200));
      }
      els2.skillQualityReport.textContent = lines.join("\n");
    }
    function renderSkillVersions() {
      if (!els2.skillVersionList || !ui2.editingStyle) return;
      const versions = ui2.editingStyle.versions || [];
      if (versions.length === 0) {
        els2.skillVersionList.innerHTML = '<div class="empty-state">\u6682\u65E0\u7248\u672C\u8BB0\u5F55</div>';
        els2.skillVersionDiff.textContent = "";
        return;
      }
      els2.skillVersionList.innerHTML = versions.map((version, index) => {
        const sourceCount = version.sourceExamples?.length || 0;
        const sourceLabel = sourceCount ? `${sourceCount} \u4EFD\u793A\u8303` : "\u672A\u8BB0\u5F55\u793A\u8303";
        return `<div class="version-item" data-version-item="${index}">
          <div>
            <strong>v${version.version || index + 1}</strong>
            <span>${escapeHtml(formatLocalDate(version.createdAt))}</span>
            <small>${escapeHtml(sourceLabel)}</small>
          </div>
          <div class="version-actions">
            <button class="tiny-button" type="button" data-view-version="${index}">\u67E5\u770B</button>
            <button class="tiny-button" type="button" data-restore-version="${index}">\u56DE\u9000</button>
          </div>
        </div>`;
      }).join("");
      els2.skillVersionList.querySelectorAll("[data-view-version]").forEach((button) => {
        button.addEventListener("click", () => showSkillVersion(Number(button.dataset.viewVersion)));
      });
      els2.skillVersionList.querySelectorAll("[data-restore-version]").forEach((button) => {
        button.addEventListener("click", () => restoreSkillVersion(Number(button.dataset.restoreVersion)));
      });
      showSkillVersion(versions.length - 1);
    }
    function showSkillVersion(index) {
      const versions = ui2.editingStyle?.versions || [];
      const version = versions[index];
      if (!version) return;
      document.querySelectorAll("[data-version-item]").forEach((item) => {
        item.classList.toggle("active", Number(item.dataset.versionItem) === index);
      });
      const previous = versions[index - 1] || null;
      const sourceNames = (version.sourceExamples || []).map((item) => item.name).filter(Boolean);
      const lines = [
        `\u7248\u672C\uFF1Av${version.version || index + 1}`,
        `\u751F\u6210\u65F6\u95F4\uFF1A${formatLocalDate(version.createdAt)}`,
        `\u8BAD\u7EC3\u6587\u672C\uFF1A${sourceNames.length ? sourceNames.join("\u3001") : "\u672A\u8BB0\u5F55"}`,
        "",
        `\u5355\u7BC7\u89E3\u6790\u5B57\u6570\uFF1A${(version.analysis || "").length}`,
        `\u591A\u7BC7\u805A\u5408\u5B57\u6570\uFF1A${(version.aggregation || "").length}`,
        `\u8BF4\u660E.md\u5B57\u6570\uFF1A${(version.summary || "").length}`,
        `\u89C4\u5219 JSON \u5B57\u6570\uFF1A${(version.skillJson || "").length}`
      ];
      if (previous) {
        lines.push(
          "",
          "\u4E0E\u4E0A\u4E00\u7248\u5BF9\u6BD4\uFF1A",
          `\u8BF4\u660E.md\uFF1A${describeLengthChange((version.summary || "").length - (previous.summary || "").length)}`,
          `\u89C4\u5219 JSON\uFF1A${describeLengthChange((version.skillJson || "").length - (previous.skillJson || "").length)}`,
          `\u8BAD\u7EC3\u6587\u672C\uFF1A${(version.sourceExamples || []).length} / ${(previous.sourceExamples || []).length} \u4EFD`
        );
      }
      if (version.aggregation) {
        lines.push("", "\u805A\u5408\u6458\u8981\uFF1A", version.aggregation.slice(0, 1200));
      }
      els2.skillVersionDiff.textContent = lines.join("\n");
    }
    function restoreSkillVersion(index, confirmRestore = (message) => window.confirm(message)) {
      const version = ui2.editingStyle?.versions?.[index];
      if (!version) return false;
      const ok = confirmRestore(`\u56DE\u9000\u5230 v${version.version || index + 1}\uFF1F`);
      if (!ok) return false;
      ui2.editingStyle.analyses = version.analyses || ui2.editingStyle.analyses || [];
      ui2.editingStyle.analysis = version.analysis || "";
      ui2.editingStyle.aggregationData = version.aggregationData || ui2.editingStyle.aggregationData || null;
      ui2.editingStyle.aggregation = version.aggregation || "";
      ui2.editingStyle.summary = version.summary || "";
      ui2.editingStyle.skillJson = version.skillJson || ui2.editingStyle.skillJson;
      ui2.editingStyle.qualityReport = version.qualityReport || ui2.editingStyle.qualityReport || null;
      ui2.editingStyle.lastTest = {
        id: createId(),
        createdAt: now(),
        prompt: "\u7248\u672C\u56DE\u9000\u643A\u5E26\u7684\u6D4B\u8BD5\u7ED3\u679C",
        result: version.testDoc || "",
        report: version.testReport || ""
      };
      ui2.editingStyle.updatedAt = now();
      commitSkillToState2(ui2.editingStyle);
      renderStyleEditor2();
      switchSkillDetailTab2("versions");
      showSkillVersion(index);
      toast2(`\u5DF2\u56DE\u9000\u5230 v${version.version || index + 1}\uFF0C\u5F53\u524D\u6267\u7B14\u4EBA\u5DF2\u4FDD\u5B58\u5230\uFF1A${getSkillLocation2(ui2.editingStyle)}`);
      return true;
    }
    function renderSkillTest2() {
      if (!els2.skillTestPrompt || !ui2.editingStyle) return;
      const lastTest = ui2.editingStyle.lastTest || {};
      els2.skillTestPrompt.value = lastTest.prompt || "";
      els2.skillTestResult.value = lastTest.result || "";
      els2.skillTestReport.value = formatPossiblyJson(lastTest.report || "");
      els2.skillFeedbackInput.value = "";
    }
    function renderStyleList2() {
      if (state2.styles.length === 0) {
        els2.styleList.innerHTML = '<div class="empty-state">\u6682\u65E0\u6267\u7B14\u4EBA</div>';
        return;
      }
      els2.styleList.innerHTML = state2.styles.map(
        (style) => `<div class="style-item ${ui2.editingStyle?.id === style.id ? "active" : ""}">
          <button class="style-select-button" type="button" data-style-id="${style.id}">
            <span class="style-main">
              <i data-lucide="book-open-text"></i>
              <span>${escapeHtml(style.name)}</span>
            </span>
            <span class="skill-handle">@${escapeHtml(style.handle)}</span>
            <span>${escapeHtml(style.category || "\u81EA\u5B9A\u4E49")} \xB7 ${isSkillEnabled2(style) ? "\u5DF2\u542F\u7528" : "\u672A\u542F\u7528"}</span>
          </button>
          <button class="tiny-button" type="button" title="\u67E5\u770B\u8BE6\u60C5" data-skill-detail="${style.id}">
            <i data-lucide="panel-right-open"></i>
          </button>
        </div>`
      ).join("");
      els2.styleList.querySelectorAll("[data-style-id]").forEach((button) => {
        button.addEventListener("click", () => {
          ui2.editingStyle = clone(state2.styles.find((style) => style.id === button.dataset.styleId));
          renderStyleEditor2();
          renderStyleList2();
        });
      });
      els2.styleList.querySelectorAll("[data-skill-detail]").forEach((button) => {
        button.addEventListener("click", () => openSkillDetail(button.dataset.skillDetail));
      });
      if (window.lucide) window.lucide.createIcons();
    }
    function openSkillDetail(skillId) {
      const skill = state2.styles.find((item) => item.id === skillId);
      if (!skill) return;
      ui2.editingStyle = clone(skill);
      renderStyleEditor2();
      renderStyleList2();
      els2.skillDetailTitle.textContent = skill.name || "\u6267\u7B14\u4EBA\u8BE6\u60C5";
      els2.skillDetailMeta.textContent = `@${skill.handle || normalizeHandle(skill.name)} \xB7 ${skill.examples?.length || 0} \u4EFD\u8BAD\u7EC3\u6587\u672C \xB7 ${skill.versions?.length || 0} \u4E2A\u7248\u672C`;
      els2.skillDetailMenu.hidden = false;
      switchSkillDetailTab2("training");
      if (window.lucide) window.lucide.createIcons();
    }
    function hideSkillDetailMenu2() {
      els2.skillDetailMenu.hidden = true;
    }
    function switchSkillDetailTab2(tabName) {
      document.querySelectorAll(".detail-tab").forEach((button) => {
        button.classList.toggle("active", button.dataset.detailTab === tabName);
      });
      document.querySelectorAll(".detail-panel").forEach((panel) => {
        panel.classList.toggle("active", panel.id === `${tabName}DetailPanel`);
      });
    }
    return {
      renderStyleSelect: renderStyleSelect2,
      renderStyleEditor: renderStyleEditor2,
      renderStyleExamples: renderStyleExamples2,
      renderSkillQualityReport: renderSkillQualityReport2,
      renderSkillVersions,
      showSkillVersion,
      restoreSkillVersion,
      renderSkillTest: renderSkillTest2,
      renderStyleList: renderStyleList2,
      openSkillDetail,
      hideSkillDetailMenu: hideSkillDetailMenu2,
      switchSkillDetailTab: switchSkillDetailTab2
    };
  }

  // src/ui/components/progress.js
  function createProgressController({ getCurrent, setCurrent }) {
    function closeProgress(progressBar) {
      if (!progressBar) return;
      progressBar.remove();
      if (getCurrent() === progressBar) setCurrent(null);
    }
    function updateProgress(progressBar, message, progress = 0) {
      if (!progressBar) return;
      const safeProgress = Math.max(0, Math.min(100, Number(progress) || 0));
      progressBar.querySelector(".progress-message").textContent = message || "\u5904\u7406\u4E2D";
      progressBar.querySelector(".progress-percent").textContent = `${Math.round(safeProgress)}%`;
      progressBar.querySelector(".progress-fill").style.width = `${safeProgress}%`;
    }
    function showProgress(message, progress = 0) {
      closeProgress(getCurrent());
      const progressBar = document.createElement("div");
      progressBar.className = "progress-bar";
      progressBar.setAttribute("role", "status");
      progressBar.setAttribute("aria-live", "polite");
      progressBar.innerHTML = `
      <div class="progress-row">
        <div class="progress-message"></div>
        <div class="progress-percent"></div>
      </div>
      <div class="progress-track">
        <div class="progress-fill"></div>
      </div>
    `;
      document.body.appendChild(progressBar);
      setCurrent(progressBar);
      updateProgress(progressBar, message, progress);
      return progressBar;
    }
    async function withProgress2(message, task, initialProgress = 8) {
      const progress = showProgress(message, initialProgress);
      try {
        return await task({
          update: (nextMessage, nextProgress) => updateProgress(progress, nextMessage, nextProgress)
        });
      } finally {
        updateProgress(progress, "\u5B8C\u6210\u6536\u5C3E", 100);
        window.setTimeout(() => closeProgress(progress), 250);
      }
    }
    return {
      closeProgress,
      showProgress,
      updateProgress,
      withProgress: withProgress2
    };
  }

  // src/ui/components/toast.js
  function showToast(container, message, tone = "info") {
    if (!container) return;
    const item = document.createElement("div");
    const normalizedTone = tone === "error" ? "error" : tone === "warn" ? "warn" : "info";
    item.className = `toast ${normalizedTone}`;
    item.setAttribute("role", normalizedTone === "error" ? "alert" : "status");
    item.innerHTML = `
    <span class="toast-dot" aria-hidden="true"></span>
    <span class="toast-message"></span>
    <button class="toast-close" type="button" aria-label="\u5173\u95ED\u901A\u77E5">
      <i data-lucide="x"></i>
    </button>
  `;
    item.querySelector(".toast-message").textContent = message;
    item.querySelector(".toast-close").addEventListener("click", () => item.remove());
    container.appendChild(item);
    if (window.lucide) window.lucide.createIcons();
    window.setTimeout(() => {
      item.classList.add("leaving");
      window.setTimeout(() => item.remove(), 180);
    }, 3600);
  }

  // src/ui/theme.js
  var THEME_STORAGE_KEY = "school-doc-manager:theme";
  function initThemeToggle(button, root = document.documentElement) {
    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
    const getSystemTheme = () => mediaQuery?.matches ? "dark" : "light";
    const setTheme = (theme, persist2 = false) => {
      root.dataset.theme = theme;
      root.style.colorScheme = theme;
      if (persist2) {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
      }
      if (button) {
        button.setAttribute("aria-label", theme === "dark" ? "\u5207\u6362\u5230\u6D45\u8272\u6A21\u5F0F" : "\u5207\u6362\u5230\u6DF1\u8272\u6A21\u5F0F");
        button.title = theme === "dark" ? "\u5207\u6362\u5230\u6D45\u8272\u6A21\u5F0F" : "\u5207\u6362\u5230\u6DF1\u8272\u6A21\u5F0F";
      }
    };
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    setTheme(savedTheme || root.dataset.theme || getSystemTheme());
    button?.addEventListener("click", () => {
      const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
      root.classList.add("theme-transitioning");
      setTheme(nextTheme, true);
      window.setTimeout(() => root.classList.remove("theme-transitioning"), 300);
    });
    mediaQuery?.addEventListener("change", (event) => {
      if (!localStorage.getItem(THEME_STORAGE_KEY)) {
        setTheme(event.matches ? "dark" : "light");
      }
    });
  }

  // app.js
  var state = {};
  var ui = {
    selectedFolderId: "all",
    selectedDocId: null,
    editingStyle: null,
    mentionTarget: null,
    mentionRange: null,
    saveTimer: null,
    searchTimer: null,
    persistPromise: Promise.resolve(),
    progressElement: null,
    generatedDraft: ""
  };
  var els = {};
  var aiClient = createAiClient({
    getSettings: () => state.settings || {},
    notify: (message, tone) => toast(message, tone)
  });
  var {
    callAiWithRetry,
    callAiJsonWithRepair,
    friendlyAiErrorMessage: friendlyAiErrorMessage2
  } = aiClient;
  var progressController = createProgressController({
    getCurrent: () => ui.progressElement,
    setCurrent: (element) => {
      ui.progressElement = element;
    }
  });
  var folderManager = createFolderManager({
    state,
    ui,
    els,
    persist,
    eventBus,
    getFolderLocation,
    getDocumentLocation,
    toast
  });
  var folderRenderer = createFolderRenderer({
    state,
    ui,
    els,
    onSelectFolder: (folderId) => {
      ui.selectedFolderId = folderId;
      eventBus.emit(EVENTS.RENDER_FOLDERS);
      eventBus.emit(EVENTS.RENDER_DOC_LIST);
    },
    onRenameFolder: renameFolder,
    onSyncFolder: syncRealFolder,
    onDeleteFolder: deleteFolder
  });
  var skillManager = createSkillManager({
    state,
    ui,
    els,
    persist,
    eventBus,
    toast,
    getSkillLocation
  });
  var skillBuilder = createSkillBuilder({
    callAiJsonWithRepair,
    getSystemPrompt: () => state.settings?.systemPrompt || DEFAULT_SYSTEM_PROMPT,
    normalizeSkillJsonText: (value, style) => skillManager.normalizeSkillJsonText(value, style)
  });
  var skillRenderer = createSkillRenderer({
    state,
    ui,
    els,
    createEmptyStyle,
    isSkillEnabled,
    commitSkillToState,
    getSkillLocation,
    toast
  });
  var documentRenderer = createDocumentRenderer({
    state,
    ui,
    els,
    getType,
    getCurrentDoc,
    getDocumentLocation,
    onSelectDocument: (docId) => {
      saveEditor(false);
      ui.selectedDocId = docId;
      persist();
      eventBus.emit(EVENTS.RENDER_DOC_LIST);
      eventBus.emit(EVENTS.RENDER_EDITOR);
    },
    onCopyDocument: duplicateDocument,
    onDeleteDocument: (docId) => {
      ui.selectedDocId = docId;
      deleteCurrentDocument();
    }
  });
  var documentEditor = createDocumentEditor({
    state,
    ui,
    els,
    saveDelayMs: 250,
    getCurrentDoc,
    createDefaultFolder,
    getDocumentLocation,
    getFolderById,
    persist,
    eventBus,
    syncDocumentToRealFolder,
    toast
  });
  var documentManager = createDocumentManager({
    state,
    ui,
    saveEditor,
    persist,
    eventBus,
    focusTitleInput: () => els.titleInput?.focus(),
    createDefaultFolder,
    getFolderLocation,
    getDocumentLocation,
    getDownloadLocation,
    getType,
    downloadBlob,
    toast
  });
  document.addEventListener("DOMContentLoaded", async () => {
    bindElements();
    bindEventBus();
    await hydrateState();
    initializeMissingData();
    bindEvents();
    initThemeToggle(els.themeToggle);
    hydrateStaticSelects();
    selectFirstDocumentIfNeeded();
    render();
    if (window.lucide) {
      window.lucide.createIcons();
    }
  });
  function bindEventBus() {
    eventBus.on(EVENTS.RENDER_ALL, render);
    eventBus.on(EVENTS.RENDER_FOLDERS, renderFolders);
    eventBus.on(EVENTS.RENDER_FOLDER_SELECT, renderFolderSelect);
    eventBus.on(EVENTS.RENDER_DOC_LIST, renderDocList);
    eventBus.on(EVENTS.RENDER_EDITOR, renderEditor);
    eventBus.on(EVENTS.RENDER_STYLE_SELECT, renderStyleSelect);
    eventBus.on(EVENTS.RENDER_STYLE_EDITOR, renderStyleEditor);
    eventBus.on(EVENTS.RENDER_STYLE_EXAMPLES, renderStyleExamples);
    eventBus.on(EVENTS.RENDER_STYLE_LIST, renderStyleList);
    eventBus.on(EVENTS.RENDER_SKILL_QUALITY, renderSkillQualityReport);
    eventBus.on(EVENTS.RENDER_SKILL_TEST, renderSkillTest);
    eventBus.on(EVENTS.RENDER_API_SETTINGS, renderApiSettings);
  }
  function bindElements() {
    [
      "storageLabel",
      "themeToggle",
      "newDocBtn",
      "importInput",
      "exportDocBtn",
      "backupBtn",
      "linkFolderBtn",
      "addFolderBtn",
      "folderCreateBox",
      "folderNameInput",
      "confirmFolderBtn",
      "folderList",
      "docCount",
      "searchInput",
      "docDropZone",
      "docList",
      "titleInput",
      "typeSelect",
      "folderSelect",
      "styleSelect",
      "saveDocBtn",
      "saveState",
      "replaceToggleBtn",
      "replaceBar",
      "findInput",
      "replaceInput",
      "replaceNextBtn",
      "replaceAllBtn",
      "contentEditor",
      "editorMenu",
      "editorSkillSelect",
      "aiStatus",
      "generatePrompt",
      "skillMentionPanel",
      "generateDocBtn",
      "insertDraftBtn",
      "newStyleBtn",
      "styleNameInput",
      "skillHandleInput",
      "skillCategorySelect",
      "skillDescriptionInput",
      "skillEnabledInput",
      "styleDropZone",
      "styleFileInput",
      "styleExampleList",
      "summarizeStyleBtn",
      "skillAnalysisInput",
      "skillAggregationInput",
      "skillQualityReport",
      "styleSummaryInput",
      "skillJsonInput",
      "exportSkillMdBtn",
      "exportSkillJsonBtn",
      "skillVersionList",
      "skillVersionDiff",
      "skillTestPrompt",
      "runSkillTestBtn",
      "skillTestResult",
      "skillTestReport",
      "skillFeedbackInput",
      "saveSkillFeedbackBtn",
      "saveStyleBtn",
      "deleteStyleBtn",
      "styleList",
      "skillDetailMenu",
      "skillDetailTitle",
      "skillDetailMeta",
      "skillDetailCloseBtn",
      "apiSavedLabel",
      "providerSelect",
      "baseUrlInput",
      "endpointPathInput",
      "modelInput",
      "apiKeyInput",
      "systemPromptInput",
      "saveApiBtn",
      "testApiBtn",
      "clearApiBtn",
      "toastRegion"
    ].forEach((id) => {
      els[id] = document.getElementById(id);
    });
  }
  function initializeMissingData() {
    if (!Array.isArray(state.folders) || state.folders.length === 0) {
      const officeId = createId();
      state.folders = [
        { id: officeId, name: "\u65E5\u5E38\u901A\u77E5", kind: "tag", color: folderColors[0], createdAt: now() },
        { id: createId(), name: "\u4F1A\u8BAE\u6750\u6599", kind: "tag", color: folderColors[1], createdAt: now() },
        { id: createId(), name: "\u8BF7\u793A\u62A5\u544A", kind: "tag", color: folderColors[2], createdAt: now() }
      ];
    }
    state.folders = state.folders.map((folder) => normalizeFolder(folder));
    if (!Array.isArray(state.styles) || state.styles.length === 0) {
      state.styles = [
        {
          id: createId(),
          name: "\u901A\u77E5\u5199\u4F5C",
          handle: "\u901A\u77E5\u5199\u4F5C",
          category: "\u516C\u6587\u5199\u4F5C",
          description: "\u751F\u6210\u6B63\u5F0F\u3001\u6E05\u695A\u3001\u9002\u5408\u7EC4\u7EC7\u5185\u90E8\u53D1\u5E03\u7684\u901A\u77E5\u3002",
          summary: DEFAULT_STYLE_SKILL,
          skillJson: JSON.stringify(
            {
              name: "\u901A\u77E5\u5199\u4F5C",
              handle: "\u901A\u77E5\u5199\u4F5C",
              applicable_scope: "\u7EC4\u7EC7\u5185\u90E8\u901A\u77E5\u3001\u5DE5\u4F5C\u5B89\u6392\u3001\u4E8B\u9879\u544A\u77E5\u7B49\u6B63\u5F0F\u6587\u6863",
              required_user_inputs: ["\u4E3B\u9898", "\u5BF9\u8C61", "\u65F6\u95F4", "\u5730\u70B9", "\u4E8B\u9879\u5B89\u6392", "\u5DE5\u4F5C\u8981\u6C42", "\u843D\u6B3E\u4FE1\u606F"],
              document_structure_template: ["\u6807\u9898", "\u53D1\u5E03\u5BF9\u8C61", "\u4E8B\u9879\u80CC\u666F", "\u5177\u4F53\u5B89\u6392", "\u5DE5\u4F5C\u8981\u6C42", "\u843D\u6B3E\u65E5\u671F"],
              style_rules: ["\u8868\u8FBE\u6B63\u5F0F\u3001\u6E05\u695A\u3001\u4FBF\u4E8E\u6267\u884C", "\u4E8B\u5B9E\u4E0D\u660E\u5904\u4F7F\u7528\u5360\u4F4D\u7B26", "\u907F\u514D\u53E3\u8BED\u5316\u548C\u5938\u5F20\u8868\u8FBE"],
              reusable_expressions: ["\u73B0\u5C06\u6709\u5173\u4E8B\u9879\u901A\u77E5\u5982\u4E0B", "\u8BF7\u5404\u90E8\u95E8\u7ED3\u5408\u5B9E\u9645\u8BA4\u771F\u843D\u5B9E", "\u8BF7\u6309\u65F6\u5B8C\u6210\u76F8\u5173\u5DE5\u4F5C"],
              forbidden: ["\u4E0D\u5F97\u7F16\u9020\u672A\u63D0\u4F9B\u7684\u65F6\u95F4\u3001\u5730\u70B9\u3001\u6570\u636E\u6216\u8D23\u4EFB\u4EBA", "\u4E0D\u5F97\u6CC4\u9732\u6837\u672C\u6587\u6863\u4E2D\u7684\u4E2A\u4EBA\u9690\u79C1\u6216\u654F\u611F\u4FE1\u606F"],
              generation_steps: ["\u786E\u8BA4\u4E3B\u9898\u548C\u5BF9\u8C61", "\u63D0\u53D6\u5FC5\u8981\u4E8B\u9879", "\u5957\u7528\u901A\u77E5\u7ED3\u6784", "\u68C0\u67E5\u843D\u6B3E\u548C\u65E5\u671F"],
              self_checklist: ["\u6807\u9898\u662F\u5426\u660E\u786E", "\u4E8B\u9879\u662F\u5426\u5B8C\u6574", "\u8981\u6C42\u662F\u5426\u53EF\u6267\u884C", "\u662F\u5426\u5B58\u5728\u672A\u6838\u5B9E\u4FE1\u606F"]
            },
            null,
            2
          ),
          examples: [],
          createdAt: now(),
          updatedAt: now()
        }
      ];
    }
    state.styles = state.styles.map((style) => normalizeSkill(style));
    migrateLegacyBranding();
    if (!Array.isArray(state.docs) || state.docs.length === 0) {
      state.docs = [
        {
          id: createId(),
          title: "\u4E13\u9879\u57F9\u8BAD\u5B89\u6392\u901A\u77E5",
          type: "notice",
          folderId: state.folders[0].id,
          styleId: state.styles[0].id,
          content: "\u5173\u4E8E\u5F00\u5C55\u4E13\u9879\u57F9\u8BAD\u5DE5\u4F5C\u7684\u901A\u77E5\n\n\u5404\u76F8\u5173\u90E8\u95E8\uFF1A\n\n\u4E3A\u63D0\u5347\u5DE5\u4F5C\u534F\u540C\u6548\u7387\uFF0C\u89C4\u8303\u4E1A\u52A1\u529E\u7406\u6D41\u7A0B\uFF0C\u73B0\u5C06\u4E13\u9879\u57F9\u8BAD\u6709\u5173\u4E8B\u9879\u901A\u77E5\u5982\u4E0B\uFF1A\n\n\u4E00\u3001\u57F9\u8BAD\u65F6\u95F4\u4E3A2026\u5E745\u670820\u65E5\uFF08\u661F\u671F\u4E09\uFF09\u4E0A\u53489:00\uFF0C\u5730\u70B9\u4E3A\u4F1A\u8BAE\u5BA4A\u3002\n\n\u4E8C\u3001\u8BF7\u5404\u90E8\u95E8\u5B89\u6392\u76F8\u5173\u4EBA\u5458\u51C6\u65F6\u53C2\u52A0\uFF0C\u5E76\u63D0\u524D\u68B3\u7406\u672C\u90E8\u95E8\u5728\u5B9E\u9645\u5DE5\u4F5C\u4E2D\u9047\u5230\u7684\u91CD\u70B9\u95EE\u9898\u3002\n\n\u4E09\u3001\u57F9\u8BAD\u7ED3\u675F\u540E\uFF0C\u8BF7\u5404\u90E8\u95E8\u4E8E\u4E24\u4E2A\u5DE5\u4F5C\u65E5\u5185\u63D0\u4EA4\u5B66\u4E60\u53CD\u9988\u548C\u540E\u7EED\u6539\u8FDB\u5EFA\u8BAE\u3002\n\n\u8BF7\u5404\u90E8\u95E8\u9AD8\u5EA6\u91CD\u89C6\uFF0C\u6309\u8981\u6C42\u505A\u597D\u53C2\u8BAD\u7EC4\u7EC7\u548C\u6750\u6599\u51C6\u5907\u5DE5\u4F5C\u3002\n\n\u7EFC\u5408\u529E\u516C\u5BA4\n2026\u5E745\u670814\u65E5",
          createdAt: now(),
          updatedAt: now()
        }
      ];
    }
    state.settings = {
      provider: "openai-compatible",
      baseUrl: "",
      endpointPath: "/chat/completions",
      model: "",
      apiKey: "",
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      ...state.settings || {}
    };
    if (state.settings.systemPrompt === "\u4F60\u662F\u5B66\u6821\u529E\u516C\u5BA4\u6587\u4E66\u52A9\u624B\uFF0C\u64C5\u957F\u64B0\u5199\u4E2D\u6587\u6821\u52A1\u3001\u516C\u6587\u3001\u901A\u77E5\u3001\u603B\u7ED3\u3001\u4F1A\u8BAE\u7EAA\u8981\u548C\u8BF7\u793A\u6750\u6599\u3002\u8F93\u51FA\u8981\u51C6\u786E\u3001\u7A33\u59A5\u3001\u6761\u7406\u6E05\u6670\uFF0C\u907F\u514D\u7F16\u9020\u4E8B\u5B9E\uFF1B\u7F3A\u5C11\u4FE1\u606F\u65F6\u7528\u53EF\u66FF\u6362\u5360\u4F4D\u8868\u8FBE\u3002") {
      state.settings.systemPrompt = DEFAULT_SYSTEM_PROMPT;
    }
    ui.editingStyle = clone(state.styles[0]);
    persist();
  }
  function createDefaultNoticeWriterJson() {
    return JSON.stringify(
      {
        name: "\u901A\u77E5\u5199\u4F5C",
        handle: "\u901A\u77E5\u5199\u4F5C",
        applicable_scope: "\u7EC4\u7EC7\u5185\u90E8\u901A\u77E5\u3001\u5DE5\u4F5C\u5B89\u6392\u3001\u4E8B\u9879\u544A\u77E5\u7B49\u6B63\u5F0F\u6587\u6863",
        required_user_inputs: ["\u4E3B\u9898", "\u5BF9\u8C61", "\u65F6\u95F4", "\u5730\u70B9", "\u4E8B\u9879\u5B89\u6392", "\u5DE5\u4F5C\u8981\u6C42", "\u843D\u6B3E\u4FE1\u606F"],
        document_structure_template: ["\u6807\u9898", "\u53D1\u5E03\u5BF9\u8C61", "\u4E8B\u9879\u80CC\u666F", "\u5177\u4F53\u5B89\u6392", "\u5DE5\u4F5C\u8981\u6C42", "\u843D\u6B3E\u65E5\u671F"],
        style_rules: ["\u8868\u8FBE\u6B63\u5F0F\u3001\u6E05\u695A\u3001\u4FBF\u4E8E\u6267\u884C", "\u4E8B\u5B9E\u4E0D\u660E\u5904\u4F7F\u7528\u5360\u4F4D\u7B26", "\u907F\u514D\u53E3\u8BED\u5316\u548C\u5938\u5F20\u8868\u8FBE"],
        reusable_expressions: ["\u73B0\u5C06\u6709\u5173\u4E8B\u9879\u901A\u77E5\u5982\u4E0B", "\u8BF7\u5404\u90E8\u95E8\u7ED3\u5408\u5B9E\u9645\u8BA4\u771F\u843D\u5B9E", "\u8BF7\u6309\u65F6\u5B8C\u6210\u76F8\u5173\u5DE5\u4F5C"],
        forbidden: ["\u4E0D\u5F97\u7F16\u9020\u672A\u63D0\u4F9B\u7684\u65F6\u95F4\u3001\u5730\u70B9\u3001\u6570\u636E\u6216\u8D23\u4EFB\u4EBA", "\u4E0D\u5F97\u6CC4\u9732\u6837\u672C\u6587\u6863\u4E2D\u7684\u4E2A\u4EBA\u9690\u79C1\u6216\u654F\u611F\u4FE1\u606F"],
        generation_steps: ["\u786E\u8BA4\u4E3B\u9898\u548C\u5BF9\u8C61", "\u63D0\u53D6\u5FC5\u8981\u4E8B\u9879", "\u5957\u7528\u901A\u77E5\u7ED3\u6784", "\u68C0\u67E5\u843D\u6B3E\u548C\u65E5\u671F"],
        self_checklist: ["\u6807\u9898\u662F\u5426\u660E\u786E", "\u4E8B\u9879\u662F\u5426\u5B8C\u6574", "\u8981\u6C42\u662F\u5426\u53EF\u6267\u884C", "\u662F\u5426\u5B58\u5728\u672A\u6838\u5B9E\u4FE1\u606F"]
      },
      null,
      2
    );
  }
  function migrateLegacyBranding() {
    state.styles.forEach((style) => {
      const isLegacyDefault = style.name === "\u5B66\u6821\u901A\u77E5" && style.handle === "\u5B66\u6821\u901A\u77E5" && (!style.examples || style.examples.length === 0) && (!style.versions || style.versions.length === 0);
      if (!isLegacyDefault) return;
      style.name = "\u901A\u77E5\u5199\u4F5C";
      style.handle = "\u901A\u77E5\u5199\u4F5C";
      style.description = "\u751F\u6210\u6B63\u5F0F\u3001\u6E05\u695A\u3001\u9002\u5408\u7EC4\u7EC7\u5185\u90E8\u53D1\u5E03\u7684\u901A\u77E5\u3002";
      style.summary = DEFAULT_STYLE_SKILL;
      style.skillJson = createDefaultNoticeWriterJson();
      style.updatedAt = now();
    });
    if (!Array.isArray(state.docs)) return;
    state.docs.forEach((doc) => {
      const content = String(doc.content || "");
      const isLegacyDefaultDoc = doc.title === "\u65B0\u5B66\u671F\u5DE5\u4F5C\u5B89\u6392\u901A\u77E5" && content.includes("\u5B66\u6821\u529E\u516C\u5BA4");
      if (!isLegacyDefaultDoc) return;
      doc.title = "\u4E13\u9879\u57F9\u8BAD\u5B89\u6392\u901A\u77E5";
      doc.content = "\u5173\u4E8E\u5F00\u5C55\u4E13\u9879\u57F9\u8BAD\u5DE5\u4F5C\u7684\u901A\u77E5\n\n\u5404\u76F8\u5173\u90E8\u95E8\uFF1A\n\n\u4E3A\u63D0\u5347\u5DE5\u4F5C\u534F\u540C\u6548\u7387\uFF0C\u89C4\u8303\u4E1A\u52A1\u529E\u7406\u6D41\u7A0B\uFF0C\u73B0\u5C06\u4E13\u9879\u57F9\u8BAD\u6709\u5173\u4E8B\u9879\u901A\u77E5\u5982\u4E0B\uFF1A\n\n\u4E00\u3001\u57F9\u8BAD\u65F6\u95F4\u4E3A2026\u5E745\u670820\u65E5\uFF08\u661F\u671F\u4E09\uFF09\u4E0A\u53489:00\uFF0C\u5730\u70B9\u4E3A\u4F1A\u8BAE\u5BA4A\u3002\n\n\u4E8C\u3001\u8BF7\u5404\u90E8\u95E8\u5B89\u6392\u76F8\u5173\u4EBA\u5458\u51C6\u65F6\u53C2\u52A0\uFF0C\u5E76\u63D0\u524D\u68B3\u7406\u672C\u90E8\u95E8\u5728\u5B9E\u9645\u5DE5\u4F5C\u4E2D\u9047\u5230\u7684\u91CD\u70B9\u95EE\u9898\u3002\n\n\u4E09\u3001\u57F9\u8BAD\u7ED3\u675F\u540E\uFF0C\u8BF7\u5404\u90E8\u95E8\u4E8E\u4E24\u4E2A\u5DE5\u4F5C\u65E5\u5185\u63D0\u4EA4\u5B66\u4E60\u53CD\u9988\u548C\u540E\u7EED\u6539\u8FDB\u5EFA\u8BAE\u3002\n\n\u8BF7\u5404\u90E8\u95E8\u9AD8\u5EA6\u91CD\u89C6\uFF0C\u6309\u8981\u6C42\u505A\u597D\u53C2\u8BAD\u7EC4\u7EC7\u548C\u6750\u6599\u51C6\u5907\u5DE5\u4F5C\u3002\n\n\u7EFC\u5408\u529E\u516C\u5BA4\n2026\u5E745\u670814\u65E5";
      doc.updatedAt = now();
    });
  }
  function bindEvents() {
    els.newDocBtn.addEventListener("click", createDocument);
    els.importInput.addEventListener("change", importDocuments);
    setupFileDrop(els.docDropZone, importDocumentFiles);
    setupFileDrop(els.docList, importDocumentFiles);
    els.exportDocBtn.addEventListener("click", exportCurrentDocument);
    els.backupBtn.addEventListener("click", exportWorkspaceBackup);
    preventWindowFileNavigation();
    els.linkFolderBtn.addEventListener("click", linkRealFolder);
    els.addFolderBtn.addEventListener("click", () => {
      els.folderCreateBox.hidden = !els.folderCreateBox.hidden;
      if (!els.folderCreateBox.hidden) {
        els.folderNameInput.focus();
      }
    });
    els.confirmFolderBtn.addEventListener("click", addFolder);
    els.folderNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") addFolder();
    });
    els.searchInput.addEventListener("input", queueSearchRender);
    ["input", "change"].forEach((eventName) => {
      els.titleInput.addEventListener(eventName, queueEditorSave);
      els.contentEditor.addEventListener(eventName, queueEditorSave);
    });
    els.typeSelect.addEventListener("change", queueEditorSave);
    els.folderSelect.addEventListener("change", queueEditorSave);
    els.styleSelect.addEventListener("change", queueEditorSave);
    els.saveDocBtn.addEventListener("click", () => saveEditor(true));
    els.replaceToggleBtn.addEventListener("click", toggleReplaceBar);
    els.replaceNextBtn.addEventListener("click", replaceNext);
    els.replaceAllBtn.addEventListener("click", replaceAll);
    els.contentEditor.addEventListener("contextmenu", showEditorMenu);
    els.editorMenu.addEventListener("click", handleEditorMenuAction);
    document.addEventListener("click", (event) => {
      if (!event.target.closest("#editorMenu")) hideEditorMenu();
      if (!event.target.closest("#skillMentionPanel") && !event.target.matches("#generatePrompt, #contentEditor")) {
        hideSkillMentionPanel();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        hideEditorMenu();
        hideSkillMentionPanel();
      }
    });
    els.generatePrompt.addEventListener("input", () => showSkillMentionsFor(els.generatePrompt));
    els.generatePrompt.addEventListener("keyup", () => showSkillMentionsFor(els.generatePrompt));
    els.generatePrompt.addEventListener("click", () => showSkillMentionsFor(els.generatePrompt));
    els.contentEditor.addEventListener("input", () => showSkillMentionsFor(els.contentEditor));
    els.contentEditor.addEventListener("keyup", () => showSkillMentionsFor(els.contentEditor));
    els.contentEditor.addEventListener("click", () => showSkillMentionsFor(els.contentEditor));
    els.skillMentionPanel.addEventListener("mousedown", (event) => {
      const button = event.target.closest("[data-insert-skill]");
      if (!button) return;
      event.preventDefault();
      insertSkillMention(button.dataset.insertSkill);
    });
    const tabs = document.querySelector(".tabs");
    tabs.addEventListener("click", (event) => {
      const button = event.target.closest(".tab");
      if (button) switchTab(button.dataset.tab);
    });
    els.generateDocBtn.addEventListener("click", () => generateDocument(false));
    els.insertDraftBtn.addEventListener("click", () => generateDocument(true));
    els.newStyleBtn.addEventListener("click", () => {
      ui.editingStyle = createEmptyStyle();
      eventBus.emit(EVENTS.RENDER_STYLE_EDITOR);
      hideSkillDetailMenu();
    });
    els.styleFileInput.addEventListener("change", importStyleExamples);
    setupFileDrop(els.styleDropZone, importStyleExampleFiles);
    els.summarizeStyleBtn.addEventListener("click", summarizeStyle);
    els.saveStyleBtn.addEventListener("click", saveStyle);
    els.deleteStyleBtn.addEventListener("click", deleteStyle);
    els.styleNameInput.addEventListener("input", () => {
      ui.editingStyle.name = els.styleNameInput.value;
      if (!els.skillHandleInput.value.trim()) {
        ui.editingStyle.handle = normalizeHandle(els.styleNameInput.value);
        els.skillHandleInput.value = `@${ui.editingStyle.handle}`;
      }
    });
    els.skillHandleInput.addEventListener("input", () => {
      ui.editingStyle.handle = normalizeHandle(els.skillHandleInput.value);
    });
    els.skillCategorySelect.addEventListener("change", () => {
      ui.editingStyle.category = els.skillCategorySelect.value;
    });
    els.skillDescriptionInput.addEventListener("input", () => {
      ui.editingStyle.description = els.skillDescriptionInput.value;
    });
    els.skillEnabledInput.addEventListener("change", () => {
      ui.editingStyle.enabled = els.skillEnabledInput.checked;
      eventBus.emit(EVENTS.RENDER_STYLE_SELECT);
      eventBus.emit(EVENTS.RENDER_STYLE_LIST);
    });
    els.skillAnalysisInput.addEventListener("input", () => {
      ui.editingStyle.analysis = els.skillAnalysisInput.value;
    });
    els.skillAggregationInput.addEventListener("input", () => {
      ui.editingStyle.aggregation = els.skillAggregationInput.value;
    });
    els.styleSummaryInput.addEventListener("input", () => {
      ui.editingStyle.summary = els.styleSummaryInput.value;
    });
    els.skillJsonInput.addEventListener("input", () => {
      ui.editingStyle.skillJson = els.skillJsonInput.value;
    });
    els.exportSkillMdBtn.addEventListener("click", exportSkillMarkdown);
    els.exportSkillJsonBtn.addEventListener("click", exportSkillJson);
    els.runSkillTestBtn.addEventListener("click", runSkillGenerationTest);
    els.saveSkillFeedbackBtn.addEventListener("click", saveSkillFeedback);
    els.skillDetailCloseBtn.addEventListener("click", hideSkillDetailMenu);
    document.querySelectorAll(".detail-tab").forEach((button) => {
      button.addEventListener("click", () => switchSkillDetailTab(button.dataset.detailTab));
    });
    els.saveApiBtn.addEventListener("click", saveApiSettings);
    els.testApiBtn.addEventListener("click", testApiSettings);
    els.clearApiBtn.addEventListener("click", clearApiSettings);
  }
  function setupFileDrop(target, handler) {
    if (!target) return;
    ["dragenter", "dragover"].forEach((eventName) => {
      target.addEventListener(eventName, (event) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        target.classList.add("drag-over");
      });
    });
    ["dragleave", "dragend"].forEach((eventName) => {
      target.addEventListener(eventName, () => target.classList.remove("drag-over"));
    });
    target.addEventListener("drop", async (event) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      target.classList.remove("drag-over");
      const files = Array.from(event.dataTransfer?.files || []);
      if (files.length > 0) {
        await handler(files);
      }
    });
  }
  function preventWindowFileNavigation() {
    ["dragover", "drop"].forEach((eventName) => {
      window.addEventListener(eventName, (event) => {
        if (isFileDrag(event)) event.preventDefault();
      });
    });
  }
  function isFileDrag(event) {
    return Array.from(event.dataTransfer?.types || []).includes("Files");
  }
  function hydrateStaticSelects() {
    const options = DOCUMENT_TYPES.map((type) => `<option value="${type.id}">${type.name}</option>`).join("");
    els.typeSelect.innerHTML = options;
  }
  function render() {
    renderFolders();
    renderFolderSelect();
    renderStyleSelect();
    renderDocList();
    renderEditor();
    renderApiSettings();
    renderStyleEditor();
    renderStyleList();
    updateAiStatus();
    els.storageLabel.textContent = `${state.docs.length} \u4EFD\u6587\u6863 / ${state.folders.length} \u4E2A\u6587\u4EF6\u5939`;
    els.storageLabel.title = `\u5B58\u50A8\u4F4D\u7F6E\uFF1A${getStorageRootLocation()}`;
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }
  function renderFolders() {
    folderRenderer.renderFolders();
  }
  function renderFolderSelect() {
    folderRenderer.renderFolderSelect();
  }
  function renderStyleSelect() {
    skillRenderer.renderStyleSelect();
  }
  function renderDocList() {
    documentRenderer.renderDocList();
  }
  function renderEditor() {
    documentRenderer.renderEditor();
  }
  function renderApiSettings() {
    const settings = state.settings || {};
    els.providerSelect.value = settings.provider || "openai-compatible";
    els.baseUrlInput.value = settings.baseUrl || "";
    els.endpointPathInput.value = settings.endpointPath || "/chat/completions";
    els.modelInput.value = settings.model || "";
    els.apiKeyInput.value = settings.apiKey || "";
    els.systemPromptInput.value = settings.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  }
  function renderStyleEditor() {
    skillRenderer.renderStyleEditor();
  }
  function renderStyleExamples() {
    skillRenderer.renderStyleExamples();
  }
  function renderSkillQualityReport() {
    skillRenderer.renderSkillQualityReport();
  }
  function renderSkillTest() {
    skillRenderer.renderSkillTest();
  }
  function renderStyleList() {
    skillRenderer.renderStyleList();
  }
  function createDocument(seed = {}) {
    return documentManager.createDocument(seed);
  }
  function duplicateDocument(docId) {
    return documentManager.duplicateDocument(docId);
  }
  function deleteCurrentDocument() {
    return documentManager.deleteCurrentDocument();
  }
  function queueEditorSave() {
    documentEditor.queueEditorSave();
  }
  function queueSearchRender() {
    window.clearTimeout(ui.searchTimer);
    ui.searchTimer = window.setTimeout(renderDocList, SEARCH_RENDER_DEBOUNCE_MS);
  }
  function saveEditor(showToast2) {
    return documentEditor.saveEditor(showToast2);
  }
  function formatCurrentDocument() {
    const editor = els.contentEditor;
    const formatted = editor.value.replace(/\r\n/g, "\n").split("\n").map((line) => line.replace(/[ \t]+$/g, "").replace(/^[ \t]+/g, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    editor.value = formatted;
    saveEditor(true);
  }
  function toggleReplaceBar() {
    const shouldOpen = els.replaceBar.hidden;
    els.replaceBar.hidden = !shouldOpen;
    els.replaceBar.classList.toggle("collapsed", !shouldOpen);
    els.replaceToggleBtn.setAttribute("aria-expanded", String(shouldOpen));
    if (shouldOpen) {
      els.findInput.focus();
    }
  }
  function showEditorMenu(event) {
    event.preventDefault();
    els.contentEditor.focus();
    const panel = document.querySelector(".editor-panel");
    const panelRect = panel.getBoundingClientRect();
    const menu = els.editorMenu;
    menu.hidden = false;
    const width = menu.offsetWidth || 196;
    const height = menu.offsetHeight || 164;
    const left = Math.min(Math.max(8, event.clientX - panelRect.left), panelRect.width - width - 8);
    const top = Math.min(Math.max(8, event.clientY - panelRect.top), panelRect.height - height - 8);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    if (window.lucide) window.lucide.createIcons();
  }
  function hideEditorMenu() {
    els.editorMenu.hidden = true;
  }
  async function handleEditorMenuAction(event) {
    const button = event.target.closest("button[data-editor-action]");
    if (!button) return;
    const action = button.dataset.editorAction;
    if (action === "copy") {
      await copyEditorText();
    }
    if (action === "delete") {
      deleteEditorText();
    }
    if (action === "rewrite") {
      await rewriteSelection(button);
    }
    if (action === "format") {
      formatCurrentDocument();
    }
    if (action === "insert-skill") {
      insertSkillIntoEditor(els.editorSkillSelect.value);
    }
    hideEditorMenu();
  }
  async function copyEditorText() {
    const selection = getSelectionOrLine();
    if (!selection.text.trim()) {
      toast("\u6CA1\u6709\u53EF\u590D\u5236\u7684\u5185\u5BB9", "warn");
      return;
    }
    try {
      await navigator.clipboard.writeText(selection.text);
    } catch {
      const helper = document.createElement("textarea");
      helper.value = selection.text;
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.select();
      document.execCommand("copy");
      helper.remove();
    }
    toast("\u5DF2\u590D\u5236\u5185\u5BB9");
  }
  function deleteEditorText() {
    const selection = getSelectionOrLine();
    if (!selection.text) {
      toast("\u6CA1\u6709\u53EF\u5220\u9664\u7684\u5185\u5BB9", "warn");
      return;
    }
    const content = els.contentEditor.value;
    els.contentEditor.value = content.slice(0, selection.start) + content.slice(selection.end);
    els.contentEditor.focus();
    els.contentEditor.setSelectionRange(selection.start, selection.start);
    saveEditor(true);
  }
  async function syncDocumentToRealFolder(doc) {
    return folderManager.syncDocumentToRealFolder(doc);
  }
  function insertSkillIntoEditor(skillId) {
    const skill = state.styles.find((item) => item.id === skillId);
    if (!skill) return;
    if (!isSkillEnabled(skill)) {
      toast(`@${skill.handle} \u5C1A\u672A\u542F\u7528`, "warn");
      return;
    }
    insertTextAtCursor(els.contentEditor, `@${skill.handle} `);
    saveEditor(true);
    toast(`\u5DF2\u63D2\u5165 @${skill.handle}`);
  }
  function insertTextAtCursor(textarea, text) {
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || start;
    textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
    textarea.focus();
    textarea.setSelectionRange(start + text.length, start + text.length);
  }
  function showSkillMentionsFor(textarea) {
    const mention = getCurrentMention(textarea);
    if (!mention) {
      hideSkillMentionPanel();
      return;
    }
    const query = mention.query.toLowerCase();
    const matches = state.styles.filter(isSkillEnabled).filter((skill) => {
      const haystack = `${skill.handle} ${skill.name} ${skill.category} ${skill.description || ""}`.toLowerCase();
      return !query || haystack.includes(query);
    }).slice(0, 8);
    if (matches.length === 0) {
      hideSkillMentionPanel();
      return;
    }
    ui.mentionTarget = textarea;
    ui.mentionRange = mention;
    els.skillMentionPanel.innerHTML = matches.map(
      (skill) => `<button type="button" data-insert-skill="${skill.id}">
        <span class="mention-name">@${escapeHtml(skill.handle)}</span>
        <span>${escapeHtml(skill.name)}</span>
        <small>${escapeHtml(skill.description || skill.category || "\u81EA\u5B9A\u4E49\u6267\u7B14\u4EBA")}</small>
      </button>`
    ).join("");
    positionMentionPanel(textarea);
    els.skillMentionPanel.hidden = false;
  }
  function getCurrentMention(textarea) {
    const cursor = textarea.selectionStart || 0;
    const before = textarea.value.slice(0, cursor);
    const match = before.match(/(?:^|[\s，。；：、(（])@([\u4e00-\u9fa5A-Za-z0-9_-]{0,30})$/);
    if (!match) return null;
    return {
      start: cursor - match[1].length - 1,
      end: cursor,
      query: match[1]
    };
  }
  function positionMentionPanel(textarea) {
    const rect = textarea.getBoundingClientRect();
    els.skillMentionPanel.style.left = `${Math.max(12, rect.left + 8)}px`;
    els.skillMentionPanel.style.top = `${Math.min(window.innerHeight - 250, rect.top + 44)}px`;
  }
  function hideSkillMentionPanel() {
    els.skillMentionPanel.hidden = true;
    ui.mentionTarget = null;
    ui.mentionRange = null;
  }
  function insertSkillMention(skillId) {
    const skill = state.styles.find((item) => item.id === skillId);
    if (!skill || !ui.mentionTarget || !ui.mentionRange) return;
    const textarea = ui.mentionTarget;
    const mentionText = `@${skill.handle} `;
    textarea.value = textarea.value.slice(0, ui.mentionRange.start) + mentionText + textarea.value.slice(ui.mentionRange.end);
    textarea.focus();
    const cursor = ui.mentionRange.start + mentionText.length;
    textarea.setSelectionRange(cursor, cursor);
    if (textarea === els.contentEditor) {
      saveEditor(false);
    }
    hideSkillMentionPanel();
  }
  function replaceNext() {
    const findText = els.findInput.value;
    const replacement = els.replaceInput.value;
    if (!findText) {
      toast("\u8BF7\u8F93\u5165\u67E5\u627E\u5185\u5BB9", "warn");
      return;
    }
    const editor = els.contentEditor;
    const content = editor.value;
    let index = content.indexOf(findText, editor.selectionEnd);
    if (index === -1) index = content.indexOf(findText);
    if (index === -1) {
      toast("\u6CA1\u6709\u627E\u5230\u5339\u914D\u5185\u5BB9", "warn");
      return;
    }
    editor.value = content.slice(0, index) + replacement + content.slice(index + findText.length);
    editor.focus();
    editor.setSelectionRange(index, index + replacement.length);
    saveEditor(true);
  }
  function replaceAll() {
    const findText = els.findInput.value;
    const replacement = els.replaceInput.value;
    if (!findText) {
      toast("\u8BF7\u8F93\u5165\u67E5\u627E\u5185\u5BB9", "warn");
      return;
    }
    const editor = els.contentEditor;
    const count = editor.value.split(findText).length - 1;
    if (count === 0) {
      toast("\u6CA1\u6709\u627E\u5230\u5339\u914D\u5185\u5BB9", "warn");
      return;
    }
    editor.value = editor.value.split(findText).join(replacement);
    saveEditor(true);
    toast(`\u5DF2\u66FF\u6362 ${count} \u5904`);
  }
  async function importDocuments(event) {
    const files = Array.from(event.target.files || []);
    await importDocumentFiles(files);
    event.target.value = "";
  }
  async function importDocumentFiles(files) {
    return documentManager.importDocumentFiles(files);
  }
  function exportCurrentDocument() {
    return documentManager.exportCurrentDocument();
  }
  function exportWorkspaceBackup() {
    return documentManager.exportWorkspaceBackup();
  }
  function exportSkillMarkdown() {
    const skill = {
      ...ui.editingStyle,
      name: els.styleNameInput.value.trim() || ui.editingStyle.name || "\u672A\u547D\u540D\u6267\u7B14\u4EBA",
      handle: normalizeHandle(els.skillHandleInput.value || ui.editingStyle.handle || ui.editingStyle.name),
      summary: els.styleSummaryInput.value.trim()
    };
    const content = skill.summary || `# ${skill.name}

`;
    const fileName = `${sanitizeFileName(skill.name)}-\u6267\u7B14\u4EBA\u8BF4\u660E.md`;
    downloadBlob(fileName, content, "text/markdown;charset=utf-8");
    toast(`\u5DF2\u5BFC\u51FA\u6267\u7B14\u4EBA\u8BF4\u660E.md \u5230\uFF1A${getDownloadLocation(fileName)}`);
  }
  function exportSkillJson() {
    const skill = {
      ...ui.editingStyle,
      name: els.styleNameInput.value.trim() || ui.editingStyle.name || "\u672A\u547D\u540D\u6267\u7B14\u4EBA",
      handle: normalizeHandle(els.skillHandleInput.value || ui.editingStyle.handle || ui.editingStyle.name),
      category: els.skillCategorySelect.value || ui.editingStyle.category || "\u81EA\u5B9A\u4E49",
      description: els.skillDescriptionInput.value.trim()
    };
    const content = normalizeSkillJsonText(els.skillJsonInput.value, skill);
    const fileName = `${sanitizeFileName(skill.name)}-\u6267\u7B14\u4EBA\u89C4\u5219.json`;
    downloadBlob(fileName, content, "application/json;charset=utf-8");
    toast(`\u5DF2\u5BFC\u51FA\u6267\u7B14\u4EBA\u89C4\u5219 JSON \u5230\uFF1A${getDownloadLocation(fileName)}`);
  }
  async function linkRealFolder() {
    return folderManager.linkRealFolder();
  }
  async function syncRealFolder(folderId) {
    return folderManager.syncRealFolder(folderId);
  }
  function hideSkillDetailMenu() {
    skillRenderer.hideSkillDetailMenu();
  }
  function switchSkillDetailTab(tabName) {
    skillRenderer.switchSkillDetailTab(tabName);
  }
  function addFolder() {
    return folderManager.addFolder();
  }
  function renameFolder(folderId) {
    return folderManager.renameFolder(folderId);
  }
  function deleteFolder(folderId) {
    return folderManager.deleteFolder(folderId);
  }
  async function generateDocument(insertIntoCurrent) {
    const userPrompt = els.generatePrompt.value.trim();
    const docType = els.typeSelect.value || getCurrentDoc()?.type || "notice";
    if (!userPrompt) {
      toast("\u8BF7\u8F93\u5165\u8D77\u8349\u63D0\u793A\u8BCD", "warn");
      return;
    }
    const button = insertIntoCurrent ? els.insertDraftBtn : els.generateDocBtn;
    await withLoading(button, "\u751F\u6210\u4E2D", async () => withProgress("AI \u6B63\u5728\u751F\u6210\u6587\u6863", async (progress) => {
      progress.update("\u6B63\u5728\u6574\u7406\u63D0\u793A\u8BCD", 18);
      const type = getType(docType);
      const invokedSkills = resolveInvokedSkills(userPrompt, els.styleSelect.value);
      const prompt = [
        "\u8BF7\u6839\u636E\u7528\u6237\u63D0\u793A\u8BCD\u64B0\u5199\u4E00\u4EFD\u4E2D\u6587\u6B63\u5F0F\u6587\u6863\u3002",
        `\u5F53\u524D\u6587\u6863\u7C7B\u578B\u53C2\u8003\uFF1A${type.name}`,
        `\u5E38\u89C1\u7ED3\u6784\u53C2\u8003\uFF1A${type.structure}`,
        formatSkillPrompt(invokedSkills),
        `\u7528\u6237\u63D0\u793A\u8BCD\uFF1A
${userPrompt}`,
        "\u8F93\u51FA\u8981\u6C42\uFF1A\u4E25\u683C\u6267\u884C\u88AB @ \u8C03\u7528\u7684\u6267\u7B14\u4EBA\u89C4\u5219\uFF1B\u76F4\u63A5\u7ED9\u51FA\u5B8C\u6574\u6587\u6863\u5185\u5BB9\uFF0C\u4E0D\u8981\u89E3\u91CA\u5199\u4F5C\u8FC7\u7A0B\uFF1B\u6807\u9898\u7F6E\u4E8E\u9996\u884C\uFF1B\u4E8B\u5B9E\u4E0D\u660E\u5904\u4F7F\u7528\u53EF\u66FF\u6362\u5360\u4F4D\uFF0C\u4E0D\u8981\u7F16\u9020\u3002"
      ].filter(Boolean).join("\n\n");
      progress.update("\u6B63\u5728\u8BF7\u6C42 AI \u751F\u6210\u6B63\u6587", 42);
      const content = await callAiWithRetry([
        { role: "system", content: state.settings.systemPrompt || DEFAULT_SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ]);
      progress.update("\u6B63\u5728\u5199\u5165\u6587\u6863", 82);
      if (insertIntoCurrent) {
        const current = getCurrentDoc() || createDocument({ title: deriveGeneratedTitle(content, userPrompt), type: docType });
        const separator = els.contentEditor.value.trim() ? "\n\n" : "";
        els.contentEditor.value = `${els.contentEditor.value}${separator}${content}`;
        saveEditor(true);
        ui.generatedDraft = content;
        toast("\u5DF2\u63D2\u5165\u5230\u5F53\u524D\u6587\u6863");
        return current;
      }
      const title = deriveGeneratedTitle(content, userPrompt);
      const newDoc = createDocument({
        title,
        type: docType,
        styleId: invokedSkills[0]?.id || "",
        content
      });
      ui.generatedDraft = content;
      toast(`\u5DF2\u751F\u6210\u65B0\u6587\u6863\u5230\uFF1A${getDocumentLocation(newDoc)}`);
      return null;
    }));
  }
  async function rewriteSelection(triggerButton = null) {
    const selection = getSelectionOrLine();
    if (!selection.text.trim()) {
      toast("\u8BF7\u9009\u4E2D\u6216\u5B9A\u4F4D\u5230\u9700\u8981\u91CD\u5199\u7684\u6BB5\u843D", "warn");
      return;
    }
    const doc = getCurrentDoc();
    const type = getType(doc?.type || "custom");
    const invokedSkills = resolveInvokedSkills(selection.text, els.styleSelect.value);
    const runner = async () => {
      await withProgress("AI \u6B63\u5728\u91CD\u5199\u6BB5\u843D", async (progress) => {
        progress.update("\u6B63\u5728\u6574\u7406\u6BB5\u843D\u8981\u6C42", 20);
        const prompt = [
          "\u8BF7\u91CD\u5199\u4E0B\u9762\u8FD9\u6BB5\u6B63\u5F0F\u6587\u6863\u5185\u5BB9\u3002",
          `\u6587\u6863\u7C7B\u578B\uFF1A${type.name}`,
          formatSkillPrompt(invokedSkills),
          "\u8981\u6C42\uFF1A\u4FDD\u7559\u4E8B\u5B9E\u4FE1\u606F\uFF0C\u4E0D\u65B0\u589E\u672A\u63D0\u4F9B\u7684\u6570\u636E\uFF1B\u8868\u8FBE\u66F4\u89C4\u8303\u3001\u6E05\u695A\u3001\u6B63\u5F0F\uFF1B\u53EA\u8F93\u51FA\u91CD\u5199\u540E\u7684\u6BB5\u843D\u3002",
          `\u539F\u6BB5\u843D\uFF1A
${selection.text}`
        ].filter(Boolean).join("\n\n");
        progress.update("\u6B63\u5728\u8BF7\u6C42 AI \u6539\u5199", 45);
        const rewritten = await callAiWithRetry([
          { role: "system", content: state.settings.systemPrompt || DEFAULT_SYSTEM_PROMPT },
          { role: "user", content: prompt }
        ]);
        progress.update("\u6B63\u5728\u66FF\u6362\u9009\u4E2D\u6BB5\u843D", 85);
        const content = els.contentEditor.value;
        els.contentEditor.value = content.slice(0, selection.start) + rewritten + content.slice(selection.end);
        els.contentEditor.focus();
        els.contentEditor.setSelectionRange(selection.start, selection.start + rewritten.length);
        saveEditor(true);
        toast("\u6BB5\u843D\u5DF2\u91CD\u5199");
      });
    };
    if (triggerButton) {
      await withLoading(triggerButton, "\u91CD\u5199\u4E2D", runner);
    } else {
      await runner();
    }
  }
  async function importStyleExamples(event) {
    const files = Array.from(event.target.files || []);
    await importStyleExampleFiles(files);
    event.target.value = "";
  }
  async function importStyleExampleFiles(files) {
    if (!files || files.length === 0) return;
    for (const file of files) {
      ui.editingStyle.examples.push({
        id: createId(),
        name: file.name,
        text: await file.text(),
        addedAt: now()
      });
    }
    renderStyleExamples();
    toast(`\u5DF2\u6DFB\u52A0 ${files.length} \u4EFD\u793A\u8303\u5230\uFF1A${getSkillTrainingLocation(ui.editingStyle)}`);
  }
  async function summarizeStyle() {
    const style = syncEditingStyleFromInputs();
    if (!style.name.trim()) {
      toast("\u8BF7\u8F93\u5165\u6267\u7B14\u4EBA\u540D\u79F0", "warn");
      return;
    }
    if (!style.examples || style.examples.length === 0) {
      toast("\u8BF7\u5148\u6DFB\u52A0\u793A\u8303\u6587\u4EF6", "warn");
      return;
    }
    if (style.examples.length < 2) {
      const ok = window.confirm("\u53EA\u6709 1 \u7BC7\u793A\u8303\u53EA\u80FD\u751F\u6210\u4E0D\u7A33\u5B9A\u8349\u6848\uFF0C\u5EFA\u8BAE\u81F3\u5C11 3-5 \u7BC7\u3002\u662F\u5426\u7EE7\u7EED\u751F\u6210\u8349\u6848\uFF1F");
      if (!ok) return;
    }
    await withLoading(els.summarizeStyleBtn, "\u751F\u6210\u4E2D", async () => withProgress("\u6B63\u5728\u6784\u5EFA\u591A\u6587\u6863\u6267\u7B14\u4EBA", async (progress) => {
      const outputs = await skillBuilder.buildSkillWithAiChain(style, progress);
      const version = skillBuilder.createSkillVersion(style, outputs);
      progress.update("\u6B63\u5728\u4FDD\u5B58\u6267\u7B14\u4EBA\u7248\u672C", 92);
      style.analyses = outputs.analyses;
      style.analysis = outputs.analysis;
      style.aggregationData = outputs.aggregationData;
      style.aggregation = outputs.aggregation;
      style.qualityReport = outputs.qualityReport;
      style.summary = outputs.markdown;
      style.skillJson = outputs.skillJson;
      style.lastTest = {
        id: createId(),
        createdAt: now(),
        prompt: "AI \u81EA\u52A8\u751F\u6210\u7684\u6267\u7B14\u4EBA\u6D4B\u8BD5",
        result: outputs.testDoc,
        report: outputs.testReport
      };
      style.versions = [...style.versions || [], version].slice(-30);
      commitSkillToState(style);
      eventBus.emit(EVENTS.RENDER_STYLE_EDITOR);
      switchSkillDetailTab("workflow");
      toast(`\u5DF2\u751F\u6210 v${version.version} \u5E76\u4FDD\u5B58\u5230\uFF1A${getSkillLocation(ui.editingStyle)}`);
    }));
  }
  function syncEditingStyleFromInputs() {
    return skillManager.syncEditingStyleFromInputs();
  }
  async function runSkillGenerationTest() {
    const style = syncEditingStyleFromInputs();
    const testPrompt = els.skillTestPrompt.value.trim();
    if (!style.skillJson.trim()) {
      toast("\u8BF7\u5148\u751F\u6210\u6216\u586B\u5199\u6267\u7B14\u4EBA\u89C4\u5219 JSON", "warn");
      return;
    }
    if (!testPrompt) {
      toast("\u8BF7\u8F93\u5165\u6D4B\u8BD5\u8D77\u8349\u4EFB\u52A1", "warn");
      return;
    }
    await withLoading(els.runSkillTestBtn, "\u6D4B\u8BD5\u4E2D", async () => withProgress("\u6B63\u5728\u6D4B\u8BD5\u6267\u7B14\u4EBA\u751F\u6210\u6548\u679C", async (progress) => {
      const skillJson = parseSkillJsonObject(style.skillJson, style);
      progress.update("\u6B63\u5728\u751F\u6210\u6D4B\u8BD5\u6587\u6863", 35);
      const outputs = await skillBuilder.testSkillOnGeneration(style, skillJson, { \u7528\u6237\u6D4B\u8BD5\u4EFB\u52A1: testPrompt });
      progress.update("\u6B63\u5728\u4FDD\u5B58\u6D4B\u8BD5\u62A5\u544A", 86);
      style.lastTest = {
        id: createId(),
        createdAt: now(),
        prompt: testPrompt,
        result: outputs.document,
        report: JSON.stringify(outputs.report, null, 2)
      };
      style.qualityReport = skillBuilder.normalizeSkillQualityReport(style, style.aggregationData || {}, style.qualityReport || {}, outputs.report);
      commitSkillToState(style);
      eventBus.emit(EVENTS.RENDER_SKILL_TEST);
      eventBus.emit(EVENTS.RENDER_SKILL_QUALITY);
      toast(`\u6D4B\u8BD5\u7ED3\u679C\u5DF2\u4FDD\u5B58\u5230\uFF1A${getSkillLocation(ui.editingStyle)} / \u6D4B\u8BD5\u8BB0\u5F55`);
    }));
  }
  function saveSkillFeedback() {
    const style = syncEditingStyleFromInputs();
    const text = els.skillFeedbackInput.value.trim();
    if (!text) {
      toast("\u8BF7\u8F93\u5165\u53CD\u9988\u5185\u5BB9", "warn");
      return;
    }
    style.feedbacks = [
      ...style.feedbacks || [],
      {
        id: createId(),
        text,
        createdAt: now()
      }
    ].slice(-50);
    commitSkillToState(style);
    eventBus.emit(EVENTS.RENDER_SKILL_TEST);
    toast(`\u53CD\u9988\u5DF2\u4FDD\u5B58\u5230\uFF1A${getSkillLocation(ui.editingStyle)} / \u6301\u7EED\u4F18\u5316`);
  }
  function normalizeSkillJsonText(value, style) {
    return skillManager.normalizeSkillJsonText(value, style);
  }
  function parseSkillJsonObject(value, style) {
    return skillManager.parseSkillJsonObject(value, style);
  }
  function saveStyle() {
    return skillManager.saveStyle();
  }
  function commitSkillToState(draft) {
    return skillManager.commitSkillToState(draft);
  }
  function deleteStyle() {
    return skillManager.deleteStyle();
  }
  function saveApiSettings() {
    state.settings = {
      provider: els.providerSelect.value,
      baseUrl: els.baseUrlInput.value.trim().replace(/\/+$/, ""),
      endpointPath: normalizeEndpointPath(els.endpointPathInput.value),
      model: els.modelInput.value.trim(),
      apiKey: els.apiKeyInput.value.trim(),
      systemPrompt: els.systemPromptInput.value.trim() || DEFAULT_SYSTEM_PROMPT
    };
    persist();
    updateAiStatus();
    toast(`\u63A5\u53E3\u914D\u7F6E\u5DF2\u4FDD\u5B58\u5230\uFF1A${getApiSettingsLocation()}`);
  }
  async function testApiSettings() {
    saveApiSettings();
    await withLoading(els.testApiBtn, "\u6D4B\u8BD5\u4E2D", async () => withProgress("\u6B63\u5728\u6D4B\u8BD5 AI \u63A5\u53E3", async (progress) => {
      progress.update("\u6B63\u5728\u53D1\u9001\u8FDE\u901A\u6027\u8BF7\u6C42", 35);
      const reply = await callAiWithRetry([
        { role: "system", content: "\u4F60\u662F\u63A5\u53E3\u8FDE\u901A\u6027\u6D4B\u8BD5\u52A9\u624B\u3002" },
        { role: "user", content: "\u8BF7\u53EA\u56DE\u590D\uFF1A\u8FDE\u63A5\u6B63\u5E38" }
      ]);
      progress.update("\u63A5\u53E3\u5DF2\u8FD4\u56DE\u54CD\u5E94", 90);
      toast(`\u63A5\u53E3\u8FD4\u56DE\uFF1A${reply.slice(0, 40)}`);
    }));
  }
  function clearApiSettings() {
    const ok = window.confirm("\u6E05\u9664\u672C\u673A\u4FDD\u5B58\u7684 AI \u63A5\u53E3\u914D\u7F6E\uFF1F");
    if (!ok) return;
    state.settings = {
      provider: "openai-compatible",
      baseUrl: "",
      endpointPath: "/chat/completions",
      model: "",
      apiKey: "",
      systemPrompt: DEFAULT_SYSTEM_PROMPT
    };
    persist();
    renderApiSettings();
    updateAiStatus();
    toast("\u5DF2\u6E05\u9664\u63A5\u53E3\u914D\u7F6E", "warn");
  }
  function updateAiStatus() {
    const ready = Boolean(state.settings?.baseUrl && state.settings?.model);
    els.aiStatus.textContent = ready ? "\u5DF2\u914D\u7F6E" : "\u672A\u914D\u7F6E";
    els.aiStatus.className = `status-pill ${ready ? "ready" : ""}`;
    els.apiSavedLabel.textContent = ready ? "\u672C\u673A\u5DF2\u4FDD\u5B58" : "\u5F85\u914D\u7F6E";
  }
  async function withLoading(button, text, task) {
    const oldHtml = button.innerHTML;
    button.disabled = true;
    button.textContent = text;
    try {
      return await task();
    } catch (error) {
      toast(friendlyAiErrorMessage2(error) || "\u64CD\u4F5C\u5931\u8D25", "error");
      return null;
    } finally {
      button.disabled = false;
      button.innerHTML = oldHtml;
      if (window.lucide) window.lucide.createIcons();
    }
  }
  async function withProgress(message, task, initialProgress = 8) {
    return progressController.withProgress(message, task, initialProgress);
  }
  function getSelectionOrLine() {
    const editor = els.contentEditor;
    const content = editor.value;
    let start = editor.selectionStart;
    let end = editor.selectionEnd;
    if (start !== end) {
      return { start, end, text: content.slice(start, end) };
    }
    let lineStart = content.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    let lineEnd = content.indexOf("\n", start);
    if (lineEnd === -1) lineEnd = content.length;
    if (!content.slice(lineStart, lineEnd).trim()) {
      const before = content.slice(0, lineStart).trimEnd();
      const after = content.slice(lineEnd).trimStart();
      if (after) {
        const offset = content.indexOf(after, lineEnd);
        lineStart = offset;
        lineEnd = content.indexOf("\n", offset);
        if (lineEnd === -1) lineEnd = content.length;
      } else if (before) {
        lineEnd = before.length;
        lineStart = before.lastIndexOf("\n") + 1;
      }
    }
    return { start: lineStart, end: lineEnd, text: content.slice(lineStart, lineEnd) };
  }
  function switchTab(tabName) {
    const targetPanelId = `${tabName}Panel`;
    if (!document.getElementById(targetPanelId)) return;
    document.querySelectorAll(".tab").forEach((button) => {
      const active = button.dataset.tab === tabName;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === targetPanelId);
    });
    if (window.lucide) window.lucide.createIcons();
  }
  function createEmptyStyle() {
    return skillManager.createEmptyStyle();
  }
  function getCurrentDoc() {
    return documentManager.getCurrentDoc();
  }
  function selectFirstDocumentIfNeeded() {
    return documentManager.selectFirstDocumentIfNeeded();
  }
  function getType(typeId) {
    return DOCUMENT_TYPES.find((type) => type.id === typeId) || DOCUMENT_TYPES[DOCUMENT_TYPES.length - 1];
  }
  function normalizeFolder(folder) {
    return folderManager.normalizeFolder(folder);
  }
  function getFolderById(folderId) {
    return folderManager.getFolderById(folderId);
  }
  function normalizeSkill(style) {
    return skillManager.normalizeSkill(style);
  }
  function resolveInvokedSkills(text, fallbackSkillId) {
    return skillManager.resolveInvokedSkills(text, fallbackSkillId);
  }
  function formatSkillPrompt(skills) {
    return buildSkillPromptForDocumentGeneration(skills);
  }
  function buildSkillPromptForDocumentGeneration(skills) {
    return skillManager.buildSkillPromptForDocumentGeneration(skills);
  }
  function isSkillEnabled(skill) {
    return skillManager.isSkillEnabled(skill);
  }
  function deriveGeneratedTitle(content, prompt) {
    const firstContentLine = String(content || "").split("\n").map((line) => line.trim()).find(Boolean);
    if (firstContentLine && firstContentLine.length <= 48) {
      return firstContentLine.replace(/^#+\s*/, "");
    }
    const firstPromptLine = String(prompt || "").split("\n").map((line) => line.trim()).find(Boolean);
    if (!firstPromptLine) return "AI \u8D77\u8349\u6587\u6863";
    return firstPromptLine.replace(/^请(起草|撰写|写一份)?/, "").slice(0, 32) || "AI \u8D77\u8349\u6587\u6863";
  }
  function createDefaultFolder() {
    return folderManager.createDefaultFolder();
  }
  function persist() {
    state.selectedFolderId = ui.selectedFolderId;
    state.selectedDocId = ui.selectedDocId;
    const snapshot = clone(state);
    ui.persistPromise = ui.persistPromise.catch(() => null).then(async () => {
      await writeWorkspaceState(snapshot);
      writeStorageBootstrap(snapshot);
      localStorage.removeItem(STORAGE_KEY);
    }).catch((error) => {
      console.error("\u4FDD\u5B58\u5DE5\u4F5C\u53F0\u6570\u636E\u5931\u8D25", error);
      tryLocalStorageFallback(snapshot);
    });
  }
  async function hydrateState() {
    const loaded = await loadState();
    Object.assign(state, loaded);
    ui.selectedFolderId = state.selectedFolderId || "all";
    ui.selectedDocId = state.selectedDocId || null;
    if (els.storageLabel) {
      els.storageLabel.textContent = "\u672C\u673A\u6587\u6863\u5E93\uFF08IndexedDB\uFF09";
    }
  }
  async function loadState() {
    try {
      const indexedDbState = await readWorkspaceState();
      if (indexedDbState) return indexedDbState;
    } catch (error) {
      console.warn("\u8BFB\u53D6 IndexedDB \u5DE5\u4F5C\u53F0\u6570\u636E\u5931\u8D25\uFF0C\u5C06\u5C1D\u8BD5\u65E7 localStorage \u6570\u636E", error);
    }
    const legacy = readLegacyLocalStorageState();
    if (legacy) {
      try {
        await writeWorkspaceState(legacy);
        writeStorageBootstrap(legacy);
        localStorage.removeItem(STORAGE_KEY);
      } catch (error) {
        console.warn("\u8FC1\u79FB\u65E7 localStorage \u6570\u636E\u5230 IndexedDB \u5931\u8D25\uFF0C\u6682\u65F6\u7EE7\u7EED\u4F7F\u7528\u65E7\u6570\u636E", error);
      }
      return legacy;
    }
    return {};
  }
  function readLegacyLocalStorageState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  function writeStorageBootstrap(snapshot) {
    try {
      localStorage.setItem(
        STORAGE_BOOTSTRAP_KEY,
        JSON.stringify({
          storage: "indexedDB",
          updatedAt: now(),
          selectedFolderId: snapshot.selectedFolderId || "all",
          selectedDocId: snapshot.selectedDocId || null,
          docCount: Array.isArray(snapshot.docs) ? snapshot.docs.length : 0,
          skillCount: Array.isArray(snapshot.styles) ? snapshot.styles.length : 0
        })
      );
    } catch (error) {
      console.warn("\u5199\u5165\u672C\u673A\u542F\u52A8\u6458\u8981\u5931\u8D25", error);
    }
  }
  function tryLocalStorageFallback(snapshot) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      writeStorageBootstrap({ ...snapshot, storageFallback: "localStorage" });
    } catch (error) {
      toast("\u672C\u673A\u5B58\u50A8\u7A7A\u95F4\u4E0D\u8DB3\uFF0C\u90E8\u5206\u6700\u65B0\u66F4\u6539\u53EF\u80FD\u65E0\u6CD5\u4FDD\u5B58\u3002\u8BF7\u5BFC\u51FA\u5907\u4EFD\u6216\u51CF\u5C11\u5927\u578B\u6837\u672C\u6587\u4EF6\u3002", "error");
    }
  }
  function getStorageRootLocation() {
    return "\u672C\u673A\u6D4F\u89C8\u5668\u5B58\u50A8 / \u6479\u6587\u62DF\u7B14\u5DE5\u4F5C\u53F0";
  }
  function getFolderLocation(folder) {
    if (folder?.kind === "real") {
      return `\u672C\u673A\u771F\u5B9E\u6587\u4EF6\u5939 / ${folder.name || folder.realName || "\u672A\u547D\u540D\u6587\u4EF6\u5939"}\uFF08\u6D4F\u89C8\u5668\u6388\u6743\u76EE\u5F55\uFF09`;
    }
    return `${getStorageRootLocation()} / \u6587\u6863\u5E93 / ${folder?.name || "\u672A\u5F52\u6863"}`;
  }
  function getDocumentLocation(doc) {
    const folder = state.folders.find((item) => item.id === doc?.folderId);
    return `${getFolderLocation(folder)} / ${doc?.title || "\u672A\u547D\u540D\u6587\u6863"}`;
  }
  function getSkillLocation(skill) {
    const handle = normalizeHandle(skill?.handle || skill?.name || "\u672A\u547D\u540D\u6267\u7B14\u4EBA");
    return `${getStorageRootLocation()} / \u6267\u7B14\u4EBA\u5E93 / @${handle}`;
  }
  function getSkillTrainingLocation(skill) {
    return `${getSkillLocation(skill)} / \u8BAD\u7EC3\u6587\u672C`;
  }
  function getApiSettingsLocation() {
    return `${getStorageRootLocation()} / AI\u63A5\u53E3\u914D\u7F6E`;
  }
  function getDownloadLocation(fileName) {
    return `\u6D4F\u89C8\u5668\u4E0B\u8F7D\u76EE\u5F55 / ${fileName}`;
  }
  function downloadBlob(fileName, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
  function toast(message, tone = "info") {
    showToast(els.toastRegion, message, tone);
  }
})();
