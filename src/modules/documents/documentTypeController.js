import { EVENTS } from "../../core/eventBus.js";
import { DOCUMENT_TYPES } from "../../config/constants.js";
import { createId, escapeHtml, now } from "../../utils/helpers.js";

const DEFAULT_CUSTOM_TYPE_STRUCTURE = "按该自定义类型的写作场景组织结构，保持表达清晰规范";
const FALLBACK_CUSTOM_TYPE_STRUCTURE = "按输入要点组织结构，保持表达清晰规范";

export function normalizeCustomType(type, options = {}) {
  const builtInTypes = options.builtInTypes || DOCUMENT_TYPES;
  const makeId = options.createId || createId;
  const getNow = options.now || now;
  const name = String(type?.name || "").trim();
  if (!name) return null;
  const id = String(type?.id || "").trim();
  const safeId = id && !builtInTypes.some((item) => item.id === id) ? id : `custom-type-${makeId()}`;
  return {
    id: safeId,
    name: name.slice(0, 24),
    structure: String(type?.structure || DEFAULT_CUSTOM_TYPE_STRUCTURE).trim(),
    createdAt: type?.createdAt || getNow(),
    updatedAt: type?.updatedAt || getNow(),
  };
}

export function normalizeCustomTypes(types, options = {}) {
  const builtInTypes = options.builtInTypes || DOCUMENT_TYPES;
  const makeId = options.createId || createId;
  const usedIds = new Set(builtInTypes.map((type) => type.id));
  return (Array.isArray(types) ? types : [])
    .map((type) => normalizeCustomType(type, { ...options, createId: makeId }))
    .filter(Boolean)
    .map((type) => {
      while (usedIds.has(type.id)) {
        type.id = `custom-type-${makeId()}`;
      }
      usedIds.add(type.id);
      return type;
    });
}

export function createDocumentTypeController(deps = {}) {
  const {
    state = {},
    els = {},
    toast = () => {},
    saveEditor = () => {},
    queueEditorSave = () => {},
    persist = () => {},
    eventBus = { emit: () => {} },
    getCurrentDoc = () => null,
    windowRef = globalThis.window,
  } = deps;
  let eventsBound = false;

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;
    els.typeSelect?.addEventListener("change", () => {
      updateTypeControlState();
      queueEditorSave();
    });
    els.addTypeBtn?.addEventListener("click", addCustomType);
    els.renameTypeBtn?.addEventListener("click", renameCustomType);
    els.deleteTypeBtn?.addEventListener("click", deleteCustomType);
  }

  function ensureCustomTypes() {
    state.customTypes = Array.isArray(state.customTypes) ? state.customTypes : [];
    return state.customTypes;
  }

  function getDocumentTypes() {
    return [...DOCUMENT_TYPES, ...ensureCustomTypes()];
  }

  function getType(typeId) {
    return getDocumentTypes().find((type) => type.id === typeId) || DOCUMENT_TYPES[DOCUMENT_TYPES.length - 1];
  }

  function renderTypeSelect(selectedValue = els.typeSelect?.value || getCurrentDoc()?.type || "notice") {
    if (!els.typeSelect) return;
    const builtInOptions = DOCUMENT_TYPES.map(
      (type) => `<option value="${escapeHtml(type.id)}">${escapeHtml(type.name)}</option>`,
    ).join("");
    const customOptions = ensureCustomTypes()
      .map((type) => `<option value="${escapeHtml(type.id)}">${escapeHtml(type.name)}</option>`)
      .join("");

    els.typeSelect.innerHTML = [
      `<optgroup label="内置类型">${builtInOptions}</optgroup>`,
      customOptions ? `<optgroup label="自定义类型">${customOptions}</optgroup>` : "",
    ].join("");

    const nextValue = getDocumentTypes().some((type) => type.id === selectedValue) ? selectedValue : "custom";
    els.typeSelect.value = nextValue;
    updateTypeControlState();
  }

  function updateTypeControlState() {
    if (!els.typeSelect || !els.customTypeActions) return;
    const typeId = els.typeSelect.value;
    const isActualCustomType = isCustomDocumentType(typeId);
    const showCustomActions = typeId === "custom" || isActualCustomType;
    els.customTypeActions.hidden = !showCustomActions;
    if (els.renameTypeBtn) {
      els.renameTypeBtn.disabled = !isActualCustomType;
      els.renameTypeBtn.title = isActualCustomType ? "重命名自定义类型" : "先添加或选择一个自定义类型";
    }
    if (els.deleteTypeBtn) {
      els.deleteTypeBtn.disabled = !isActualCustomType;
      els.deleteTypeBtn.title = isActualCustomType ? "删除自定义类型" : "先添加或选择一个自定义类型";
    }
  }

  function isCustomDocumentType(typeId) {
    return ensureCustomTypes().some((type) => type.id === typeId);
  }

  function addCustomType() {
    const name = windowRef?.prompt?.("新增文档类型名称，例如：调研报告、活动复盘、制度说明");
    const normalizedName = String(name || "").trim();
    if (!normalizedName) return null;
    if (getDocumentTypes().some((type) => type.name === normalizedName)) {
      toast(`文档类型“${normalizedName}”已存在`, "warn");
      return null;
    }
    const structureInput = windowRef?.prompt?.(
      "该类型的常见结构，可留空",
      "按背景、目标、重点内容、安排要求、落款组织结构",
    );
    if (structureInput === null) return null;
    const type = normalizeCustomType({
      name: normalizedName,
      structure: String(structureInput || FALLBACK_CUSTOM_TYPE_STRUCTURE).trim(),
    });
    if (!type) return null;
    ensureCustomTypes().push(type);
    renderTypeSelect(type.id);
    saveEditor(false);
    persist();
    eventBus.emit(EVENTS.RENDER_DOC_LIST);
    toast(`已新增文档类型：${type.name}`);
    return type;
  }

  function renameCustomType() {
    const type = ensureCustomTypes().find((item) => item.id === els.typeSelect?.value);
    if (!type) {
      toast("请先选择一个已添加的自定义类型", "warn");
      return null;
    }
    const name = windowRef?.prompt?.("重命名文档类型", type.name);
    const normalizedName = String(name || "").trim();
    if (!normalizedName) return null;
    if (getDocumentTypes().some((item) => item.id !== type.id && item.name === normalizedName)) {
      toast(`文档类型“${normalizedName}”已存在`, "warn");
      return null;
    }
    const structureInput = windowRef?.prompt?.("更新该类型的常见结构，可留空", type.structure);
    if (structureInput === null) return null;
    type.name = normalizedName.slice(0, 24);
    type.structure = String(structureInput || FALLBACK_CUSTOM_TYPE_STRUCTURE).trim();
    type.updatedAt = now();
    persist();
    renderTypeSelect(type.id);
    eventBus.emit(EVENTS.RENDER_DOC_LIST);
    toast(`已更新文档类型：${type.name}`);
    return type;
  }

  function deleteCustomType() {
    const type = ensureCustomTypes().find((item) => item.id === els.typeSelect?.value);
    if (!type) {
      toast("请先选择一个已添加的自定义类型", "warn");
      return false;
    }
    const affectedCount = Array.isArray(state.docs) ? state.docs.filter((doc) => doc.type === type.id).length : 0;
    const ok = windowRef?.confirm?.(
      affectedCount
        ? `删除自定义类型“${type.name}”？${affectedCount} 份文档会改为“自定义”。`
        : `删除自定义类型“${type.name}”？`,
    );
    if (!ok) return false;
    state.customTypes = ensureCustomTypes().filter((item) => item.id !== type.id);
    (Array.isArray(state.docs) ? state.docs : []).forEach((doc) => {
      if (doc.type === type.id) doc.type = "custom";
    });
    renderTypeSelect("custom");
    saveEditor(false);
    persist();
    eventBus.emit(EVENTS.RENDER_ALL);
    toast(`已删除文档类型：${type.name}`, "warn");
    return true;
  }

  return {
    bindEvents,
    normalizeCustomTypes: (types) => normalizeCustomTypes(types),
    getDocumentTypes,
    getType,
    renderTypeSelect,
    updateTypeControlState,
    isCustomDocumentType,
    addCustomType,
    renameCustomType,
    deleteCustomType,
  };
}
