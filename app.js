import {
  DEFAULT_STYLE_SKILL,
  DEFAULT_SYSTEM_PROMPT,
  DOCUMENT_TYPES,
  SEARCH_RENDER_DEBOUNCE_MS,
  STORAGE_BOOTSTRAP_KEY,
  STORAGE_KEY,
  folderColors,
} from "./src/config/constants.js";
import {
  readWorkspaceState,
  writeWorkspaceState,
} from "./src/core/storage.js";
import { EVENTS, eventBus } from "./src/core/eventBus.js";
import { createAiClient } from "./src/modules/ai/aiClient.js";
import { createDocumentEditor } from "./src/modules/documents/documentEditor.js";
import { createDocumentManager } from "./src/modules/documents/documentManager.js";
import { createDocumentRenderer } from "./src/modules/documents/documentRenderer.js";
import { createFolderManager } from "./src/modules/folders/folderManager.js";
import { createFolderRenderer } from "./src/modules/folders/folderRenderer.js";
import { createSkillBuilder } from "./src/modules/skills/skillBuilder.js";
import { createSkillManager } from "./src/modules/skills/skillManager.js";
import { createSkillRenderer } from "./src/modules/skills/skillRenderer.js";
import { createProgressController } from "./src/ui/components/progress.js";
import { showToast } from "./src/ui/components/toast.js";
import { initThemeToggle } from "./src/ui/theme.js";
import {
  clone,
  createId,
  escapeHtml,
  now,
  normalizeHandle,
  normalizeEndpointPath,
  sanitizeFileName,
} from "./src/utils/helpers.js";

const state = {};
const ui = {
  selectedFolderId: "all",
  selectedDocId: null,
  editingStyle: null,
  mentionTarget: null,
  mentionRange: null,
  saveTimer: null,
  searchTimer: null,
  persistPromise: Promise.resolve(),
  progressElement: null,
  generatedDraft: "",
};

const els = {};
const aiClient = createAiClient({
  getSettings: () => state.settings || {},
  notify: (message, tone) => toast(message, tone),
});
const {
  callAiWithRetry,
  callAiJsonWithRepair,
  friendlyAiErrorMessage,
} = aiClient;
const progressController = createProgressController({
  getCurrent: () => ui.progressElement,
  setCurrent: (element) => {
    ui.progressElement = element;
  },
});
const folderManager = createFolderManager({
  state,
  ui,
  els,
  persist,
  eventBus,
  getFolderLocation,
  getDocumentLocation,
  toast,
});
const folderRenderer = createFolderRenderer({
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
  onDeleteFolder: deleteFolder,
});
const skillManager = createSkillManager({
  state,
  ui,
  els,
  persist,
  eventBus,
  toast,
  getSkillLocation,
});
const skillBuilder = createSkillBuilder({
  callAiJsonWithRepair,
  getSystemPrompt: () => state.settings?.systemPrompt || DEFAULT_SYSTEM_PROMPT,
  normalizeSkillJsonText: (value, style) => skillManager.normalizeSkillJsonText(value, style),
});
const skillRenderer = createSkillRenderer({
  state,
  ui,
  els,
  createEmptyStyle,
  isSkillEnabled,
  commitSkillToState,
  getSkillLocation,
  toast,
});
const documentRenderer = createDocumentRenderer({
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
  },
});
const documentEditor = createDocumentEditor({
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
  toast,
});
const documentManager = createDocumentManager({
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
  toast,
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
    "toastRegion",
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function initializeMissingData() {
  if (!Array.isArray(state.folders) || state.folders.length === 0) {
    const officeId = createId();
    state.folders = [
      { id: officeId, name: "日常通知", kind: "tag", color: folderColors[0], createdAt: now() },
      { id: createId(), name: "会议材料", kind: "tag", color: folderColors[1], createdAt: now() },
      { id: createId(), name: "请示报告", kind: "tag", color: folderColors[2], createdAt: now() },
    ];
  }
  state.folders = state.folders.map((folder) => normalizeFolder(folder));

  if (!Array.isArray(state.styles) || state.styles.length === 0) {
    state.styles = [
      {
        id: createId(),
        name: "通知写作",
        handle: "通知写作",
        category: "公文写作",
        description: "生成正式、清楚、适合组织内部发布的通知。",
        summary: DEFAULT_STYLE_SKILL,
        skillJson: JSON.stringify(
          {
            name: "通知写作",
            handle: "通知写作",
            applicable_scope: "组织内部通知、工作安排、事项告知等正式文档",
            required_user_inputs: ["主题", "对象", "时间", "地点", "事项安排", "工作要求", "落款信息"],
            document_structure_template: ["标题", "发布对象", "事项背景", "具体安排", "工作要求", "落款日期"],
            style_rules: ["表达正式、清楚、便于执行", "事实不明处使用占位符", "避免口语化和夸张表达"],
            reusable_expressions: ["现将有关事项通知如下", "请各部门结合实际认真落实", "请按时完成相关工作"],
            forbidden: ["不得编造未提供的时间、地点、数据或责任人", "不得泄露样本文档中的个人隐私或敏感信息"],
            generation_steps: ["确认主题和对象", "提取必要事项", "套用通知结构", "检查落款和日期"],
            self_checklist: ["标题是否明确", "事项是否完整", "要求是否可执行", "是否存在未核实信息"],
          },
          null,
          2,
        ),
        examples: [],
        createdAt: now(),
        updatedAt: now(),
      },
    ];
  }
  state.styles = state.styles.map((style) => normalizeSkill(style));
  migrateLegacyBranding();

  if (!Array.isArray(state.docs) || state.docs.length === 0) {
    state.docs = [
      {
        id: createId(),
        title: "专项培训安排通知",
        type: "notice",
        folderId: state.folders[0].id,
        styleId: state.styles[0].id,
        content:
          "关于开展专项培训工作的通知\n\n各相关部门：\n\n为提升工作协同效率，规范业务办理流程，现将专项培训有关事项通知如下：\n\n一、培训时间为2026年5月20日（星期三）上午9:00，地点为会议室A。\n\n二、请各部门安排相关人员准时参加，并提前梳理本部门在实际工作中遇到的重点问题。\n\n三、培训结束后，请各部门于两个工作日内提交学习反馈和后续改进建议。\n\n请各部门高度重视，按要求做好参训组织和材料准备工作。\n\n综合办公室\n2026年5月14日",
        createdAt: now(),
        updatedAt: now(),
      },
    ];
  }

  state.settings = {
    provider: "openai-compatible",
    baseUrl: "",
    endpointPath: "/chat/completions",
    model: "",
    apiKey: "",
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    ...(state.settings || {}),
  };
  if (
    state.settings.systemPrompt ===
    "你是学校办公室文书助手，擅长撰写中文校务、公文、通知、总结、会议纪要和请示材料。输出要准确、稳妥、条理清晰，避免编造事实；缺少信息时用可替换占位表达。"
  ) {
    state.settings.systemPrompt = DEFAULT_SYSTEM_PROMPT;
  }

  ui.editingStyle = clone(state.styles[0]);
  persist();
}

function createDefaultNoticeWriterJson() {
  return JSON.stringify(
    {
      name: "通知写作",
      handle: "通知写作",
      applicable_scope: "组织内部通知、工作安排、事项告知等正式文档",
      required_user_inputs: ["主题", "对象", "时间", "地点", "事项安排", "工作要求", "落款信息"],
      document_structure_template: ["标题", "发布对象", "事项背景", "具体安排", "工作要求", "落款日期"],
      style_rules: ["表达正式、清楚、便于执行", "事实不明处使用占位符", "避免口语化和夸张表达"],
      reusable_expressions: ["现将有关事项通知如下", "请各部门结合实际认真落实", "请按时完成相关工作"],
      forbidden: ["不得编造未提供的时间、地点、数据或责任人", "不得泄露样本文档中的个人隐私或敏感信息"],
      generation_steps: ["确认主题和对象", "提取必要事项", "套用通知结构", "检查落款和日期"],
      self_checklist: ["标题是否明确", "事项是否完整", "要求是否可执行", "是否存在未核实信息"],
    },
    null,
    2,
  );
}

function migrateLegacyBranding() {
  state.styles.forEach((style) => {
    const isLegacyDefault =
      style.name === "学校通知" &&
      style.handle === "学校通知" &&
      (!style.examples || style.examples.length === 0) &&
      (!style.versions || style.versions.length === 0);
    if (!isLegacyDefault) return;
    style.name = "通知写作";
    style.handle = "通知写作";
    style.description = "生成正式、清楚、适合组织内部发布的通知。";
    style.summary = DEFAULT_STYLE_SKILL;
    style.skillJson = createDefaultNoticeWriterJson();
    style.updatedAt = now();
  });

  if (!Array.isArray(state.docs)) return;
  state.docs.forEach((doc) => {
    const content = String(doc.content || "");
    const isLegacyDefaultDoc = doc.title === "新学期工作安排通知" && content.includes("学校办公室");
    if (!isLegacyDefaultDoc) return;
    doc.title = "专项培训安排通知";
    doc.content =
      "关于开展专项培训工作的通知\n\n各相关部门：\n\n为提升工作协同效率，规范业务办理流程，现将专项培训有关事项通知如下：\n\n一、培训时间为2026年5月20日（星期三）上午9:00，地点为会议室A。\n\n二、请各部门安排相关人员准时参加，并提前梳理本部门在实际工作中遇到的重点问题。\n\n三、培训结束后，请各部门于两个工作日内提交学习反馈和后续改进建议。\n\n请各部门高度重视，按要求做好参训组织和材料准备工作。\n\n综合办公室\n2026年5月14日";
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
  els.storageLabel.textContent = `${state.docs.length} 份文档 / ${state.folders.length} 个文件夹`;
  els.storageLabel.title = `存储位置：${getStorageRootLocation()}`;
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

function renderSkillVersions() {
  skillRenderer.renderSkillVersions();
}

function showSkillVersion(index) {
  skillRenderer.showSkillVersion(index);
}

function restoreSkillVersion(index) {
  return skillRenderer.restoreSkillVersion(index);
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

function duplicateCurrentDocument() {
  return documentManager.duplicateCurrentDocument();
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

function saveEditor(showToast) {
  return documentEditor.saveEditor(showToast);
}

function formatCurrentDocument() {
  const editor = els.contentEditor;
  const formatted = editor.value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, "").replace(/^[ \t]+/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
    toast("没有可复制的内容", "warn");
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
  toast("已复制内容");
}

function deleteEditorText() {
  const selection = getSelectionOrLine();
  if (!selection.text) {
    toast("没有可删除的内容", "warn");
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
    toast(`@${skill.handle} 尚未启用`, "warn");
    return;
  }
  insertTextAtCursor(els.contentEditor, `@${skill.handle} `);
  saveEditor(true);
  toast(`已插入 @${skill.handle}`);
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
  const matches = state.styles
    .filter(isSkillEnabled)
    .filter((skill) => {
      const haystack = `${skill.handle} ${skill.name} ${skill.category} ${skill.description || ""}`.toLowerCase();
      return !query || haystack.includes(query);
    })
    .slice(0, 8);
  if (matches.length === 0) {
    hideSkillMentionPanel();
    return;
  }
  ui.mentionTarget = textarea;
  ui.mentionRange = mention;
  els.skillMentionPanel.innerHTML = matches
    .map(
      (skill) => `<button type="button" data-insert-skill="${skill.id}">
        <span class="mention-name">@${escapeHtml(skill.handle)}</span>
        <span>${escapeHtml(skill.name)}</span>
        <small>${escapeHtml(skill.description || skill.category || "自定义执笔人")}</small>
      </button>`,
    )
    .join("");
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
    query: match[1],
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
  textarea.value =
    textarea.value.slice(0, ui.mentionRange.start) + mentionText + textarea.value.slice(ui.mentionRange.end);
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
    toast("请输入查找内容", "warn");
    return;
  }
  const editor = els.contentEditor;
  const content = editor.value;
  let index = content.indexOf(findText, editor.selectionEnd);
  if (index === -1) index = content.indexOf(findText);
  if (index === -1) {
    toast("没有找到匹配内容", "warn");
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
    toast("请输入查找内容", "warn");
    return;
  }
  const editor = els.contentEditor;
  const count = editor.value.split(findText).length - 1;
  if (count === 0) {
    toast("没有找到匹配内容", "warn");
    return;
  }
  editor.value = editor.value.split(findText).join(replacement);
  saveEditor(true);
  toast(`已替换 ${count} 处`);
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
    name: els.styleNameInput.value.trim() || ui.editingStyle.name || "未命名执笔人",
    handle: normalizeHandle(els.skillHandleInput.value || ui.editingStyle.handle || ui.editingStyle.name),
    summary: els.styleSummaryInput.value.trim(),
  };
  const content = skill.summary || `# ${skill.name}\n\n`;
  const fileName = `${sanitizeFileName(skill.name)}-执笔人说明.md`;
  downloadBlob(fileName, content, "text/markdown;charset=utf-8");
  toast(`已导出执笔人说明.md 到：${getDownloadLocation(fileName)}`);
}

function exportSkillJson() {
  const skill = {
    ...ui.editingStyle,
    name: els.styleNameInput.value.trim() || ui.editingStyle.name || "未命名执笔人",
    handle: normalizeHandle(els.skillHandleInput.value || ui.editingStyle.handle || ui.editingStyle.name),
    category: els.skillCategorySelect.value || ui.editingStyle.category || "自定义",
    description: els.skillDescriptionInput.value.trim(),
  };
  const content = normalizeSkillJsonText(els.skillJsonInput.value, skill);
  const fileName = `${sanitizeFileName(skill.name)}-执笔人规则.json`;
  downloadBlob(fileName, content, "application/json;charset=utf-8");
  toast(`已导出执笔人规则 JSON 到：${getDownloadLocation(fileName)}`);
}

async function linkRealFolder() {
  return folderManager.linkRealFolder();
}

async function syncRealFolder(folderId) {
  return folderManager.syncRealFolder(folderId);
}

function openSkillDetail(skillId) {
  return skillRenderer.openSkillDetail(skillId);
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
    toast("请输入起草提示词", "warn");
    return;
  }

  const button = insertIntoCurrent ? els.insertDraftBtn : els.generateDocBtn;
  await withLoading(button, "生成中", async () => withProgress("AI 正在生成文档", async (progress) => {
    progress.update("正在整理提示词", 18);
    const type = getType(docType);
    const invokedSkills = resolveInvokedSkills(userPrompt, els.styleSelect.value);
    const prompt = [
      "请根据用户提示词撰写一份中文正式文档。",
      `当前文档类型参考：${type.name}`,
      `常见结构参考：${type.structure}`,
      formatSkillPrompt(invokedSkills),
      `用户提示词：\n${userPrompt}`,
      "输出要求：严格执行被 @ 调用的执笔人规则；直接给出完整文档内容，不要解释写作过程；标题置于首行；事实不明处使用可替换占位，不要编造。",
    ]
      .filter(Boolean)
      .join("\n\n");
    progress.update("正在请求 AI 生成正文", 42);
    const content = await callAiWithRetry([
      { role: "system", content: state.settings.systemPrompt || DEFAULT_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ]);
    progress.update("正在写入文档", 82);

    if (insertIntoCurrent) {
      const current = getCurrentDoc() || createDocument({ title: deriveGeneratedTitle(content, userPrompt), type: docType });
      const separator = els.contentEditor.value.trim() ? "\n\n" : "";
      els.contentEditor.value = `${els.contentEditor.value}${separator}${content}`;
      saveEditor(true);
      ui.generatedDraft = content;
      toast("已插入到当前文档");
      return current;
    }

    const title = deriveGeneratedTitle(content, userPrompt);
    const newDoc = createDocument({
      title,
      type: docType,
      styleId: invokedSkills[0]?.id || "",
      content,
    });
    ui.generatedDraft = content;
    toast(`已生成新文档到：${getDocumentLocation(newDoc)}`);
    return null;
  }));
}

async function rewriteSelection(triggerButton = null) {
  const selection = getSelectionOrLine();
  if (!selection.text.trim()) {
    toast("请选中或定位到需要重写的段落", "warn");
    return;
  }
  const doc = getCurrentDoc();
  const type = getType(doc?.type || "custom");
  const invokedSkills = resolveInvokedSkills(selection.text, els.styleSelect.value);
  const runner = async () => {
    await withProgress("AI 正在重写段落", async (progress) => {
      progress.update("正在整理段落要求", 20);
      const prompt = [
      "请重写下面这段正式文档内容。",
      `文档类型：${type.name}`,
      formatSkillPrompt(invokedSkills),
      "要求：保留事实信息，不新增未提供的数据；表达更规范、清楚、正式；只输出重写后的段落。",
      `原段落：\n${selection.text}`,
    ]
      .filter(Boolean)
      .join("\n\n");
      progress.update("正在请求 AI 改写", 45);
      const rewritten = await callAiWithRetry([
      { role: "system", content: state.settings.systemPrompt || DEFAULT_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ]);
      progress.update("正在替换选中段落", 85);
      const content = els.contentEditor.value;
      els.contentEditor.value = content.slice(0, selection.start) + rewritten + content.slice(selection.end);
      els.contentEditor.focus();
      els.contentEditor.setSelectionRange(selection.start, selection.start + rewritten.length);
      saveEditor(true);
      toast("段落已重写");
    });
  };
  if (triggerButton) {
    await withLoading(triggerButton, "重写中", runner);
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
      addedAt: now(),
    });
  }
  renderStyleExamples();
  toast(`已添加 ${files.length} 份示范到：${getSkillTrainingLocation(ui.editingStyle)}`);
}

async function summarizeStyle() {
  const style = syncEditingStyleFromInputs();
  if (!style.name.trim()) {
    toast("请输入执笔人名称", "warn");
    return;
  }
  if (!style.examples || style.examples.length === 0) {
    toast("请先添加示范文件", "warn");
    return;
  }
  if (style.examples.length < 2) {
    const ok = window.confirm("只有 1 篇示范只能生成不稳定草案，建议至少 3-5 篇。是否继续生成草案？");
    if (!ok) return;
  }

  await withLoading(els.summarizeStyleBtn, "生成中", async () => withProgress("正在构建多文档执笔人", async (progress) => {
    const outputs = await skillBuilder.buildSkillWithAiChain(style, progress);
    const version = skillBuilder.createSkillVersion(style, outputs);
    progress.update("正在保存执笔人版本", 92);
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
      prompt: "AI 自动生成的执笔人测试",
      result: outputs.testDoc,
      report: outputs.testReport,
    };
    style.versions = [...(style.versions || []), version].slice(-30);
    commitSkillToState(style);
    eventBus.emit(EVENTS.RENDER_STYLE_EDITOR);
    switchSkillDetailTab("workflow");
    toast(`已生成 v${version.version} 并保存到：${getSkillLocation(ui.editingStyle)}`);
  }));
}

function syncEditingStyleFromInputs() {
  return skillManager.syncEditingStyleFromInputs();
}

async function runSkillGenerationTest() {
  const style = syncEditingStyleFromInputs();
  const testPrompt = els.skillTestPrompt.value.trim();
  if (!style.skillJson.trim()) {
    toast("请先生成或填写执笔人规则 JSON", "warn");
    return;
  }
  if (!testPrompt) {
    toast("请输入测试起草任务", "warn");
    return;
  }

  await withLoading(els.runSkillTestBtn, "测试中", async () => withProgress("正在测试执笔人生成效果", async (progress) => {
    const skillJson = parseSkillJsonObject(style.skillJson, style);
    progress.update("正在生成测试文档", 35);
    const outputs = await skillBuilder.testSkillOnGeneration(style, skillJson, { 用户测试任务: testPrompt });
    progress.update("正在保存测试报告", 86);
    style.lastTest = {
      id: createId(),
      createdAt: now(),
      prompt: testPrompt,
      result: outputs.document,
      report: JSON.stringify(outputs.report, null, 2),
    };
    style.qualityReport = skillBuilder.normalizeSkillQualityReport(style, style.aggregationData || {}, style.qualityReport || {}, outputs.report);
    commitSkillToState(style);
    eventBus.emit(EVENTS.RENDER_SKILL_TEST);
    eventBus.emit(EVENTS.RENDER_SKILL_QUALITY);
    toast(`测试结果已保存到：${getSkillLocation(ui.editingStyle)} / 测试记录`);
  }));
}

function saveSkillFeedback() {
  const style = syncEditingStyleFromInputs();
  const text = els.skillFeedbackInput.value.trim();
  if (!text) {
    toast("请输入反馈内容", "warn");
    return;
  }
  style.feedbacks = [
    ...(style.feedbacks || []),
    {
      id: createId(),
      text,
      createdAt: now(),
    },
  ].slice(-50);
  commitSkillToState(style);
  eventBus.emit(EVENTS.RENDER_SKILL_TEST);
  toast(`反馈已保存到：${getSkillLocation(ui.editingStyle)} / 持续优化`);
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
    systemPrompt: els.systemPromptInput.value.trim() || DEFAULT_SYSTEM_PROMPT,
  };
  persist();
  updateAiStatus();
  toast(`接口配置已保存到：${getApiSettingsLocation()}`);
}

async function testApiSettings() {
  saveApiSettings();
  await withLoading(els.testApiBtn, "测试中", async () => withProgress("正在测试 AI 接口", async (progress) => {
    progress.update("正在发送连通性请求", 35);
    const reply = await callAiWithRetry([
      { role: "system", content: "你是接口连通性测试助手。" },
      { role: "user", content: "请只回复：连接正常" },
    ]);
    progress.update("接口已返回响应", 90);
    toast(`接口返回：${reply.slice(0, 40)}`);
  }));
}

function clearApiSettings() {
  const ok = window.confirm("清除本机保存的 AI 接口配置？");
  if (!ok) return;
  state.settings = {
    provider: "openai-compatible",
    baseUrl: "",
    endpointPath: "/chat/completions",
    model: "",
    apiKey: "",
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
  };
  persist();
  renderApiSettings();
  updateAiStatus();
  toast("已清除接口配置", "warn");
}

function updateAiStatus() {
  const ready = Boolean(state.settings?.baseUrl && state.settings?.model);
  els.aiStatus.textContent = ready ? "已配置" : "未配置";
  els.aiStatus.className = `status-pill ${ready ? "ready" : ""}`;
  els.apiSavedLabel.textContent = ready ? "本机已保存" : "待配置";
}

async function withLoading(button, text, task) {
  const oldHtml = button.innerHTML;
  button.disabled = true;
  button.textContent = text;
  try {
    return await task();
  } catch (error) {
    toast(friendlyAiErrorMessage(error) || "操作失败", "error");
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

function synthesizeSkillJson(style) {
  return skillManager.synthesizeSkillJson(style);
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
  const firstContentLine = String(content || "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (firstContentLine && firstContentLine.length <= 48) {
    return firstContentLine.replace(/^#+\s*/, "");
  }
  const firstPromptLine = String(prompt || "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstPromptLine) return "AI 起草文档";
  return firstPromptLine.replace(/^请(起草|撰写|写一份)?/, "").slice(0, 32) || "AI 起草文档";
}

function createDefaultFolder() {
  return folderManager.createDefaultFolder();
}

function persist() {
  state.selectedFolderId = ui.selectedFolderId;
  state.selectedDocId = ui.selectedDocId;
  const snapshot = clone(state);
  ui.persistPromise = ui.persistPromise
    .catch(() => null)
    .then(async () => {
      await writeWorkspaceState(snapshot);
      writeStorageBootstrap(snapshot);
      localStorage.removeItem(STORAGE_KEY);
    })
    .catch((error) => {
      console.error("保存工作台数据失败", error);
      tryLocalStorageFallback(snapshot);
    });
}

async function hydrateState() {
  const loaded = await loadState();
  Object.assign(state, loaded);
  ui.selectedFolderId = state.selectedFolderId || "all";
  ui.selectedDocId = state.selectedDocId || null;
  if (els.storageLabel) {
    els.storageLabel.textContent = "本机文档库（IndexedDB）";
  }
}

async function loadState() {
  try {
    const indexedDbState = await readWorkspaceState();
    if (indexedDbState) return indexedDbState;
  } catch (error) {
    console.warn("读取 IndexedDB 工作台数据失败，将尝试旧 localStorage 数据", error);
  }

  const legacy = readLegacyLocalStorageState();
  if (legacy) {
    try {
      await writeWorkspaceState(legacy);
      writeStorageBootstrap(legacy);
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn("迁移旧 localStorage 数据到 IndexedDB 失败，暂时继续使用旧数据", error);
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
        skillCount: Array.isArray(snapshot.styles) ? snapshot.styles.length : 0,
      }),
    );
  } catch (error) {
    console.warn("写入本机启动摘要失败", error);
  }
}

function tryLocalStorageFallback(snapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    writeStorageBootstrap({ ...snapshot, storageFallback: "localStorage" });
  } catch (error) {
    toast("本机存储空间不足，部分最新更改可能无法保存。请导出备份或减少大型样本文件。", "error");
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
  const folder = state.folders.find((item) => item.id === doc?.folderId);
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
