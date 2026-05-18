import {
  DEFAULT_STYLE_SKILL,
  DEFAULT_SYSTEM_PROMPT,
  DOCUMENT_TYPES,
  SEARCH_RENDER_DEBOUNCE_MS,
  folderColors,
} from "./src/config/constants.js";
import {
  readWorkspaceState,
  writeWorkspaceState,
} from "./src/core/storage.js";
import {
  clearLegacyLocalStorageState,
  readLegacyLocalStorageState,
  readStorageBootstrap,
  shouldPreferLocalStorageFallback,
  writeLegacyLocalStorageState,
  writeStorageBootstrap,
} from "./src/core/storageBootstrap.js";
import { EVENTS, eventBus } from "./src/core/eventBus.js";
import { createAiClient } from "./src/modules/ai/aiClient.js";
import { createDocumentEditor } from "./src/modules/documents/documentEditor.js";
import { createDocumentManager } from "./src/modules/documents/documentManager.js";
import { createDocumentRenderer } from "./src/modules/documents/documentRenderer.js";
import { createBrowserFileSystemAdapter } from "./src/modules/folders/fileSystemAdapter.js";
import { createFolderManager } from "./src/modules/folders/folderManager.js";
import { createFolderRenderer } from "./src/modules/folders/folderRenderer.js";
import {
  buildGuizangPptPrompt,
  formatPptQualityReport,
  inspectPptSpec,
  normalizePptSpec,
  parseGuizangPptSpec,
  PPT_STYLE_OPTIONS,
  renderPptSpecPreview,
} from "./src/modules/ppt/guizangPpt.js";
import { createPptxBlob } from "./src/modules/ppt/pptxBuilder.js";
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
import { buildUnsupportedFileMessage, canImportFile, readImportFileText } from "./src/utils/fileReaders.js";
import { isFileDragData } from "./src/utils/dragDrop.js";
import { getDropImportTarget } from "./src/utils/dropRouting.js";
import { filterImportableFilesBySize } from "./src/utils/importGuards.js";

const state = {};
const ui = {
  selectedFolderId: "all",
  selectedDocId: null,
  editingStyle: null,
  mentionTarget: null,
  mentionRange: null,
  saveTimer: null,
  saveStatusTimer: null,
  searchTimer: null,
  editorUndoStack: [],
  editorUndoInputActive: false,
  editorUndoInputTimer: null,
  editorUndoLocked: false,
  persistPromise: Promise.resolve(),
  progressElement: null,
  generatedDraft: "",
  pptDraft: "",
  pptDeckSpec: null,
};

const els = {};
const WORKSPACE_LAYOUT_KEY = "mowen-nibi-workbench:workspace-layout";
const DEFAULT_WORKSPACE_LAYOUT = { sidebar: 284, inspector: 360 };
const EDITOR_UNDO_LIMIT = 80;
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
  fileSystem: createBrowserFileSystemAdapter(),
  confirmLargeImport,
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
  showSaveStatus,
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
  confirmLargeImport,
  withImportProgress: withProgress,
});

document.addEventListener("DOMContentLoaded", async () => {
  bindElements();
  bindEventBus();
  await hydrateState();
  initializeMissingData();
  bindEvents();
  initThemeToggle(els.themeToggle);
  hydrateStaticSelects();
  restoreWorkspaceLayout();
  setupWorkspaceResizers();
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
    "workspace",
    "leftWorkspaceResizer",
    "rightWorkspaceResizer",
    "themeToggle",
    "newDocBtn",
    "importInput",
    "exportDocBtn",
    "backupBtn",
    "apiTopBtn",
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
    "customTypeActions",
    "addTypeBtn",
    "renameTypeBtn",
    "deleteTypeBtn",
    "folderSelect",
    "styleSelect",
    "saveDocBtn",
    "undoEditBtn",
    "saveState",
    "replaceToggleBtn",
    "replaceBar",
    "findInput",
    "replaceInput",
    "findNextBtn",
    "replaceNextBtn",
    "replaceAllBtn",
    "contentEditor",
    "editorMenu",
    "editorSkillSelect",
    "aiStatus",
    "generatePanel",
    "generatePrompt",
    "skillMentionPanel",
    "generateDocBtn",
    "overwriteDraftBtn",
    "insertDraftBtn",
    "pptPanel",
    "pptTitleInput",
    "pptStyleSelect",
    "pptSlideCountSelect",
    "pptAutoSlideCountInput",
    "pptCustomStyleField",
    "pptCustomStyleInput",
    "pptPromptInput",
    "pptDropZone",
    "generatePptBtn",
    "downloadPptBtn",
    "savePptStyleBtn",
    "pptOutput",
    "pptQualityStatus",
    "pptQualityReport",
    "pptPreview",
    "openPptPreviewBtn",
    "pptPreviewOverlay",
    "closePptPreviewBtn",
    "pptPreviewModalFrame",
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
  state.customTypes = Array.isArray(state.customTypes)
    ? state.customTypes.map((type) => normalizeCustomType(type)).filter(Boolean)
    : [];

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
  els.apiTopBtn.addEventListener("click", () => switchTab("api"));
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
  els.contentEditor.addEventListener("beforeinput", queueEditorUndoSnapshot);
  els.typeSelect.addEventListener("change", () => {
    updateTypeControlState();
    queueEditorSave();
  });
  els.addTypeBtn.addEventListener("click", addCustomType);
  els.renameTypeBtn.addEventListener("click", renameCustomType);
  els.deleteTypeBtn.addEventListener("click", deleteCustomType);
  els.folderSelect.addEventListener("change", queueEditorSave);
  els.styleSelect.addEventListener("change", queueEditorSave);
  els.saveDocBtn.addEventListener("click", () => saveEditor(true));
  els.undoEditBtn.addEventListener("click", undoEditorChange);
  els.replaceToggleBtn.addEventListener("click", toggleReplaceBar);
  els.findNextBtn.addEventListener("click", findNext);
  els.replaceNextBtn.addEventListener("click", replaceNext);
  els.replaceAllBtn.addEventListener("click", replaceAll);
  els.findInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    findNext();
  });
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

  els.generateDocBtn.addEventListener("click", () => generateDocument("new"));
  els.overwriteDraftBtn.addEventListener("click", () => generateDocument("overwrite"));
  els.insertDraftBtn.addEventListener("click", () => generateDocument("insert"));
  setupDocumentDrop(els.generatePanel, appendDocumentToGeneratePrompt);
  setupDocumentDrop(els.generatePrompt, appendDocumentToGeneratePrompt);
  setupFileDrop(els.pptPanel, importPptPromptFiles);
  setupFileDrop(els.pptPromptInput, importPptPromptFiles);
  setupFileDrop(els.pptDropZone, importPptPromptFiles);
  els.generatePptBtn.addEventListener("click", generatePptDeck);
  els.downloadPptBtn.addEventListener("click", downloadPptDeck);
  els.savePptStyleBtn.addEventListener("click", savePptStyleAsSkill);
  els.pptStyleSelect.addEventListener("change", updatePptStyleControls);
  els.pptSlideCountSelect.addEventListener("input", () => {
    if (ui.pptDeckSpec) renderPptQualityReport(ui.pptDeckSpec);
  });
  els.pptAutoSlideCountInput.addEventListener("change", () => {
    updatePptSlideCountControls();
    if (ui.pptDeckSpec) renderPptQualityReport(ui.pptDeckSpec);
  });
  els.pptOutput.addEventListener("input", () => {
    ui.pptDraft = els.pptOutput.value;
    try {
      ui.pptDeckSpec = parseGuizangPptSpec(ui.pptDraft, {
        title: els.pptTitleInput.value.trim(),
        ...getPptOptions(),
      });
      renderPptPreview(ui.pptDeckSpec);
      renderPptQualityReport(ui.pptDeckSpec);
    } catch {
      // Allow users to keep editing partial JSON without interrupting input.
    }
  });
  els.openPptPreviewBtn.addEventListener("click", openPptPreviewModal);
  els.closePptPreviewBtn.addEventListener("click", closePptPreviewModal);
  els.pptPreviewOverlay.addEventListener("click", (event) => {
    if (event.target === els.pptPreviewOverlay) closePptPreviewModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.pptPreviewOverlay && !els.pptPreviewOverlay.hidden) {
      closePptPreviewModal();
    }
  });
  updatePptStyleControls();
  updatePptSlideCountControls();

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

function setupDocumentDrop(target, handler) {
  if (!target) return;
  ["dragenter", "dragover"].forEach((eventName) => {
    target.addEventListener(eventName, (event) => {
      if (!isDocumentDrag(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      target.classList.add("drag-over");
    });
  });
  ["dragleave", "dragend"].forEach((eventName) => {
    target.addEventListener(eventName, () => target.classList.remove("drag-over"));
  });
  target.addEventListener("drop", (event) => {
    if (!isDocumentDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    target.classList.remove("drag-over");
    const docId = event.dataTransfer?.getData("application/x-mowen-doc-id");
    if (docId) handler(docId);
  });
}

function restoreWorkspaceLayout() {
  const layout = readWorkspaceLayout();
  applyWorkspaceLayout(layout);
}

function setupWorkspaceResizers() {
  setupWorkspaceResizer(els.leftWorkspaceResizer, "left");
  setupWorkspaceResizer(els.rightWorkspaceResizer, "right");
}

function setupWorkspaceResizer(handle, side) {
  if (!handle || !els.workspace) return;
  handle.addEventListener("pointerdown", (event) => {
    if (window.matchMedia("(max-width: 1180px)").matches) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    handle.classList.add("dragging");
    const startX = event.clientX;
    const startLayout = readWorkspaceLayout();
    const onPointerMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextLayout = resizeWorkspaceLayout(startLayout, side, delta);
      applyWorkspaceLayout(nextLayout);
    };
    const onPointerUp = () => {
      handle.classList.remove("dragging");
      const nextLayout = readWorkspaceLayoutFromCss();
      saveWorkspaceLayout(nextLayout);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  });
  handle.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 24 : -24;
    const layout = resizeWorkspaceLayout(readWorkspaceLayout(), side, delta);
    applyWorkspaceLayout(layout);
    saveWorkspaceLayout(layout);
  });
}

function resizeWorkspaceLayout(layout, side, delta) {
  if (side === "left") return normalizeWorkspaceLayout({ ...layout, sidebar: layout.sidebar + delta });
  return normalizeWorkspaceLayout({ ...layout, inspector: layout.inspector - delta });
}

function readWorkspaceLayout() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WORKSPACE_LAYOUT_KEY) || "null");
    return normalizeWorkspaceLayout({ ...DEFAULT_WORKSPACE_LAYOUT, ...parsed });
  } catch {
    return normalizeWorkspaceLayout(DEFAULT_WORKSPACE_LAYOUT);
  }
}

function readWorkspaceLayoutFromCss() {
  const styles = getComputedStyle(document.documentElement);
  return normalizeWorkspaceLayout({
    sidebar: Number.parseInt(styles.getPropertyValue("--sidebar-w"), 10),
    inspector: Number.parseInt(styles.getPropertyValue("--inspector-w"), 10),
  });
}

function saveWorkspaceLayout(layout) {
  try {
    localStorage.setItem(WORKSPACE_LAYOUT_KEY, JSON.stringify(normalizeWorkspaceLayout(layout)));
  } catch {
    // Layout preferences are optional; ignore storage failures.
  }
}

function applyWorkspaceLayout(layout) {
  const normalized = normalizeWorkspaceLayout(layout);
  document.documentElement.style.setProperty("--sidebar-w", `${normalized.sidebar}px`);
  document.documentElement.style.setProperty("--inspector-w", `${normalized.inspector}px`);
}

function normalizeWorkspaceLayout(layout) {
  const workspaceWidth = els.workspace?.clientWidth || window.innerWidth || 1280;
  const handleWidth = 16;
  const minEditor = 420;
  const sidebar = clampNumber(layout.sidebar, 220, Math.min(440, workspaceWidth - 300 - minEditor - handleWidth));
  const inspector = clampNumber(layout.inspector, 300, Math.min(560, workspaceWidth - sidebar - minEditor - handleWidth));
  return { sidebar, inspector };
}

function clampNumber(value, min, max) {
  const finiteValue = Number.isFinite(value) ? value : min;
  const safeMax = Math.max(min, max);
  return Math.min(Math.max(finiteValue, min), safeMax);
}

function preventWindowFileNavigation() {
  ["dragover", "drop"].forEach((eventName) => {
    window.addEventListener(eventName, async (event) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      if (eventName !== "drop") return;
      const files = Array.from(event.dataTransfer?.files || []);
      if (files.length === 0) return;
      await importFilesFromGlobalDrop(files);
    });
  });
}

function isFileDrag(event) {
  return isFileDragData(event.dataTransfer);
}

function isDocumentDrag(event) {
  return Array.from(event.dataTransfer?.types || []).includes("application/x-mowen-doc-id");
}

async function importFilesFromGlobalDrop(files) {
  const target = getDropImportTarget(document.querySelector(".tab-panel.active")?.id || "");
  if (target === "ppt") {
    await importPptPromptFiles(files);
    return;
  }
  if (target === "style") {
    await importStyleExampleFiles(files);
    return;
  }
  await importDocumentFiles(files);
}

function hydrateStaticSelects() {
  renderTypeSelect();
  hydratePptStyleSelect();
}

function getDocumentTypes() {
  return [...DOCUMENT_TYPES, ...(Array.isArray(state.customTypes) ? state.customTypes : [])];
}

function renderTypeSelect(selectedValue = els.typeSelect?.value || getCurrentDoc()?.type || "notice") {
  if (!els.typeSelect) return;
  const builtInOptions = DOCUMENT_TYPES.map(
    (type) => `<option value="${escapeHtml(type.id)}">${escapeHtml(type.name)}</option>`,
  ).join("");
  const customTypes = Array.isArray(state.customTypes) ? state.customTypes : [];
  const customOptions = customTypes
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

function hydratePptStyleSelect() {
  if (!els.pptStyleSelect) return;
  const current = els.pptStyleSelect.value || "magazine";
  const groups = [...new Set(PPT_STYLE_OPTIONS.map((option) => option.group))];
  els.pptStyleSelect.innerHTML = groups
    .map((group) => {
      const options = PPT_STYLE_OPTIONS.filter((option) => option.group === group)
        .map(
          (option) =>
            `<option value="${option.id}" title="${escapeHtml(option.description)}">${escapeHtml(option.name)}</option>`,
        )
        .join("");
      return `<optgroup label="${escapeHtml(group)}">${options}</optgroup>`;
    })
    .join("");
  els.pptStyleSelect.value = PPT_STYLE_OPTIONS.some((option) => option.id === current) ? current : "magazine";
  updatePptStyleControls();
}

function render() {
  renderFolders();
  renderFolderSelect();
  renderStyleSelect();
  renderDocList();
  renderTypeSelect();
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
  resetEditorUndoHistory();
  hideSaveStatus();
  updateTypeControlState();
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

function showSaveStatus(message, options = {}) {
  if (!els.saveState) return;
  window.clearTimeout(ui.saveStatusTimer);
  els.saveState.textContent = message || "";
  if (options.title) els.saveState.title = options.title;
  els.saveState.classList.toggle("visible", Boolean(message));
  if (options.transient) {
    ui.saveStatusTimer = window.setTimeout(hideSaveStatus, options.duration || 1800);
  }
}

function hideSaveStatus() {
  if (!els.saveState) return;
  window.clearTimeout(ui.saveStatusTimer);
  els.saveState.classList.remove("visible");
}

function resetEditorUndoHistory() {
  window.clearTimeout(ui.editorUndoInputTimer);
  ui.editorUndoStack = [];
  ui.editorUndoInputActive = false;
  updateUndoButtonState();
}

function queueEditorUndoSnapshot() {
  if (ui.editorUndoLocked) return;
  if (!ui.editorUndoInputActive) {
    pushEditorUndoSnapshot(createEditorUndoSnapshot());
    ui.editorUndoInputActive = true;
  }
  window.clearTimeout(ui.editorUndoInputTimer);
  ui.editorUndoInputTimer = window.setTimeout(() => {
    ui.editorUndoInputActive = false;
  }, 900);
}

function createEditorUndoSnapshot() {
  const editor = els.contentEditor;
  return {
    value: editor.value,
    selectionStart: editor.selectionStart || 0,
    selectionEnd: editor.selectionEnd || editor.selectionStart || 0,
    scrollTop: editor.scrollTop || 0,
  };
}

function pushEditorUndoSnapshot(snapshot = createEditorUndoSnapshot()) {
  const previous = ui.editorUndoStack[ui.editorUndoStack.length - 1];
  if (previous?.value === snapshot.value) return;
  ui.editorUndoStack.push(snapshot);
  if (ui.editorUndoStack.length > EDITOR_UNDO_LIMIT) {
    ui.editorUndoStack.splice(0, ui.editorUndoStack.length - EDITOR_UNDO_LIMIT);
  }
  updateUndoButtonState();
}

function recordEditorUndoPoint() {
  if (ui.editorUndoLocked) return;
  window.clearTimeout(ui.editorUndoInputTimer);
  ui.editorUndoInputActive = false;
  pushEditorUndoSnapshot(createEditorUndoSnapshot());
}

function undoEditorChange() {
  const snapshot = ui.editorUndoStack.pop();
  if (!snapshot) {
    toast("没有可撤销的正文编辑", "warn");
    updateUndoButtonState();
    return;
  }
  ui.editorUndoLocked = true;
  els.contentEditor.value = snapshot.value;
  els.contentEditor.focus();
  const start = Math.min(snapshot.selectionStart, snapshot.value.length);
  const end = Math.min(snapshot.selectionEnd, snapshot.value.length);
  els.contentEditor.setSelectionRange(start, end);
  els.contentEditor.scrollTop = snapshot.scrollTop;
  window.clearTimeout(ui.saveTimer);
  saveEditor(false);
  showSaveStatus("已撤销", { transient: true });
  ui.editorUndoLocked = false;
  updateUndoButtonState();
}

function updateUndoButtonState() {
  if (!els.undoEditBtn) return;
  els.undoEditBtn.disabled = ui.editorUndoStack.length === 0;
  els.undoEditBtn.title = ui.editorUndoStack.length === 0 ? "暂无可撤销的正文编辑" : "撤销正文编辑";
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
  if (formatted === editor.value) {
    toast("当前格式已经比较规整");
    return;
  }
  recordEditorUndoPoint();
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
  recordEditorUndoPoint();
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
  recordEditorUndoPoint();
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

function appendDocumentToGeneratePrompt(docId) {
  const doc = state.docs.find((item) => item.id === docId);
  if (!doc) return;
  const block = [`# 引用文档：${doc.title || "未命名文档"}`, "", doc.content || "（空白文档）"].join("\n");
  const separator = els.generatePrompt.value.trim() ? "\n\n---\n\n" : "";
  els.generatePrompt.value = `${els.generatePrompt.value}${separator}${block}`;
  els.generatePrompt.focus();
  els.generatePrompt.dispatchEvent(new Event("input", { bubbles: true }));
  toast(`已把“${doc.title || "未命名文档"}”加入生成提示词`);
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
  if (textarea === els.contentEditor) {
    recordEditorUndoPoint();
  }
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

function getFindMatchIndex(findText) {
  if (!findText) return -1;
  const editor = els.contentEditor;
  const content = editor.value;
  const startAt = editor.selectionEnd || 0;
  let index = content.indexOf(findText, startAt);
  if (index === -1 && startAt > 0) index = content.indexOf(findText);
  return index;
}

function selectFindMatch(index, findText) {
  const editor = els.contentEditor;
  editor.focus();
  editor.setSelectionRange(index, index + findText.length);
}

function getSelectedFindMatch(findText) {
  const editor = els.contentEditor;
  const start = editor.selectionStart || 0;
  const end = editor.selectionEnd || start;
  if (start === end) return null;
  if (editor.value.slice(start, end) !== findText) return null;
  return { start, end };
}

function findNext() {
  const findText = els.findInput.value;
  if (!findText) {
    toast("请输入查找内容", "warn");
    els.findInput.focus();
    return -1;
  }
  const index = getFindMatchIndex(findText);
  if (index === -1) {
    toast("没有找到匹配内容", "warn");
    return -1;
  }
  selectFindMatch(index, findText);
  toast(`已找到：第 ${index + 1} 个字符处`);
  return index;
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
  const currentMatch = getSelectedFindMatch(findText);
  const index = currentMatch?.start ?? getFindMatchIndex(findText);
  if (index === -1) {
    toast("没有找到匹配内容", "warn");
    return;
  }
  const end = currentMatch?.end ?? index + findText.length;
  recordEditorUndoPoint();
  editor.value = content.slice(0, index) + replacement + content.slice(end);
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
  recordEditorUndoPoint();
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

async function exportCurrentDocument() {
  try {
    return await documentManager.exportCurrentDocument();
  } catch (error) {
    toast(`导出 Word 文档失败：${error.message || "请稍后重试"}`, "error");
    return null;
  }
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

function normalizeCustomType(type) {
  const name = String(type?.name || "").trim();
  if (!name) return null;
  const id = String(type?.id || "").trim();
  const safeId = id && !DOCUMENT_TYPES.some((item) => item.id === id) ? id : `custom-type-${createId()}`;
  return {
    id: safeId,
    name: name.slice(0, 24),
    structure: String(type?.structure || "按该自定义类型的写作场景组织结构，保持表达清晰规范").trim(),
    createdAt: type?.createdAt || now(),
    updatedAt: type?.updatedAt || now(),
  };
}

function isCustomDocumentType(typeId) {
  return Array.isArray(state.customTypes) && state.customTypes.some((type) => type.id === typeId);
}

function addCustomType() {
  state.customTypes = Array.isArray(state.customTypes) ? state.customTypes : [];
  const name = window.prompt("新增文档类型名称，例如：调研报告、活动复盘、制度说明");
  const normalizedName = String(name || "").trim();
  if (!normalizedName) return;
  if (getDocumentTypes().some((type) => type.name === normalizedName)) {
    toast(`文档类型“${normalizedName}”已存在`, "warn");
    return;
  }
  const structure =
    window.prompt("该类型的常见结构，可留空", "按背景、目标、重点内容、安排要求、落款组织结构") ||
    "按输入要点组织结构，保持表达清晰规范";
  const type = normalizeCustomType({ name: normalizedName, structure });
  if (!type) return;
  state.customTypes.push(type);
  renderTypeSelect(type.id);
  saveEditor(false);
  persist();
  eventBus.emit(EVENTS.RENDER_DOC_LIST);
  toast(`已新增文档类型：${type.name}`);
}

function renameCustomType() {
  const type = state.customTypes.find((item) => item.id === els.typeSelect.value);
  if (!type) {
    toast("请先选择一个已添加的自定义类型", "warn");
    return;
  }
  const name = window.prompt("重命名文档类型", type.name);
  const normalizedName = String(name || "").trim();
  if (!normalizedName) return;
  if (getDocumentTypes().some((item) => item.id !== type.id && item.name === normalizedName)) {
    toast(`文档类型“${normalizedName}”已存在`, "warn");
    return;
  }
  const structure =
    window.prompt("更新该类型的常见结构，可留空", type.structure) || "按输入要点组织结构，保持表达清晰规范";
  type.name = normalizedName.slice(0, 24);
  type.structure = structure.trim();
  type.updatedAt = now();
  persist();
  renderTypeSelect(type.id);
  eventBus.emit(EVENTS.RENDER_DOC_LIST);
  toast(`已更新文档类型：${type.name}`);
}

function deleteCustomType() {
  const type = state.customTypes.find((item) => item.id === els.typeSelect.value);
  if (!type) {
    toast("请先选择一个已添加的自定义类型", "warn");
    return;
  }
  const affectedCount = state.docs.filter((doc) => doc.type === type.id).length;
  const ok = window.confirm(
    affectedCount
      ? `删除自定义类型“${type.name}”？${affectedCount} 份文档会改为“自定义”。`
      : `删除自定义类型“${type.name}”？`,
  );
  if (!ok) return;
  state.customTypes = state.customTypes.filter((item) => item.id !== type.id);
  state.docs.forEach((doc) => {
    if (doc.type === type.id) doc.type = "custom";
  });
  renderTypeSelect("custom");
  saveEditor(false);
  persist();
  eventBus.emit(EVENTS.RENDER_ALL);
  toast(`已删除文档类型：${type.name}`, "warn");
}

async function generateDocument(mode = "new") {
  const userPrompt = els.generatePrompt.value.trim();
  const docType = els.typeSelect.value || getCurrentDoc()?.type || "notice";
  const currentDoc = getCurrentDoc();
  if (!userPrompt) {
    toast("请输入起草提示词", "warn");
    return;
  }
  if (mode === "overwrite" && !currentDoc) {
    toast("请先选择要覆盖的当前文档", "warn");
    return;
  }

  const button = mode === "insert" ? els.insertDraftBtn : mode === "overwrite" ? els.overwriteDraftBtn : els.generateDocBtn;
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

    if (mode === "insert") {
      const current = getCurrentDoc() || createDocument({ title: deriveGeneratedTitle(content, userPrompt), type: docType });
      const separator = els.contentEditor.value.trim() ? "\n\n" : "";
      recordEditorUndoPoint();
      els.contentEditor.value = `${els.contentEditor.value}${separator}${content}`;
      saveEditor(true);
      ui.generatedDraft = content;
      toast("已插入到当前文档");
      return current;
    }

    if (mode === "overwrite") {
      const title = deriveGeneratedTitle(content, userPrompt);
      recordEditorUndoPoint();
      els.titleInput.value = title;
      els.typeSelect.value = docType;
      if (invokedSkills[0]?.id) els.styleSelect.value = invokedSkills[0].id;
      els.contentEditor.value = content;
      saveEditor(true);
      ui.generatedDraft = content;
      toast(`已覆盖当前文档：${getDocumentLocation(getCurrentDoc())}`);
      return getCurrentDoc();
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

async function generatePptDeck() {
  const currentDoc = getCurrentDoc();
  const title = els.pptTitleInput.value.trim() || els.titleInput.value.trim() || currentDoc?.title || "演示稿";
  const pptOptions = getPptOptions();
  const material =
    els.pptPromptInput.value.trim() ||
    [els.titleInput.value.trim(), els.contentEditor.value.trim()].filter(Boolean).join("\n\n");
  if (!material) {
    toast("请输入 PPT 内容要求，或先打开一篇可作为素材的文档", "warn");
    return;
  }

  await withLoading(els.generatePptBtn, "生成中", async () => withProgress("AI 正在生成原生 PPTX 草稿", async (progress) => {
    progress.update("正在整理归藏 PPTX 提示词", 20);
    const invokedSkills = resolveInvokedSkills(material, "");
    const prompt = buildGuizangPptPrompt({
      title,
      ...pptOptions,
      content: material,
      skillPrompt: formatSkillPrompt(invokedSkills),
    });
    progress.update("正在请求 AI 生成幻灯片结构", 44);
    const output = await callAiJsonWithRepair([
      { role: "system", content: state.settings.systemPrompt || DEFAULT_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ], "PPT 结构 JSON");
    progress.update("正在渲染结构预览", 74);
    const spec = normalizePptSpec(output, {
      title,
      ...pptOptions,
      content: material,
    });
    ui.pptDeckSpec = spec;
    ui.pptDraft = JSON.stringify(spec, null, 2);
    els.pptOutput.value = ui.pptDraft;
    renderPptPreview(spec);
    renderPptQualityReport(spec);
    toast(`已生成 PPTX 草稿，点击“下载 PPTX”保存到：${getDownloadLocation(`${sanitizeFileName(title)}.pptx`)}`);
  }));
}

async function importPptPromptFiles(files) {
  if (!files || files.length === 0) return;
  const { accepted: importFiles, skipped: sizeSkipped } = await filterImportableFilesBySize(files, {
    confirm: confirmLargeImport,
    notify: toast,
  });
  if (importFiles.length === 0) return;

  let importedCount = 0;
  const skippedFiles = [];
  const sections = [];

  await withProgress(`正在导入 ${importFiles.length} 个 PPT 素材`, async (progress) => {
    for (const [index, file] of importFiles.entries()) {
      progress.update(`正在读取 ${file.name}`, Math.round((index / importFiles.length) * 78) + 10);
      if (!canImportFile(file.name)) {
        skippedFiles.push(file.name);
        continue;
      }
      try {
        const text = await readImportFileText(file);
        sections.push(`# ${file.name}\n\n${text}`);
        importedCount += 1;
      } catch (error) {
        skippedFiles.push(file.name);
        console.warn("导入 PPT 素材失败", file.name, error);
      }
    }
    progress.update("正在写入 PPT 内容区", 92);
  });

  if (importedCount === 0 && skippedFiles.length > 0) {
    toast(`未添加 PPT 素材：${buildUnsupportedFileMessage(skippedFiles[0])}`, "warn");
    return;
  }

  const existing = els.pptPromptInput.value.trim();
  const addition = sections.join("\n\n---\n\n");
  els.pptPromptInput.value = [existing, addition].filter(Boolean).join("\n\n---\n\n");
  els.pptPromptInput.focus();
  const skippedCount = skippedFiles.length + sizeSkipped.length;
  toast(`已添加 ${importedCount} 份素材到 PPT 内容区${skippedCount ? `，已跳过 ${skippedCount} 个暂不支持、过大或读取失败的文件` : ""}`);
}

async function downloadPptDeck() {
  const jsonText = els.pptOutput.value.trim() || ui.pptDraft;
  if (!jsonText && !ui.pptDeckSpec) {
    toast("请先生成 PPTX 草稿", "warn");
    return;
  }
  await withLoading(els.downloadPptBtn, "打包中", async () => withProgress("正在打包原生 PPTX", async (progress) => {
    progress.update("正在读取幻灯片结构", 28);
    const spec = jsonText
      ? parseGuizangPptSpec(jsonText, {
          title: els.pptTitleInput.value.trim(),
          ...getPptOptions(),
        })
      : ui.pptDeckSpec;
    const qualityReport = renderPptQualityReport(spec);
    if (qualityReport?.errors?.length) {
      toast("PPTX 结构自检发现需要处理的问题，仍将按当前结构导出。", "warn");
    }
    progress.update("正在生成 PowerPoint 文件", 68);
    const fileName = `${sanitizeFileName(spec.title || els.pptTitleInput.value || "演示稿")}.pptx`;
    const blob = await createPptxBlob(spec);
    downloadBlob(fileName, blob, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    progress.update("已完成", 100);
    toast(`已导出原生 PPTX 到：${getDownloadLocation(fileName)}`);
  }));
}

function renderPptPreview(spec) {
  const html = spec ? renderPptSpecPreview(spec) : "";
  if (els.pptPreview) els.pptPreview.srcdoc = html;
  if (els.pptPreviewModalFrame) els.pptPreviewModalFrame.srcdoc = html;
}

function openPptPreviewModal() {
  if (!ui.pptDeckSpec) {
    toast("请先生成或粘贴一份可识别的 PPT 结构，再打开放大预览。", "warn");
    return;
  }
  renderPptPreview(ui.pptDeckSpec);
  els.pptPreviewOverlay.hidden = false;
  document.body.classList.add("modal-open");
}

function closePptPreviewModal() {
  if (!els.pptPreviewOverlay) return;
  els.pptPreviewOverlay.hidden = true;
  document.body.classList.remove("modal-open");
}

function getPptOptions() {
  const autoSlideCount = Boolean(els.pptAutoSlideCountInput?.checked);
  const slideCount = autoSlideCount ? null : normalizePptSlideCount(els.pptSlideCountSelect.value);
  return {
    style: els.pptStyleSelect.value || "magazine",
    styleDescription: els.pptCustomStyleInput.value.trim(),
    autoSlideCount,
    slideCount,
  };
}

function normalizePptSlideCount(value) {
  const count = Number.parseInt(value, 10);
  const normalized = Number.isFinite(count) ? Math.min(Math.max(count, 1), 40) : 12;
  if (els.pptSlideCountSelect && String(els.pptSlideCountSelect.value) !== String(normalized)) {
    els.pptSlideCountSelect.value = String(normalized);
  }
  return normalized;
}

function updatePptSlideCountControls() {
  const autoSlideCount = Boolean(els.pptAutoSlideCountInput?.checked);
  els.pptSlideCountSelect.disabled = autoSlideCount;
  els.pptSlideCountSelect.title = autoSlideCount
    ? "已启用自动页数，AI 会根据素材信息量自行决定页数"
    : "手动指定 PPT 页数";
}

function updatePptStyleControls() {
  const isCustom = els.pptStyleSelect.value === "custom";
  els.pptCustomStyleField.classList.toggle("active", isCustom);
  els.pptCustomStyleInput.placeholder = isCustom
    ? "描述你希望复用的 PPT 风格、版式节奏、颜色倾向、适用场景和禁忌。"
    : "可选：补充本次 PPT 的风格要求，也可以选择“自定义风格”后保存为 PPT 执笔人。";
}

function renderPptQualityReport(spec) {
  if (!els.pptQualityReport || !spec) return null;
  const report = inspectPptSpec(spec, getPptOptions());
  els.pptQualityReport.textContent = formatPptQualityReport(report);
  if (els.pptQualityStatus) {
    els.pptQualityStatus.textContent = report.errors.length ? "需处理" : report.warnings.length ? "有提示" : "通过";
    els.pptQualityStatus.classList.toggle("ready", !report.errors.length);
    els.pptQualityStatus.classList.toggle("error", report.errors.length > 0);
  }
  return report;
}

function savePptStyleAsSkill() {
  const styleDescription = els.pptCustomStyleInput.value.trim();
  if (!styleDescription) {
    toast("请先填写自定义风格描述，再保存为 PPT 执笔人", "warn");
    els.pptCustomStyleInput.focus();
    return null;
  }

  const defaultName = els.pptTitleInput.value.trim()
    ? `${els.pptTitleInput.value.trim()} PPT 风格`
    : "自定义 PPT 风格";
  const name = window.prompt("PPT 执笔人名称", defaultName);
  if (!name || !name.trim()) return null;

  const handle = normalizeHandle(name);
  const summary = [
    `# ${name}`,
    "",
    "## 适用范围",
    "用于生成可编辑的原生 PPTX 演示稿，控制页面风格、版式节奏、常用布局和审稿标准。",
    "",
    "## 风格描述",
    styleDescription,
    "",
    "## 使用方式",
    `在 PPT 内容与要求中输入 @${handle}，系统会把该风格作为额外执笔人规则传给 AI。`,
  ].join("\n");
  const skillJson = {
    name,
    handle,
    category: "PPT",
    confidence: "manual",
    applicable_scope: "原生 PPTX 演示稿生成",
    style_rules: {
      must: [
        "输出必须适合转换为可编辑的原生 PowerPoint 页面",
        "每页只表达一个核心观点",
        "根据内容选择 cover、section、content、data、roadmap、orgchart、imageText、appendix、closing 等布局",
      ],
      recommended: [styleDescription],
      optional: [],
    },
    forbidden: ["不得依赖网页脚本、CSS 动画、本机路径或截图式输出", "不得编造用户未提供的事实、数字、时间和责任人"],
    generation_steps: ["判断演示目标", "拆分页面结构", "选择页面类型", "控制文字密度", "补充演讲者备注", "执行结构自检"],
    self_checklist: ["页数是否符合要求", "每页标题是否明确", "表格是否适合演示页", "备注是否完整", "布局是否有节奏变化"],
    ppt_generation: {
      style: "custom",
      styleDescription,
      supported_layouts: ["cover", "section", "content", "bullets", "timeline", "comparison", "quote", "data", "roadmap", "orgchart", "imageText", "appendix", "closing"],
    },
  };

  try {
    const saved = commitSkillToState({
      id: null,
      name: name.trim(),
      handle,
      category: "PPT",
      description: "PPT 生成专用执笔人",
      enabled: true,
      summary,
      skillJson: JSON.stringify(skillJson, null, 2),
      examples: [],
      versions: [],
      feedbacks: [],
      createdAt: now(),
      updatedAt: now(),
    });
    toast(`已保存 PPT 执笔人 @${saved.handle} 到：${getSkillLocation(saved)}`);
    return saved;
  } catch (error) {
    toast(error.message || "保存 PPT 执笔人失败", "error");
    return null;
  }
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
      recordEditorUndoPoint();
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
  const { accepted: importFiles, skipped: sizeSkipped } = await filterImportableFilesBySize(files, {
    confirm: confirmLargeImport,
    notify: toast,
  });
  if (importFiles.length === 0) return;

  let importedCount = 0;
  const skippedFiles = [];
  await withProgress(`正在导入 ${importFiles.length} 个示范文件`, async (progress) => {
    for (const [index, file] of importFiles.entries()) {
      progress.update(`正在读取 ${file.name}`, Math.round((index / importFiles.length) * 78) + 10);
      if (!canImportFile(file.name)) {
        skippedFiles.push(file.name);
        continue;
      }
      let text = "";
      try {
        text = await readImportFileText(file);
      } catch (error) {
        skippedFiles.push(file.name);
        console.warn("导入示范文件失败", file.name, error);
        continue;
      }
      ui.editingStyle.examples.push({
        id: createId(),
        name: file.name,
        text,
        addedAt: now(),
      });
      importedCount += 1;
    }
    progress.update("正在刷新示范列表", 92);
  });
  if (importedCount === 0 && skippedFiles.length > 0) {
    toast(`未添加示范：${buildUnsupportedFileMessage(skippedFiles[0])}`, "warn");
    return;
  }
  renderStyleExamples();
  const skippedCount = skippedFiles.length + sizeSkipped.length;
  toast(`已添加 ${importedCount} 份示范到：${getSkillTrainingLocation(ui.editingStyle)}${skippedCount ? `，已跳过 ${skippedCount} 个暂不支持、过大或读取失败的文件` : ""}`);
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

function confirmLargeImport(message) {
  return window.confirm(message);
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
  if (els.apiTopBtn) {
    const apiActive = tabName === "api";
    els.apiTopBtn.classList.toggle("active", apiActive);
    els.apiTopBtn.setAttribute("aria-pressed", String(apiActive));
  }
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
  return getDocumentTypes().find((type) => type.id === typeId) || DOCUMENT_TYPES[DOCUMENT_TYPES.length - 1];
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
    return cleanGeneratedTitle(firstContentLine);
  }
  const firstPromptLine = String(prompt || "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstPromptLine) return "AI 起草文档";
  return cleanGeneratedTitle(firstPromptLine.replace(/^请(起草|撰写|写一份)?/, "")).slice(0, 32) || "AI 起草文档";
}

function cleanGeneratedTitle(value) {
  return String(value || "")
    .trim()
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .replace(/^__(.+)__$/, "$1")
    .trim();
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
      clearLegacyLocalStorageState();
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
  const bootstrap = readStorageBootstrap();
  if (shouldPreferLocalStorageFallback(bootstrap)) {
    const fallback = readLegacyLocalStorageState();
    if (fallback) return fallback;
  }

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
      clearLegacyLocalStorageState();
    } catch (error) {
      console.warn("迁移旧 localStorage 数据到 IndexedDB 失败，暂时继续使用旧数据", error);
    }
    return legacy;
  }

  return {};
}

function tryLocalStorageFallback(snapshot) {
  try {
    writeLegacyLocalStorageState(snapshot);
    writeStorageBootstrap(snapshot, "localStorage");
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
