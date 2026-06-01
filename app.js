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
import {
  formatCreditLedgerSummary,
  formatManualOrderSummary,
  formatManualPaymentPackage,
} from "./src/modules/cloud/billingFormatters.js";
import { getFeatureByAction, getFeatureGroups } from "./src/modules/product/featureCatalog.js";
import { createDocumentEditor } from "./src/modules/documents/documentEditor.js";
import { createDocumentManager } from "./src/modules/documents/documentManager.js";
import { createDocumentPanelController } from "./src/modules/documents/documentPanelController.js";
import { createDocumentRenderer } from "./src/modules/documents/documentRenderer.js";
import { createTrashController } from "./src/modules/documents/trashController.js";
import { createFindReplaceController } from "./src/modules/editor/findReplaceController.js";
import { createEditorContextMenuController } from "./src/modules/editor/editorContextMenuController.js";
import { createGenerationController } from "./src/modules/generation/generationController.js";
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
import { createPptController } from "./src/modules/ppt/pptController.js";
import { createPptxBlob } from "./src/modules/ppt/pptxBuilder.js";
import { createApiSettingsController } from "./src/modules/settings/apiSettingsController.js";
import { createSkillBuilder } from "./src/modules/skills/skillBuilder.js";
import { createSkillBuilderModalController } from "./src/modules/skills/skillBuilderModalController.js";
import { createSkillManager } from "./src/modules/skills/skillManager.js";
import { createSkillRenderer } from "./src/modules/skills/skillRenderer.js";
import { createSkillWorkbenchController } from "./src/modules/skills/skillWorkbenchController.js";
import { createProgressController } from "./src/ui/components/progress.js";
import { showToast } from "./src/ui/components/toast.js";
import { createLayoutController } from "./src/ui/layoutController.js";
import { initThemeToggle } from "./src/ui/theme.js";
import {
  clone,
  createId,
  escapeHtml,
  now,
  normalizeHandle,
  sanitizeFileName,
} from "./src/utils/helpers.js";
import { buildUnsupportedFileMessage, canImportFile, readImportFileText } from "./src/utils/fileReaders.js";
import { isFileDragData } from "./src/utils/dragDrop.js";
import { getDropImportTarget } from "./src/utils/dropRouting.js";
import { filterImportableFilesBySize } from "./src/utils/importGuards.js";
import { formatPrivacyRiskSummary, scanPrivacyRisksInObject } from "./src/utils/privacyScan.js";

const state = {};
const ui = {
  selectedFolderId: "all",
  selectedDocId: null,
  editingStyle: null,
  selectedSkillCardId: null,
  skillMarkdownDirty: false,
  skillMarkdownDirtySkillId: null,
  mentionTarget: null,
  mentionRange: null,
  saveTimer: null,
  saveStatusTimer: null,
  searchTimer: null,
  editorUndoStack: [],
  editorUndoInputActive: false,
  editorUndoInputTimer: null,
  editorUndoLocked: false,
  editorMenuReturnFocus: null,
  persistPromise: Promise.resolve(),
  progressElement: null,
  activeTasks: {},
  mobileView: "editor",
  pptPreviewReturnFocus: null,
  trashModalReturnFocus: null,
  skillBuilderReturnFocus: null,
  mainView: "editor",
  generatedDraft: "",
  pptDraft: "",
  pptDeckSpec: null,
};

const els = {};
const EDITOR_UNDO_LIMIT = 80;
const LOCAL_CLOUD_API_BASE_URL = "http://127.0.0.1:8787/api";
const DEFAULT_CLOUD_API_BASE_URL = getDefaultCloudApiBaseUrl();
const aiClient = createAiClient({
  getSettings: () => state.settings || {},
  notify: (message, tone) => toast(message, tone),
});
const {
  callAiWithRetry,
  callAiJsonWithRepair,
  friendlyAiErrorMessage,
  isAbortError,
} = aiClient;
const apiSettingsController = createApiSettingsController({
  state,
  els,
  persist,
  toast,
  callAiWithRetry,
  withLoading,
  withProgress,
  getApiSettingsLocation,
  defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
});
const {
  renderApiSettings,
  updateAiStatus,
} = apiSettingsController;
const progressController = createProgressController({
  getCurrent: () => ui.progressElement,
  setCurrent: (element) => {
    ui.progressElement = element;
  },
});
const layoutController = createLayoutController({ els, ui });
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
  onNewSkill: () => openSkillBuilderModal(),
  onEditSkill: editSkillMarkdownFromCard,
  onRetrainSkill: (skillId) => openSkillBuilderModal(skillId),
  onInvokeSkill: invokeSkillFromCard,
  onToggleSkillEnabled: toggleSkillEnabledFromCard,
  onCopySkillHandle: copySkillHandleFromCard,
  onOpenSkillDetail: openSkillDetail,
  onTestSkill: openSkillTestFromCard,
  onExportSkill: exportSkillPackageById,
  onDeleteSkill: deleteSkillById,
  onRetrySkill: (skillId) => openSkillBuilderModal(skillId),
  onCancelSkillBuild: cancelSkillBuild,
});
const skillWorkbenchController = createSkillWorkbenchController({
  state,
  ui,
  els,
  normalizeSkill,
  persist,
  eventBus,
  toast,
  getSkillLocation,
  switchTab,
  openResponsiveTools: () => layoutController.openResponsiveTools(),
  openSkillDetail,
  switchSkillDetailTab,
  exportSkillPackage,
  deleteStyle,
  cancelActiveTask,
});
const skillBuilderModalController = createSkillBuilderModalController({
  state,
  ui,
  els,
  eventBus,
  toast,
  createEmptyStyle,
  flushSkillMarkdownEdits,
  hideSkillDetailMenu,
  renderStyleExamples,
  renderSkillDetailExamples: () => skillRenderer.renderSkillDetailExamples(),
  setupFileDrop,
  importStyleExamples,
  importStyleDropFiles,
  summarizeStyle,
  saveStyle,
  deleteStyle,
  getFocusableElements,
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
const trashController = createTrashController({
  els,
  ui,
  renderTrashModal,
  restoreAllTrashDocuments,
  clearTrashDocuments,
  getFocusableElements,
});
const documentPanelController = createDocumentPanelController({
  ui,
  els,
  documentManager,
  trashController,
  setupFileDrop,
  saveEditor,
  persist,
  eventBus,
  switchMainView,
  isMobileWorkspace: () => layoutController.isMobileWorkspace(),
  setMobileView: (view) => layoutController.setMobileView(view),
  toast,
});
const documentRenderer = createDocumentRenderer({
  state,
  ui,
  els,
  getType,
  getCurrentDoc,
  getDocumentLocation,
  onSelectDocument: documentPanelController.selectDocument,
  onCopyDocument: documentPanelController.duplicateDocument,
  onMoveDocument: documentPanelController.moveDocument,
  onMoveDocumentToTop: documentPanelController.moveDocumentToTop,
  onMoveDocumentToBottom: documentPanelController.moveDocumentToBottom,
  onDeleteDocument: documentPanelController.deleteDocument,
  onRestoreDocument: documentPanelController.restoreDocument,
  onRestoreAllTrash: documentPanelController.restoreAllTrashDocuments,
  onPermanentlyDeleteDocument: documentPanelController.permanentlyDeleteDocument,
  onClearTrash: documentPanelController.clearTrashDocuments,
});
const generationController = createGenerationController({
  els,
  ui,
  state,
  defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
  toast,
  cancelActiveTask,
  withCancelableTask,
  throwIfTaskAborted,
  getCurrentDoc,
  getType,
  resolveInvokedSkills,
  formatSkillPrompt,
  callAiWithRetry,
  createDocument,
  deriveGeneratedTitle,
  recordEditorUndoPoint,
  saveEditor,
  getDocumentLocation,
  getSelectionOrLine,
});
const editorContextMenuController = createEditorContextMenuController({
  state,
  ui,
  els,
  toast,
  generationController,
  getCurrentDoc,
  isSkillEnabled,
  recordEditorUndoPoint,
  saveEditor,
  getSelectionOrLine,
});
const findReplaceController = createFindReplaceController({
  els,
  toast,
  recordEditorUndoPoint,
  saveEditor,
});
const pptController = createPptController({
  els,
  ui,
  state,
  defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
  toast,
  cancelActiveTask,
  withCancelableTask,
  withLoading,
  withProgress,
  throwIfTaskAborted,
  setupFileDrop,
  getCurrentDoc,
  resolveInvokedSkills,
  formatSkillPrompt,
  callAiJsonWithRepair,
  buildGuizangPptPrompt,
  normalizePptSpec,
  parseGuizangPptSpec,
  renderPptSpecPreview,
  inspectPptSpec,
  formatPptQualityReport,
  createPptxBlob,
  sanitizeFileName,
  getDownloadLocation,
  downloadBlob,
  filterImportableFilesBySize,
  confirmLargeImport,
  canImportFile,
  readImportFileText,
  buildUnsupportedFileMessage,
  getFocusableElements,
  savePptStyleAsSkill,
  pptStyleOptions: PPT_STYLE_OPTIONS,
  escapeHtml,
});

document.addEventListener("DOMContentLoaded", async () => {
  bindElements();
  mountCloudPage();
  mountPptPage();
  bindEventBus();
  await hydrateState();
  initializeMissingData();
  bindEvents();
  initThemeToggle(els.themeToggle);
  hydrateStaticSelects();
  layoutController.restoreWorkspaceLayout();
  layoutController.setupWorkspaceResizers();
  layoutController.setupResponsiveWorkspace();
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
    "editorPanel",
    "leftWorkspaceResizer",
    "rightWorkspaceResizer",
    "themeToggle",
    "newDocBtn",
    "importInput",
    "exportDocBtn",
    "backupBtn",
    "trashTopBtn",
    "trashModal",
    "trashModalCount",
    "trashModalList",
    "closeTrashModalBtn",
    "restoreAllTrashBtn",
    "clearTrashBtn",
    "apiTopBtn",
    "cloudTopBtn",
    "responsiveInspectorToggle",
    "mobileWorkspaceNav",
    "responsiveBackdrop",
    "linkFolderBtn",
    "folderCreateBox",
    "folderNameInput",
    "confirmFolderBtn",
    "folderList",
    "docCount",
    "searchInput",
    "docDropZone",
    "docList",
    "trashCount",
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
    "findStatus",
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
    "pptBackToEditorBtn",
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
    "pptSlideEditor",
    "pptQualityStatus",
    "pptQualityReport",
    "pptPreview",
    "openPptPreviewBtn",
    "pptPreviewOverlay",
    "closePptPreviewBtn",
    "pptPreviewModalFrame",
    "newStyleBtn",
    "skillCategoryFilter",
    "skillEnabledOnlyInput",
    "skillSearchInput",
    "skillBuilderModal",
    "skillBuilderModalTitle",
    "skillBuilderModeLabel",
    "closeSkillBuilderModalBtn",
    "skillBuilderCancelBtn",
    "styleNameInput",
    "skillHandleInput",
    "skillCategorySelect",
    "skillCustomCategoryField",
    "skillCustomCategoryInput",
    "skillDescriptionInput",
    "skillEnabledInput",
    "styleDropZone",
    "styleFileInput",
    "styleExampleList",
    "skillSourceDocSelect",
    "addSourceDocsToSkillBtn",
    "importSkillPackageBtn",
    "exportSkillPackageBtn",
    "importSkillPackageInput",
    "summarizeStyleBtn",
    "skillAnalysisInput",
    "skillAggregationInput",
    "skillQualityReport",
    "styleSummaryInput",
    "saveSkillMdBtn",
    "skillJsonInput",
    "skillAutoTestInput",
    "skillBuilderTestPrompt",
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
    "skillDetailExampleList",
    "skillDetailCloseBtn",
    "apiSavedLabel",
    "cloudPanel",
    "cloudBackToEditorBtn",
    "providerSelect",
    "baseUrlInput",
    "endpointPathInput",
    "modelInput",
    "apiKeyInput",
    "systemPromptInput",
    "saveApiBtn",
    "testApiBtn",
    "clearApiBtn",
    "cloudStatusLabel",
    "cloudBaseUrlInput",
    "cloudRefreshBtn",
    "cloudLogoutBtn",
    "cloudAccountCard",
    "cloudEmailInput",
    "cloudPasswordInput",
    "cloudNameInput",
    "cloudLoginBtn",
    "cloudRegisterBtn",
    "cloudEmailTokenInput",
    "cloudRequestVerifyBtn",
    "cloudVerifyEmailBtn",
    "cloudResetTokenInput",
    "cloudNewPasswordInput",
    "cloudRequestResetBtn",
    "cloudConfirmResetBtn",
    "cloudLogoutAllBtn",
    "cloudSaveDocBtn",
    "cloudPullDocsBtn",
    "cloudSaveWriterBtn",
    "cloudPullWritersBtn",
    "featureMapGrid",
    "cloudUsageLabel",
    "cloudUsageReport",
    "cloudBillingLabel",
    "cloudManualRechargeCard",
    "cloudCreditBalanceLabel",
    "cloudManualPackageSelect",
    "cloudManualPaymentMethodSelect",
    "cloudManualPaymentMethods",
    "cloudManualOrderNoteInput",
    "cloudManualProofInput",
    "cloudManualOrderBtn",
    "cloudBillingReport",
    "cloudExportDataBtn",
    "cloudDeleteAccountBtn",
    "cloudFeedbackInput",
    "cloudSendFeedbackBtn",
    "cloudOpsReport",
    "toastRegion",
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function mountCloudPage() {
  if (!els.editorPanel || !els.cloudPanel) return;
  els.editorPanel.appendChild(els.cloudPanel);
}

function mountPptPage() {
  if (!els.editorPanel || !els.pptPanel) return;
  els.editorPanel.appendChild(els.pptPanel);
  if (els.pptPreviewOverlay && els.pptPreviewOverlay.parentElement !== document.body) {
    document.body.appendChild(els.pptPreviewOverlay);
  }
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
  state.docs = state.docs.map((doc) => ({
    ...doc,
    deletedAt: doc.deletedAt || "",
    deletedFromFolderId: doc.deletedFromFolderId || "",
  }));

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

  state.cloud = {
    apiBaseUrl: DEFAULT_CLOUD_API_BASE_URL,
    authenticated: false,
    user: null,
    organizations: [],
    activeOrganization: null,
    membership: null,
    members: [],
    invitations: [],
    usage: null,
    billing: null,
    model: "",
    ...(state.cloud || {}),
  };
  state.cloud.apiBaseUrl = normalizeCloudBaseUrl(state.cloud.apiBaseUrl || DEFAULT_CLOUD_API_BASE_URL);
  state.cloud.organizations = Array.isArray(state.cloud.organizations) ? state.cloud.organizations : [];
  state.cloud.members = Array.isArray(state.cloud.members) ? state.cloud.members : [];
  state.cloud.invitations = Array.isArray(state.cloud.invitations) ? state.cloud.invitations : [];
  state.cloud.authenticated = Boolean(state.cloud.authenticated && state.cloud.user);

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
  documentPanelController.bindEvents();
  els.apiTopBtn.addEventListener("click", () => {
    switchMainView("editor");
    switchTab("api");
    layoutController.openResponsiveTools();
  });
  els.cloudTopBtn.addEventListener("click", () => {
    switchMainView(ui.mainView === "cloud" ? "editor" : "cloud");
    renderCloudPanel();
  });
  layoutController.bindEvents();
  preventWindowFileNavigation();

  els.linkFolderBtn.addEventListener("click", linkRealFolder);
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
  findReplaceController.bindEvents();
  editorContextMenuController.bindEvents();
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#editorMenu")) editorContextMenuController.hide();
    if (!event.target.closest("#skillMentionPanel") && !event.target.matches("#generatePrompt, #contentEditor")) {
      hideSkillMentionPanel();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      editorContextMenuController.hide({ restoreFocus: true });
      hideSkillMentionPanel();
      if (els.skillBuilderModal && !els.skillBuilderModal.hidden) closeSkillBuilderModal();
      layoutController.closeResponsiveInspector();
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
    if (button) {
      switchTab(button.dataset.tab);
      if (layoutController.isMobileWorkspace()) {
        layoutController.setMobileView(button.dataset.tab === "ppt" ? "editor" : "tools");
      }
    }
  });

  generationController.bindEvents();
  setupDocumentDrop(els.generatePanel, appendDocumentToGeneratePrompt);
  setupDocumentDrop(els.generatePrompt, appendDocumentToGeneratePrompt);
  pptController.bindEvents();

  skillBuilderModalController.bindEvents();
  els.skillCategoryFilter.addEventListener("change", () => eventBus.emit(EVENTS.RENDER_STYLE_LIST));
  els.skillEnabledOnlyInput.addEventListener("change", () => eventBus.emit(EVENTS.RENDER_STYLE_LIST));
  els.skillSearchInput.addEventListener("input", () => eventBus.emit(EVENTS.RENDER_STYLE_LIST));
  els.importSkillPackageBtn.addEventListener("click", () => els.importSkillPackageInput.click());
  els.exportSkillPackageBtn.addEventListener("click", exportSkillPackage);
  els.importSkillPackageInput.addEventListener("change", importSkillPackages);
  els.styleSummaryInput.addEventListener("input", () => {
    if (!ui.editingStyle) return;
    ui.editingStyle.summary = els.styleSummaryInput.value;
    ui.skillMarkdownDirty = true;
    ui.skillMarkdownDirtySkillId = ui.editingStyle.id || null;
    updateSkillMarkdownSaveState();
  });
  els.styleSummaryInput.addEventListener("blur", () => {
    if (ui.skillMarkdownDirty && ui.skillMarkdownDirtySkillId === ui.editingStyle?.id) {
      saveSkillMarkdownEdits({ silent: true });
    }
  });
  els.saveSkillMdBtn.addEventListener("click", saveSkillMarkdownEdits);
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

  apiSettingsController.bindEvents();
  els.cloudBaseUrlInput.addEventListener("change", saveCloudBaseUrlFromInput);
  els.cloudRefreshBtn.addEventListener("click", refreshCloudStatus);
  els.cloudBackToEditorBtn?.addEventListener("click", () => switchMainView("editor"));
  els.pptBackToEditorBtn?.addEventListener("click", () => switchMainView("editor"));
  els.cloudLoginBtn.addEventListener("click", cloudLogin);
  els.cloudRegisterBtn.addEventListener("click", cloudRegister);
  els.cloudLogoutBtn.addEventListener("click", cloudLogout);
  els.cloudRequestVerifyBtn.addEventListener("click", cloudRequestEmailVerification);
  els.cloudVerifyEmailBtn.addEventListener("click", cloudVerifyEmail);
  els.cloudRequestResetBtn.addEventListener("click", cloudRequestPasswordReset);
  els.cloudConfirmResetBtn.addEventListener("click", cloudConfirmPasswordReset);
  els.cloudLogoutAllBtn.addEventListener("click", cloudLogoutAllDevices);
  els.cloudSaveDocBtn.addEventListener("click", cloudSaveCurrentDocument);
  els.cloudPullDocsBtn.addEventListener("click", cloudPullDocuments);
  els.cloudSaveWriterBtn.addEventListener("click", cloudSaveCurrentWriter);
  els.cloudPullWritersBtn.addEventListener("click", cloudPullWriters);
  els.cloudManualOrderBtn?.addEventListener("click", cloudSubmitManualOrder);
  els.cloudManualPackageSelect?.addEventListener("change", renderCloudManualPaymentMethods);
  els.cloudManualPaymentMethodSelect?.addEventListener("change", renderCloudManualPaymentMethods);
  els.featureMapGrid?.addEventListener("click", handleFeatureMapAction);
  els.cloudExportDataBtn.addEventListener("click", cloudExportMyData);
  els.cloudDeleteAccountBtn.addEventListener("click", cloudDeleteAccount);
  els.cloudSendFeedbackBtn.addEventListener("click", cloudSendFeedback);
  window.addEventListener("hashchange", handleHashRoute);
  handleHashRoute();
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
  const target = getDropImportTarget(document.querySelector(".tab-panel.active")?.id || "", {
    skillBuilderOpen: Boolean(els.skillBuilderModal && !els.skillBuilderModal.hidden),
  });
  if (target === "ppt") {
    await pptController.importPptPromptFiles(files);
    return;
  }
  if (target === "style" || target === "skill-builder") {
    await importStyleDropFiles(files);
    return;
  }
  await importDocumentFiles(files);
}

function isSkillPackageFile(file) {
  return /\.skill\.json$/i.test(file?.name || "");
}

function hydrateStaticSelects() {
  renderTypeSelect();
  pptController.hydratePptStyleSelect();
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

function render() {
  renderFolders();
  renderFolderSelect();
  renderStyleSelect();
  renderDocList();
  renderTypeSelect();
  renderEditor();
  renderApiSettings();
  renderCloudPanel();
  renderStyleEditor();
  renderStyleList();
  updateAiStatus();
  const activeDocCount = state.docs.filter((doc) => !doc.deletedAt).length;
  const trashDocCount = state.docs.filter((doc) => doc.deletedAt).length;
  els.storageLabel.textContent = `${activeDocCount} 份文档 / ${trashDocCount} 份在垃圾箱 / ${state.folders.length} 个文件夹`;
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

function renderTrashModal() {
  documentRenderer.renderTrashModal();
}

function renderEditor() {
  documentRenderer.renderEditor();
  resetEditorUndoHistory();
  const currentDoc = getCurrentDoc();
  if (currentDoc && !currentDoc.deletedAt) {
    hideSaveStatus();
  }
  updateTypeControlState();
}

function renderCloudPanel() {
  if (!els.cloudBaseUrlInput) return;
  const cloud = state.cloud || {};
  const authenticated = Boolean(cloud.authenticated && cloud.user);
  const emailVerified = Boolean(cloud.user?.email_verified_at);
  const orgName = cloud.activeOrganization?.name || "未选择组织";
  els.cloudBaseUrlInput.value = cloud.apiBaseUrl || DEFAULT_CLOUD_API_BASE_URL;
  els.cloudStatusLabel.textContent = authenticated ? "已登录" : "本地模式";
  els.cloudStatusLabel.className = `status-pill ${authenticated ? "ready" : ""}`;
  els.cloudLogoutBtn.disabled = !authenticated;
  els.cloudAccountCard.innerHTML = authenticated
    ? `<strong>${escapeHtml(cloud.user.email || "")}</strong><span>${escapeHtml(orgName)} · ${escapeHtml(roleLabel(cloud.membership?.role || "owner"))} · ${emailVerified ? "邮箱已验证" : "邮箱未验证"}</span>`
    : "<strong>未连接云端</strong><span>本地数据仍可正常使用，登录后可查看套餐、额度、费用明细并同步个人数据。</span>";
  renderFeatureMap();

  [
    els.cloudSaveDocBtn,
    els.cloudPullDocsBtn,
    els.cloudSaveWriterBtn,
    els.cloudPullWritersBtn,
    els.cloudRequestVerifyBtn,
    els.cloudVerifyEmailBtn,
    els.cloudLogoutAllBtn,
    els.cloudExportDataBtn,
    els.cloudDeleteAccountBtn,
    els.cloudSendFeedbackBtn,
    els.cloudManualOrderBtn,
  ].forEach((button) => {
    if (button) button.disabled = !authenticated;
  });
  [
    els.cloudManualPackageSelect,
    els.cloudManualPaymentMethodSelect,
    els.cloudManualOrderNoteInput,
    els.cloudManualProofInput,
  ].forEach((field) => {
    if (field) field.disabled = !authenticated;
  });

  const usage = cloud.usage;
  if (usage) {
    els.cloudUsageLabel.textContent = `${usage.request_count || usage.requests || 0} 次请求`;
    const limits = cloud.limits;
    const taskRows = Object.entries(usage.by_task_type || {})
      .map(([task, item]) => `<div>${escapeHtml(task)}：${item.request_count || 0} 次 · ${Number(item.total_tokens || 0).toLocaleString("zh-CN")} 字数估算</div>`)
      .join("");
    els.cloudUsageReport.innerHTML = [
      limits ? `<div>套餐：${escapeHtml(limits.plan || "free")} · 个人日限 ${limits.user_daily} · 组织日限 ${limits.org_daily}</div>` : "",
      `<div>总字数：${Number(usage.total_tokens || 0).toLocaleString("zh-CN")}</div>`,
      `<div>预估费用：${formatCurrencyCny(usage.estimated_cost || usage.estimated_cost_cents || 0)}</div>`,
      taskRows,
    ].join("");
  } else {
    els.cloudUsageLabel.textContent = authenticated ? "等待统计" : "未登录";
    els.cloudUsageReport.textContent = authenticated ? "暂无本账号用量记录。" : "登录云端后显示本账号 AI 调用用量和费用估算。";
  }

  renderCloudBilling(authenticated);
}

function renderFeatureMap() {
  if (!els.featureMapGrid) return;
  els.featureMapGrid.innerHTML = getFeatureGroups().map((group) => `
    <section class="feature-map-group" aria-label="${escapeHtml(group.name)}">
      <div class="feature-map-group-title">${escapeHtml(group.name)}</div>
      ${group.features.map((feature) => `
        <article class="feature-card" data-feature-id="${escapeHtml(feature.id)}">
          <div class="feature-card-head">
            <strong>${escapeHtml(feature.title)}</strong>
            <span>${escapeHtml(feature.mode)}</span>
          </div>
          <p>${escapeHtml(feature.summary)}</p>
          <div class="feature-card-meta">入口：${escapeHtml(feature.entry)}</div>
          <div class="feature-card-tags">
            ${feature.outputs.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
          </div>
          <button type="button" data-feature-action="${escapeHtml(feature.action)}">进入</button>
        </article>`).join("")}
    </section>`).join("");
}

function handleFeatureMapAction(event) {
  const button = event.target.closest("[data-feature-action]");
  if (!button) return;
  const feature = getFeatureByAction(button.dataset.featureAction);
  if (!feature) return;
  activateFeature(feature.action);
}

function activateFeature(action) {
  const focusLater = (element) => window.setTimeout(() => element?.focus?.({ preventScroll: false }), 0);
  if (action === "documents") {
    switchMainView("editor");
    focusLater(els.searchInput);
    return;
  }
  if (action === "editor") {
    switchMainView("editor");
    focusLater(els.contentEditor);
    return;
  }
  if (action === "writer-use") {
    switchMainView("editor");
    switchTab("style");
    focusLater(els.styleList || els.newStyleBtn);
    return;
  }
  if (action === "writer-build") {
    switchMainView("editor");
    switchTab("style");
    els.newStyleBtn?.click?.();
    return;
  }
  if (action === "draft") {
    switchMainView("editor");
    switchTab("generate");
    focusLater(els.generatePrompt);
    return;
  }
  if (action === "ppt") {
    switchMainView("ppt");
    focusLater(els.pptPromptInput);
    return;
  }
  if (action === "cloud-sync") {
    switchMainView("cloud");
    focusLater(els.cloudSaveDocBtn);
    return;
  }
  if (action === "billing") {
    switchMainView("cloud");
    focusLater(els.cloudManualPackageSelect);
    return;
  }
  if (action === "admin") {
    openStandaloneAdminPage();
  }
}

function renderCloudBilling(authenticated) {
  if (!els.cloudBillingReport) return;
  const billing = state.cloud?.billing || null;
  renderCloudManualRecharge(authenticated, billing);
  if (!authenticated) {
    els.cloudBillingLabel.textContent = "未登录";
    els.cloudBillingReport.textContent = "登录云端后显示套餐、可用额度和充值订单。";
    return;
  }
  if (!billing) {
    els.cloudBillingLabel.textContent = "等待统计";
    els.cloudBillingReport.textContent = "刷新云端状态后显示套餐、额度和充值订单。";
    return;
  }
  const plan = billing.organization?.plan || "free";
  const manualOrderRows = Array.isArray(billing.manual_orders) && billing.manual_orders.length
    ? billing.manual_orders.slice(-5).reverse().map((item) =>
      formatManualOrderSummary(item)).join("\n")
    : "暂无人工充值订单。";
  const creditLedgerRows = Array.isArray(billing.credit_ledger) && billing.credit_ledger.length
    ? billing.credit_ledger.slice(-8).reverse().map((item) => formatCreditLedgerSummary(item)).join("\n")
    : "暂无额度明细。";
  els.cloudBillingLabel.textContent = `套餐：${plan}`;
  els.cloudBillingReport.textContent = [
    `当前套餐：${plan}`,
    `个人日限：${billing.limits?.user_daily ?? "-"} · 组织日限：${billing.limits?.org_daily ?? "-"}`,
    `今日请求：${billing.usage?.request_count || 0} 次 · 失败：${billing.usage?.failed_count || 0} 次`,
    `今日预估费用：${formatCurrencyCny(billing.usage?.estimated_cost || 0)}`,
    `AI 额度：${Number(billing.credits?.balance || 0).toLocaleString("zh-CN")} 点`,
    "",
    "我的充值订单：",
    manualOrderRows,
    "",
    "额度明细：",
    creditLedgerRows,
  ].join("\n");
}

function renderCloudManualRecharge(authenticated, billing) {
  const manual = billing?.manual_payment || {};
  const packages = Array.isArray(manual.packages) && manual.packages.length
    ? manual.packages
    : [
      { id: "pro_month", title: "Pro 月度会员", amount_cny: 29, plan: "pro", duration_days: 30, credits: 0 },
      { id: "credits_1000", title: "1000 点 AI 额度", amount_cny: 50, plan: "", duration_days: 0, credits: 1000 },
    ];
  const currentPackage = els.cloudManualPackageSelect?.value || packages[0]?.id || "";
  if (els.cloudManualPackageSelect) {
    els.cloudManualPackageSelect.innerHTML = packages.map((item) =>
      `<option value="${escapeHtml(item.id)}">${escapeHtml(formatManualPaymentPackage(item))}</option>`).join("");
    els.cloudManualPackageSelect.value = packages.some((item) => item.id === currentPackage) ? currentPackage : packages[0]?.id || "";
    els.cloudManualPackageSelect.disabled = !authenticated;
  }
  if (els.cloudManualPaymentMethodSelect) {
    const methods = Array.isArray(manual.methods) && manual.methods.length ? manual.methods : [
      { channel: "wechat", label: "微信", qr_url: "" },
      { channel: "alipay", label: "支付宝", qr_url: "" },
    ];
    const currentMethod = els.cloudManualPaymentMethodSelect.value || "wechat";
    els.cloudManualPaymentMethodSelect.innerHTML = methods.map((item) =>
      `<option value="${escapeHtml(item.channel)}">${escapeHtml(item.label || item.channel)}</option>`).join("");
    els.cloudManualPaymentMethodSelect.value = methods.some((item) => item.channel === currentMethod) ? currentMethod : methods[0]?.channel || "wechat";
    els.cloudManualPaymentMethodSelect.disabled = !authenticated;
  }
  if (els.cloudCreditBalanceLabel) {
    els.cloudCreditBalanceLabel.textContent = `额度：${Number(billing?.credits?.balance || 0).toLocaleString("zh-CN")} 点`;
  }
  if (els.cloudManualOrderBtn) els.cloudManualOrderBtn.disabled = !authenticated;
  if (els.cloudManualOrderNoteInput) els.cloudManualOrderNoteInput.disabled = !authenticated;
  if (els.cloudManualProofInput) els.cloudManualProofInput.disabled = !authenticated;
  renderCloudManualPaymentMethods();
}

function renderCloudManualPaymentMethods() {
  if (!els.cloudManualPaymentMethods) return;
  const billing = state.cloud?.billing || null;
  const manual = billing?.manual_payment || {};
  const packages = Array.isArray(manual.packages) ? manual.packages : [];
  const methods = Array.isArray(manual.methods) ? manual.methods : [];
  const selectedPackageId = els.cloudManualPackageSelect?.value || packages[0]?.id || "";
  const selectedPackage = packages.find((item) => item.id === selectedPackageId) || packages[0] || null;
  const selected = els.cloudManualPaymentMethodSelect?.value || methods[0]?.channel || "wechat";
  const method = methods.find((item) => item.channel === selected) || methods[0] || { channel: selected, label: selected, qr_url: "" };
  const receiver = manual.receiver_name ? `<span>收款方：${escapeHtml(manual.receiver_name)}</span>` : "";
  const packageHint = selectedPackage ? `<span>本次应付：¥${escapeHtml(selectedPackage.amount_cny ?? 0)} · ${escapeHtml(formatManualPaymentPackage(selectedPackage))}</span>` : "";
  const qr = method.qr_url
    ? `<img src="${escapeHtml(method.qr_url)}" alt="${escapeHtml(method.label || method.channel)} 收款码">`
    : `<div class="manual-payment-placeholder">未配置收款码，请向管理员索取。</div>`;
  els.cloudManualPaymentMethods.innerHTML = `
    <div class="manual-payment-method">
      ${qr}
      <div>
        <strong>${escapeHtml(method.label || method.channel || "支付方式")}</strong>
        ${receiver}
        ${packageHint}
        <span>付款后提交订单，管理员核对后生效。</span>
      </div>
    </div>`;
}

function roleLabel(role) {
  const value = String(role || "member");
  if (value === "owner") return "所有者";
  if (value === "admin") return "管理员";
  if (value === "member") return "成员";
  return value;
}

function formatCurrencyCny(value) {
  const amount = Number(value || 0);
  return `¥${(Number.isFinite(amount) ? amount : 0).toFixed(4)}`;
}

function getDefaultCloudApiBaseUrl() {
  const location = window.location;
  if (!location || !["http:", "https:"].includes(location.protocol)) {
    return LOCAL_CLOUD_API_BASE_URL;
  }
  if (isLocalDevelopmentHost(location.hostname)) {
    return LOCAL_CLOUD_API_BASE_URL;
  }
  return `${location.origin}/api`;
}

function isLocalDevelopmentHost(hostname) {
  return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(String(hostname || "").toLowerCase());
}

function shouldReplaceLocalApiBaseUrl(value) {
  if (DEFAULT_CLOUD_API_BASE_URL === LOCAL_CLOUD_API_BASE_URL) return false;
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]):8787\/api\/?$/i.test(String(value || "").trim());
}

function normalizeCloudBaseUrl(value) {
  const raw = String(value || "").trim();
  if (shouldReplaceLocalApiBaseUrl(raw)) return DEFAULT_CLOUD_API_BASE_URL;
  return (raw || DEFAULT_CLOUD_API_BASE_URL).replace(/\/+$/, "") || DEFAULT_CLOUD_API_BASE_URL;
}

function saveCloudBaseUrlFromInput() {
  state.cloud.apiBaseUrl = normalizeCloudBaseUrl(els.cloudBaseUrlInput.value);
  persist();
  renderCloudPanel();
  toast(`云端地址已保存到：${getCloudSettingsLocation()}`);
}

async function cloudRequest(path, options = {}) {
  const baseUrl = normalizeCloudBaseUrl(state.cloud?.apiBaseUrl || els.cloudBaseUrlInput?.value);
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const orgId = state.cloud?.activeOrganization?.id;
  if (orgId) headers["x-organization-id"] = orgId;
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
      credentials: "include",
    });
  } catch (error) {
    throw new Error(`无法连接云端 API：${baseUrl}。请确认后端服务已启动，或检查云端 API 地址。`);
  }
  const text = await response.text();
  const data = text ? parseJsonSafely(text) : {};
  if (!response.ok) {
    const message = data?.error?.message || data?.message || text || response.statusText;
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

function parseJsonSafely(text, fallback = {}) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function debounce(fn, delay = 250) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

function applyCloudSession(data) {
  const organization = data.organization || data.activeOrganization || data.organizations?.[0] || null;
  state.cloud = {
    ...(state.cloud || {}),
    authenticated: Boolean(data.authenticated ?? data.user),
    user: data.user || null,
    organizations: Array.isArray(data.organizations) ? data.organizations : organization ? [organization] : [],
    activeOrganization: organization,
    membership: data.membership || null,
  };
}

async function refreshCloudStatus() {
  await withLoading(els.cloudRefreshBtn, "刷新中", async () => {
    try {
      state.cloud.apiBaseUrl = normalizeCloudBaseUrl(els.cloudBaseUrlInput.value);
      const data = await cloudRequest("/me", { method: "GET" });
      applyCloudSession(data);
      if (state.cloud.authenticated) {
        await refreshCloudUsage({ silent: true });
        await refreshCloudBilling({ silent: true });
      }
      persist();
      renderCloudPanel();
      toast(state.cloud.authenticated ? "云端状态已刷新" : "当前为本地模式");
    } catch (error) {
      state.cloud.authenticated = false;
      state.cloud.user = null;
      state.cloud.usage = null;
      state.cloud.billing = null;
      persist();
      renderCloudPanel();
      toast(`云端连接失败：${error.message}`, "error");
    }
  });
}

async function cloudLogin() {
  await withLoading(els.cloudLoginBtn, "登录中", async () => {
    state.cloud.apiBaseUrl = normalizeCloudBaseUrl(els.cloudBaseUrlInput.value);
    const data = await cloudRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: els.cloudEmailInput.value.trim(),
        password: els.cloudPasswordInput.value,
      }),
    });
    applyCloudSession(data);
    if (data.email_verification_token && els.cloudEmailTokenInput) {
      els.cloudEmailTokenInput.value = data.email_verification_token;
    }
    await refreshCloudUsage({ silent: true });
    await refreshCloudBilling({ silent: true });
    persist();
    renderCloudPanel();
    toast(`已登录云端：${getCloudSettingsLocation()}`);
  });
}

async function cloudRegister() {
  await withLoading(els.cloudRegisterBtn, "注册中", async () => {
    state.cloud.apiBaseUrl = normalizeCloudBaseUrl(els.cloudBaseUrlInput.value);
    const data = await cloudRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: els.cloudEmailInput.value.trim(),
        password: els.cloudPasswordInput.value,
        name: els.cloudNameInput.value.trim() || els.cloudEmailInput.value.trim(),
        organizationName: `${els.cloudNameInput.value.trim() || "我的"}工作区`,
      }),
    });
    applyCloudSession(data);
    await refreshCloudUsage({ silent: true });
    await refreshCloudBilling({ silent: true });
    persist();
    renderCloudPanel();
    toast(`云端账号已创建：${getCloudSettingsLocation()}`);
  });
}

async function cloudLogout() {
  await withLoading(els.cloudLogoutBtn, "退出中", async () => {
    await cloudRequest("/auth/logout", { method: "POST", body: JSON.stringify({}) }).catch(() => null);
    state.cloud = {
      ...(state.cloud || {}),
      authenticated: false,
      user: null,
      activeOrganization: null,
      membership: null,
      members: [],
      invitations: [],
      usage: null,
      limits: null,
      billing: null,
    };
    persist();
    renderCloudPanel();
    toast("已退出云端账号", "warn");
  });
}

async function cloudLogoutAllDevices() {
  if (!window.confirm("确定要退出所有云端设备吗？当前页面也会退出。")) return;
  await withLoading(els.cloudLogoutAllBtn, "退出中", async () => {
    await cloudRequest("/auth/logout-all", { method: "POST", body: JSON.stringify({}) });
    state.cloud = {
      ...(state.cloud || {}),
      authenticated: false,
      user: null,
      activeOrganization: null,
      membership: null,
      members: [],
      invitations: [],
      usage: null,
      limits: null,
      billing: null,
    };
    persist();
    renderCloudPanel();
    toast("已退出所有云端设备", "warn");
  });
}

async function cloudRequestEmailVerification() {
  const email = els.cloudEmailInput.value.trim() || state.cloud?.user?.email || "";
  await withLoading(els.cloudRequestVerifyBtn, "申请中", async () => {
    const data = await cloudRequest("/auth/request-email-verification", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    if (data.email_verification_token) {
      els.cloudEmailTokenInput.value = data.email_verification_token;
      toast("邮箱验证码已生成，灰度环境可直接复制使用");
    } else {
      toast(data.verified ? "邮箱已验证" : "验证请求已提交");
    }
  });
}

async function cloudVerifyEmail() {
  const email = els.cloudEmailInput.value.trim() || state.cloud?.user?.email || "";
  const token = els.cloudEmailTokenInput.value.trim();
  if (!token) {
    toast("请先填写邮箱验证码", "warn");
    return;
  }
  await withLoading(els.cloudVerifyEmailBtn, "验证中", async () => {
    const data = await cloudRequest("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ email, token }),
    });
    state.cloud.user = data.user || state.cloud.user;
    els.cloudEmailTokenInput.value = "";
    persist();
    renderCloudPanel();
    toast("邮箱已验证");
  });
}

async function cloudRequestPasswordReset() {
  const email = els.cloudEmailInput.value.trim();
  if (!email) {
    toast("请先填写邮箱", "warn");
    return;
  }
  await withLoading(els.cloudRequestResetBtn, "申请中", async () => {
    const data = await cloudRequest("/auth/request-password-reset", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    if (data.reset_token) {
      els.cloudResetTokenInput.value = data.reset_token;
      toast("重置码已生成，灰度环境可直接复制使用");
    } else {
      toast("如果账号存在，重置请求已提交");
    }
  });
}

async function cloudConfirmPasswordReset() {
  const email = els.cloudEmailInput.value.trim();
  const token = els.cloudResetTokenInput.value.trim();
  const password = els.cloudNewPasswordInput.value;
  if (!email || !token || !password) {
    toast("请填写邮箱、重置码和新密码", "warn");
    return;
  }
  await withLoading(els.cloudConfirmResetBtn, "重置中", async () => {
    await cloudRequest("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ email, token, password }),
    });
    els.cloudResetTokenInput.value = "";
    els.cloudNewPasswordInput.value = "";
    toast("密码已重置，请重新登录");
  });
}

async function refreshCloudUsage(options = {}) {
  if (!state.cloud?.authenticated) return;
  const data = await cloudRequest("/usage/current", { method: "GET" });
  state.cloud.usage = data.usage || null;
  state.cloud.limits = data.limits || null;
  if (!options.silent) toast("云端用量已刷新");
}

async function refreshCloudBilling(options = {}) {
  if (!state.cloud?.authenticated) return;
  try {
    const data = await cloudRequest("/billing/summary", { method: "GET" });
    state.cloud.billing = data || null;
    if (!options.silent) toast("账单与套餐已刷新");
  } catch (error) {
    if (error.status === 403) {
      try {
        const data = await cloudRequest("/billing/manual-orders", { method: "GET" });
        state.cloud.billing = {
          organization: state.cloud.activeOrganization || null,
          checkout: { enabled: false, available_plans: [] },
          manual_payment: data.manual_payment || {},
          manual_orders: data.orders || [],
          credits: data.credits || null,
          credit_ledger: data.credit_ledger || [],
        };
        return;
      } catch {
        state.cloud.billing = null;
      }
    }
    state.cloud.billing = null;
    if (error.status !== 403 && !options.silent) {
      toast(`账单信息读取失败：${error.message}`, "warn");
    }
  }
}

async function cloudSubmitManualOrder() {
  const packageId = els.cloudManualPackageSelect?.value || "";
  const paymentChannel = els.cloudManualPaymentMethodSelect?.value || "wechat";
  const payerNote = (els.cloudManualOrderNoteInput?.value || "").trim();
  const proofText = (els.cloudManualProofInput?.value || "").trim();
  if (!packageId) {
    toast("请选择充值套餐", "warn");
    return;
  }
  if (!payerNote && !proofText) {
    toast("请填写付款备注或凭证说明，方便管理员核对", "warn");
    els.cloudManualOrderNoteInput?.focus();
    return;
  }
  await withLoading(els.cloudManualOrderBtn, "提交中", async () => {
    const data = await cloudRequest("/billing/manual-orders", {
      method: "POST",
      body: JSON.stringify({
        package_id: packageId,
        payment_channel: paymentChannel,
        payer_note: payerNote,
        proof_text: proofText,
      }),
    });
    if (els.cloudManualOrderNoteInput) els.cloudManualOrderNoteInput.value = "";
    if (els.cloudManualProofInput) els.cloudManualProofInput.value = "";
    await refreshCloudBilling({ silent: true });
    renderCloudPanel();
    const orderId = data.order?.id ? `（订单号：${data.order.id}）` : "";
    toast(`充值订单已提交：${data.order?.title || packageId}${orderId}`);
  });
}

async function cloudExportMyData() {
  await withLoading(els.cloudExportDataBtn, "导出中", async () => {
    const data = await cloudRequest("/me/export", { method: "GET" });
    downloadBlob(`mowen-cloud-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), "application/json;charset=utf-8");
    toast("我的云端数据已导出");
  });
}

async function cloudDeleteAccount() {
  if (!window.confirm("确定删除云端账号吗？这会退出云端并停用当前账号。")) return;
  await withLoading(els.cloudDeleteAccountBtn, "删除中", async () => {
    await cloudRequest("/me", { method: "DELETE" });
    state.cloud = {
      ...(state.cloud || {}),
      authenticated: false,
      user: null,
      activeOrganization: null,
      membership: null,
      members: [],
      invitations: [],
      usage: null,
      limits: null,
    };
    persist();
    renderCloudPanel();
    toast("云端账号已删除，本地数据仍保留", "warn");
  });
}

function openStandaloneAdminPage() {
  if (!["owner", "admin"].includes(state.cloud?.membership?.role || "")) {
    toast("只有管理员可以查看管理后台", "warn");
    switchTab("cloud");
    return;
  }
  window.location.href = "./admin.html";
}

function handleHashRoute() {
  if (window.location.hash === "#admin") {
    openStandaloneAdminPage();
  } else if (window.location.hash === "#cloud") {
    switchMainView("cloud");
  }
}

async function cloudSendFeedback() {
  const message = els.cloudFeedbackInput.value.trim();
  if (!message) {
    toast("请先填写反馈内容", "warn");
    return;
  }
  await withLoading(els.cloudSendFeedbackBtn, "提交中", async () => {
    await cloudRequest("/feedback", {
      method: "POST",
      body: JSON.stringify({ message, source: "cloud_panel" }),
    });
    els.cloudFeedbackInput.value = "";
    toast("反馈已提交");
  });
}

async function cloudSaveCurrentDocument() {
  const doc = getCurrentDoc();
  if (!doc || doc.deletedAt) {
    toast("请先选择要同步的文档", "warn");
    return;
  }
  await withLoading(els.cloudSaveDocBtn, "同步中", async () => {
    const payload = {
      title: doc.title || "未命名文档",
      type: doc.type || "custom",
      folder_id: doc.folderId || "",
      local_id: doc.id,
      content: doc.content || "",
      metadata: {
        localId: doc.id,
        type: doc.type || "",
        folderId: doc.folderId || "",
        styleId: doc.styleId || "",
      },
      expected_version: doc.cloudVersion || undefined,
    };
    const data = await saveCloudResourceWithConflict({
      localName: doc.title || "当前文档",
      endpoint: doc.cloudId ? `/documents/${doc.cloudId}` : "/documents",
      method: doc.cloudId ? "PUT" : "POST",
      payload,
      remoteKey: "document",
      applyRemote: (remoteDoc) => applyRemoteDocumentToLocal(doc, remoteDoc),
      createLocalCopy: (remoteDoc) => createDocumentCopyFromRemote(remoteDoc),
    });
    doc.cloudId = data.document.id;
    doc.cloudUpdatedAt = data.document.updated_at || now();
    doc.cloudVersion = data.document.version || 1;
    persist();
    renderEditor();
    toast(`当前文档已同步到云端：${getCloudDocumentLocation(data.document)}`);
  });
}

async function cloudPullDocuments() {
  await withLoading(els.cloudPullDocsBtn, "拉取中", async () => {
    const data = await cloudRequest("/documents", { method: "GET" });
    const documents = Array.isArray(data.documents) ? data.documents : [];
    let imported = 0;
    documents.forEach((remoteDoc) => {
      const existing = state.docs.find((doc) => doc.cloudId === remoteDoc.id);
      const metadata = remoteDoc.metadata || {};
      if (existing) {
        existing.title = remoteDoc.title || existing.title;
        existing.content = remoteDoc.content || "";
        existing.type = remoteDoc.type || metadata.type || existing.type || "custom";
        existing.folderId = metadata.folderId || existing.folderId || state.folders[0]?.id || "";
        existing.styleId = metadata.styleId || existing.styleId || state.styles[0]?.id || "";
        existing.cloudUpdatedAt = remoteDoc.updated_at || now();
        existing.cloudVersion = remoteDoc.version || 1;
        existing.updatedAt = now();
        existing.deletedAt = remoteDoc.deleted_at || "";
        return;
      }
      state.docs.push({
        id: createId(),
        title: remoteDoc.title || "云端文档",
        type: remoteDoc.type || metadata.type || "custom",
        folderId: metadata.folderId || state.folders[0]?.id || "",
        styleId: metadata.styleId || state.styles[0]?.id || "",
        content: remoteDoc.content || "",
        createdAt: remoteDoc.created_at || now(),
        updatedAt: remoteDoc.updated_at || now(),
        deletedAt: remoteDoc.deleted_at || "",
        deletedFromFolderId: "",
        cloudId: remoteDoc.id,
        cloudUpdatedAt: remoteDoc.updated_at || now(),
        cloudVersion: remoteDoc.version || 1,
      });
      imported += 1;
    });
    persist();
    eventBus.emit(EVENTS.RENDER_DOC_LIST);
    eventBus.emit(EVENTS.RENDER_EDITOR);
    toast(`已从云端拉取 ${documents.length} 份文档，新增 ${imported} 份`);
  });
}

async function saveCloudResourceWithConflict({ localName, endpoint, method, payload, remoteKey, applyRemote, createLocalCopy }) {
  try {
    return await cloudRequest(endpoint, { method, body: JSON.stringify(payload) });
  } catch (error) {
    if (error.status !== 409 || error.payload?.error?.code !== "version_conflict") throw error;
    const remote = error.payload?.error?.details?.remote;
    const currentVersion = error.payload?.error?.details?.current_version || remote?.version || "未知";
    const choice = window.prompt(
      `检测到云端版本冲突：${localName}\n云端版本：v${currentVersion}\n输入 1 覆盖云端；输入 2 另存本地副本后拉取云端；输入 3 仅拉取云端。`,
      "3",
    );
    if (choice === "1") {
      return cloudRequest(endpoint, {
        method,
        body: JSON.stringify({ ...payload, expected_version: undefined, force: true }),
      });
    }
    if (choice === "2") {
      createLocalCopy?.(remote);
      applyRemote?.(remote);
      persist();
      toast("已保留本地副本，并拉取云端版本", "warn");
      return { [remoteKey]: remote };
    }
    applyRemote?.(remote);
    persist();
    toast("已拉取云端版本，本地改动未覆盖云端", "warn");
    return { [remoteKey]: remote };
  }
}

function applyRemoteDocumentToLocal(doc, remoteDoc) {
  if (!remoteDoc) return;
  const metadata = remoteDoc.metadata || {};
  doc.title = remoteDoc.title || doc.title;
  doc.content = remoteDoc.content || "";
  doc.type = remoteDoc.type || metadata.type || doc.type || "custom";
  doc.folderId = metadata.folderId || doc.folderId || state.folders[0]?.id || "";
  doc.styleId = metadata.styleId || doc.styleId || state.styles[0]?.id || "";
  doc.cloudId = remoteDoc.id;
  doc.cloudUpdatedAt = remoteDoc.updated_at || now();
  doc.cloudVersion = remoteDoc.version || 1;
  doc.updatedAt = now();
  eventBus.emit(EVENTS.RENDER_DOC_LIST);
  eventBus.emit(EVENTS.RENDER_EDITOR);
}

function createDocumentCopyFromRemote(remoteDoc) {
  const current = getCurrentDoc();
  if (!current) return remoteDoc;
  state.docs.push({
    ...current,
    id: createId(),
    title: `${current.title || "本地副本"}（冲突副本）`,
    cloudId: "",
    cloudUpdatedAt: "",
    cloudVersion: "",
    createdAt: now(),
    updatedAt: now(),
  });
  eventBus.emit(EVENTS.RENDER_DOC_LIST);
  return remoteDoc;
}

async function cloudSaveCurrentWriter() {
  const style = getCurrentCloudWriter();
  if (!style) {
    toast("请先选择要同步的执笔人", "warn");
    return;
  }
  await withLoading(els.cloudSaveWriterBtn, "同步中", async () => {
    const payload = {
      name: style.name || "未命名执笔人",
      handle: normalizeHandle(style.handle || style.name),
      category: style.category || "自定义",
      description: style.description || "",
      enabled: style.enabled !== false,
      summary_md: style.summary || "",
      skill_json: parseJsonSafely(style.skillJson || "{}", {}),
      quality_report: style.qualityReport || {},
      expected_version: style.cloudVersion || undefined,
    };
    const data = await saveCloudResourceWithConflict({
      localName: style.name || "当前执笔人",
      endpoint: style.cloudId ? `/writers/${style.cloudId}` : "/writers",
      method: style.cloudId ? "PUT" : "POST",
      payload,
      remoteKey: "writer",
      applyRemote: (remoteWriter) => applyRemoteWriterToLocal(style, remoteWriter),
      createLocalCopy: (remoteWriter) => createWriterCopyFromRemote(remoteWriter),
    });
    style.cloudId = data.writer.id;
    style.cloudUpdatedAt = data.writer.updated_at || now();
    style.cloudVersion = data.writer.version || 1;
    style.updatedAt = now();
    persist();
    eventBus.emit(EVENTS.RENDER_STYLE_LIST);
    toast(`执笔人已同步到云端：${getCloudWriterLocation(data.writer)}`);
  });
}

function applyRemoteWriterToLocal(style, remoteWriter) {
  if (!remoteWriter) return;
  const next = normalizeSkill({
    ...style,
    name: remoteWriter.name || style.name,
    handle: remoteWriter.handle || style.handle,
    category: remoteWriter.category || style.category || "自定义",
    description: remoteWriter.description || style.description || "",
    enabled: remoteWriter.enabled !== false,
    summary: remoteWriter.summary_md || style.summary || "",
    skillJson: JSON.stringify(remoteWriter.skill_json || {}, null, 2),
    qualityReport: remoteWriter.quality_report || style.qualityReport || null,
    versions: style.versions || [],
    cloudId: remoteWriter.id,
    cloudUpdatedAt: remoteWriter.updated_at || now(),
    cloudVersion: remoteWriter.version || 1,
    updatedAt: now(),
  });
  Object.assign(style, next);
  if (ui.editingStyle?.id === style.id) ui.editingStyle = clone(style);
  eventBus.emit(EVENTS.RENDER_STYLE_SELECT);
  eventBus.emit(EVENTS.RENDER_STYLE_LIST);
  eventBus.emit(EVENTS.RENDER_STYLE_EDITOR);
}

function createWriterCopyFromRemote(remoteWriter) {
  const style = getCurrentCloudWriter();
  if (!style) return remoteWriter;
  state.styles.push(normalizeSkill({
    ...style,
    id: createId(),
    name: `${style.name || "本地副本"}（冲突副本）`,
    handle: normalizeHandle(`${style.handle || style.name || "copy"}${state.styles.length + 1}`),
    cloudId: "",
    cloudUpdatedAt: "",
    cloudVersion: "",
    createdAt: now(),
    updatedAt: now(),
  }));
  eventBus.emit(EVENTS.RENDER_STYLE_LIST);
  return remoteWriter;
}

async function cloudPullWriters() {
  await withLoading(els.cloudPullWritersBtn, "拉取中", async () => {
    const data = await cloudRequest("/writers", { method: "GET" });
    const writers = Array.isArray(data.writers) ? data.writers : [];
    let imported = 0;
    writers.forEach((remoteWriter) => {
      const existing = state.styles.find((style) => style.cloudId === remoteWriter.id || style.handle === remoteWriter.handle);
      const next = normalizeSkill({
        ...(existing || {}),
        id: existing?.id || createId(),
        name: remoteWriter.name || existing?.name || "云端执笔人",
        handle: remoteWriter.handle || existing?.handle || "",
        category: remoteWriter.category || existing?.category || "自定义",
        description: remoteWriter.description || existing?.description || "",
        enabled: remoteWriter.enabled !== false,
        summary: remoteWriter.summary_md || existing?.summary || "",
        skillJson: JSON.stringify(remoteWriter.skill_json || {}, null, 2),
        qualityReport: remoteWriter.quality_report || existing?.qualityReport || null,
        versions: Array.isArray(remoteWriter.versions) ? remoteWriter.versions.map(mapRemoteWriterVersion) : existing?.versions || [],
        examples: existing?.examples || [],
        createdAt: remoteWriter.created_at || existing?.createdAt || now(),
        updatedAt: remoteWriter.updated_at || now(),
        cloudId: remoteWriter.id,
        cloudUpdatedAt: remoteWriter.updated_at || now(),
        cloudVersion: remoteWriter.version || 1,
      });
      if (existing) Object.assign(existing, next);
      else {
        state.styles.push(next);
        imported += 1;
      }
    });
    if (!ui.editingStyle && state.styles[0]) ui.editingStyle = clone(state.styles[0]);
    persist();
    eventBus.emit(EVENTS.RENDER_STYLE_SELECT);
    eventBus.emit(EVENTS.RENDER_STYLE_LIST);
    eventBus.emit(EVENTS.RENDER_STYLE_EDITOR);
    toast(`已从云端拉取 ${writers.length} 个执笔人，新增 ${imported} 个`);
  });
}

function mapRemoteWriterVersion(version) {
  return {
    id: version.id || createId(),
    version: Number(version.version || 1),
    createdAt: version.created_at || now(),
    summary: version.summary_md || "",
    skillJson: JSON.stringify(version.skill_json || {}, null, 2),
    qualityReport: version.quality_report || null,
    sourceExamples: [],
    analyses: [],
    analysis: "",
    aggregation: "",
    aggregationData: null,
    testDoc: "",
    testReport: "",
  };
}

function getCurrentCloudWriter() {
  return (
    state.styles.find((style) => style.id === ui.selectedSkillCardId) ||
    state.styles.find((style) => style.id === ui.editingStyle?.id) ||
    state.styles[0] ||
    null
  );
}

function getCloudSettingsLocation() {
  return `${normalizeCloudBaseUrl(state.cloud?.apiBaseUrl || DEFAULT_CLOUD_API_BASE_URL)} / 当前工作区`;
}

function getCloudDocumentLocation(document) {
  return `${state.cloud?.activeOrganization?.name || "云端工作区"} / 文档 / ${document.title || document.id}`;
}

function getCloudWriterLocation(writer) {
  return `${state.cloud?.activeOrganization?.name || "云端工作区"} / 执笔人 / @${writer.handle || writer.id}`;
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
  return documentPanelController.createDocument(seed);
}

function duplicateCurrentDocument() {
  return documentPanelController.duplicateCurrentDocument();
}

function duplicateDocument(docId) {
  return documentPanelController.duplicateDocument(docId);
}

function moveDocument(sourceId, targetId, placement) {
  return documentPanelController.moveDocument(sourceId, targetId, placement);
}

function moveDocumentToTop(docId) {
  return documentPanelController.moveDocumentToTop(docId);
}

function moveDocumentToBottom(docId) {
  return documentPanelController.moveDocumentToBottom(docId);
}

function deleteCurrentDocument() {
  return documentPanelController.deleteCurrentDocument();
}

function restoreDocument(docId) {
  return documentPanelController.restoreDocument(docId);
}

function restoreAllTrashDocuments() {
  return documentPanelController.restoreAllTrashDocuments();
}

function permanentlyDeleteDocument(docId) {
  return documentPanelController.permanentlyDeleteDocument(docId);
}

function clearTrashDocuments() {
  return documentPanelController.clearTrashDocuments();
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

async function syncDocumentToRealFolder(doc) {
  return folderManager.syncDocumentToRealFolder(doc);
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

async function importDocuments(event) {
  return documentPanelController.importDocuments(event);
}

async function importDocumentFiles(files) {
  return documentPanelController.importDocumentFiles(files);
}

async function exportCurrentDocument() {
  return documentPanelController.exportCurrentDocument();
}

function exportWorkspaceBackup() {
  return documentPanelController.exportWorkspaceBackup();
}

function openSkillBuilderModal(skillId = null) {
  return skillBuilderModalController.open(skillId);
}

function closeSkillBuilderModal({ restoreFocus = true } = {}) {
  return skillBuilderModalController.close({ restoreFocus });
}

function getSelectedSkillCategory() {
  return skillBuilderModalController.getSelectedCategory();
}

function updateSkillBuildState(skillId, patch) {
  return skillWorkbenchController.updateBuildState(skillId, patch);
}

function createSkillCardProgress(skillId) {
  return skillWorkbenchController.createCardProgress(skillId);
}

function getSkillBuildResult(style, version, outputs) {
  return skillWorkbenchController.getBuildResult(style, version, outputs);
}

function invokeSkillFromCard(skillId) {
  return skillWorkbenchController.invokeFromCard(skillId);
}

function copySkillHandleFromCard(skillId) {
  return skillWorkbenchController.copyHandleFromCard(skillId);
}

function toggleSkillEnabledFromCard(skillId, enabled) {
  return skillWorkbenchController.toggleEnabledFromCard(skillId, enabled);
}

function openSkillTestFromCard(skillId) {
  return skillWorkbenchController.openTestFromCard(skillId);
}

function editSkillMarkdownFromCard(skillId) {
  return skillWorkbenchController.editMarkdownFromCard(skillId);
}

function updateSkillMarkdownSaveState() {
  return skillWorkbenchController.updateMarkdownSaveState();
}

function flushSkillMarkdownEdits() {
  return skillWorkbenchController.flushMarkdownEdits();
}

function saveSkillMarkdownEdits({ silent = false } = {}) {
  return skillWorkbenchController.saveMarkdownEdits({ silent });
}

function exportSkillPackageById(skillId) {
  return skillWorkbenchController.exportPackageById(skillId);
}

function deleteSkillById(skillId) {
  return skillWorkbenchController.deleteById(skillId);
}

function cancelSkillBuild(skillId) {
  return skillWorkbenchController.cancelBuild(skillId);
}

function exportSkillMarkdown() {
  const skill = {
    ...ui.editingStyle,
    name: els.styleNameInput.value.trim() || ui.editingStyle.name || "未命名执笔人",
    handle: normalizeHandle(els.skillHandleInput.value || ui.editingStyle.handle || ui.editingStyle.name),
    summary: els.styleSummaryInput.value,
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
    category: getSelectedSkillCategory(),
    description: els.skillDescriptionInput.value.trim() || ui.editingStyle.description || "",
  };
  const content = normalizeSkillJsonText(els.skillJsonInput.value, skill);
  const fileName = `${sanitizeFileName(skill.name)}-执笔人规则.json`;
  downloadBlob(fileName, content, "application/json;charset=utf-8");
  toast(`已导出执笔人规则 JSON 到：${getDownloadLocation(fileName)}`);
}

function exportSkillPackage() {
  const skill = syncEditingStyleFromInputs();
  if (!skill.name.trim()) {
    toast("请先填写执笔人名称", "warn");
    return;
  }
  const packageData = skillManager.createSkillPackage(skill);
  const findings = scanPrivacyRisksInObject(packageData.skill || packageData, { path: "执笔人包" });
  if (!confirmPrivacyRiskNotice("导出的执笔人包可能包含敏感或个案信息。", findings)) {
    toast("已取消导出执笔人包", "warn");
    return;
  }
  const fileName = `${sanitizeFileName(skill.name)}.skill.json`;
  downloadBlob(fileName, JSON.stringify(packageData, null, 2), "application/json;charset=utf-8");
  toast(`已导出执笔人包到：${getDownloadLocation(fileName)}`);
}

async function importSkillPackages(event) {
  const files = Array.from(event.target.files || []);
  await importSkillPackageFiles(files);
  event.target.value = "";
}

async function importSkillPackageFiles(files) {
  if (!files || files.length === 0) return;
  let importedCount = 0;
  let cancelledCount = 0;
  const failed = [];
  await withProgress(`正在导入 ${files.length} 个执笔人包`, async (progress) => {
    for (const [index, file] of files.entries()) {
      progress.update(`正在读取 ${file.name}`, Math.round((index / files.length) * 72) + 12);
      try {
        const payload = JSON.parse(await file.text());
        const preview = skillManager.inspectSkillPackageImport(payload);
        const conflictMode = confirmSkillPackageImport(file.name, preview);
        if (conflictMode === "cancel") {
          cancelledCount += 1;
          continue;
        }
        skillManager.importSkillPackage(payload, { draft: preview.draft, conflictMode });
        importedCount += 1;
      } catch (error) {
        failed.push(file.name);
        console.warn("导入执笔人包失败", file.name, error);
      }
    }
    progress.update("正在刷新执笔人列表", 92);
  });
  if (importedCount > 0) {
    switchTab("style");
    toast(`已导入 ${importedCount} 个执笔人${failed.length ? `，${failed.length} 个文件格式不正确` : ""}`);
  } else if (cancelledCount > 0 && failed.length === 0) {
    toast("已取消导入执笔人包", "warn");
  } else {
    toast("未导入执笔人，请检查 .skill.json 文件格式", "warn");
  }
}

function confirmSkillPackageImport(fileName, preview) {
  const header = [
    `即将导入执笔人包：${fileName}`,
    "",
    preview.previewText,
    "",
    preview.sensitiveFindings.length
      ? "检测到疑似敏感字段，请确认来源可信并检查规则内容后再导入。"
      : "请确认来源可信后再导入。",
  ].join("\n");
  if (preview.duplicate) {
    const choice = window.prompt(`${header}\n\n输入 1 覆盖现有执笔人；输入 2 另存为新执笔人；输入 3 取消导入。`, "2");
    if (choice === "1") return "replace";
    if (choice === "2" || choice === "") return "rename";
    return "cancel";
  }
  return window.confirm(`${header}\n\n确认导入？`) ? "rename" : "cancel";
}

function confirmPrivacyRiskNotice(intro, findings = []) {
  if (!findings.length) return true;
  return window.confirm([
    intro,
    "",
    "本地预检发现以下疑似敏感或个案信息：",
    formatPrivacyRiskSummary(findings),
    "",
    "建议先脱敏或移除不应发送/分享的内容。是否继续？",
  ].join("\n"));
}

async function linkRealFolder() {
  return folderManager.linkRealFolder();
}

async function syncRealFolder(folderId) {
  return folderManager.syncRealFolder(folderId);
}

function openSkillDetail(skillId) {
  flushSkillMarkdownEdits();
  const result = skillRenderer.openSkillDetail(skillId);
  ui.skillMarkdownDirty = false;
  ui.skillMarkdownDirtySkillId = null;
  updateSkillMarkdownSaveState();
  return result;
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

function getFocusableElements(root) {
  if (!root) return [];
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "textarea:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");
  return Array.from(root.querySelectorAll(selector)).filter((element) => {
    if (element.closest("[hidden]")) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  });
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
        "标题、正文、要点、表格和备注必须保留为可编辑文本或表格数据，不得整页截图化",
        "标题、正文和要点需要控制字数，内容过密时拆成多页",
        "每页都要补充演讲者备注，备注只服务讲述，不要挤进页面正文",
        "根据内容选择 cover、section、content、data、roadmap、orgchart、imageText、appendix、closing 等布局",
      ],
      recommended: [styleDescription, "正式汇报建议以 cover 开场，以 closing 或 appendix 收束，并在中间穿插数据页、路线图或对比页形成节奏。"],
      optional: [],
    },
    forbidden: ["不得依赖网页脚本、CSS 动画、本机路径、外部图片 URL 或截图式输出", "不得编造用户未提供的事实、数字、时间和责任人"],
    generation_steps: ["判断演示目标", "拆分页面结构", "选择页面类型", "控制文字密度", "补充演讲者备注", "执行结构自检"],
    self_checklist: ["页数是否符合要求", "每页标题是否明确", "文字密度是否适合演示页", "表格是否适合演示页", "备注是否完整", "是否存在外部资源或网页效果依赖", "布局是否有节奏变化"],
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

async function importStyleExamples(event) {
  const files = Array.from(event.target.files || []);
  await importStyleExampleFiles(files);
  event.target.value = "";
}

async function importStyleDropFiles(files) {
  const fileList = Array.from(files || []);
  const skillPackages = fileList.filter(isSkillPackageFile);
  const exampleFiles = fileList.filter((file) => !isSkillPackageFile(file));
  if (skillPackages.length > 0) {
    await importSkillPackageFiles(skillPackages);
  }
  if (exampleFiles.length > 0) {
    await importStyleExampleFiles(exampleFiles);
  }
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
  skillRenderer.renderSkillDetailExamples();
  const skippedCount = skippedFiles.length + sizeSkipped.length;
  toast(`已添加 ${importedCount} 份示范到：${getSkillTrainingLocation(ui.editingStyle)}${skippedCount ? `，已跳过 ${skippedCount} 个暂不支持、过大或读取失败的文件` : ""}`);
}

async function summarizeStyle() {
  const style = syncEditingStyleFromInputs();
  if (!style.name.trim()) {
    toast("请输入执笔人名称", "warn");
    els.styleNameInput.focus();
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
  const findings = scanPrivacyRisksInObject(
    (style.examples || []).map((example) => ({ name: example.name, text: example.text })),
    { path: "训练样本" },
  );
  if (!confirmPrivacyRiskNotice("训练样本将发送给已配置的 AI 接口用于生成执笔人。", findings)) {
    toast("已取消生成执笔人", "warn");
    return;
  }

  style.status = "building";
  style.buildProgress = { message: "准备构建执笔人", progress: 8 };
  style.lastBuildError = "";
  style.lastBuildAt = now();

  let saved;
  try {
    saved = commitSkillToState(style);
  } catch (error) {
    toast(error.message || "保存执笔人失败", "error");
    return;
  }

  closeSkillBuilderModal({ restoreFocus: false });
  ui.selectedSkillCardId = saved.id;
  switchTab("style");
  const taskKey = `skill-build:${saved.id}`;
  if (ui.activeTasks[taskKey]) {
    toast("该执笔人正在生成中", "warn");
    return;
  }

  const controller = new AbortController();
  ui.activeTasks[taskKey] = {
    key: taskKey,
    controller,
    button: null,
    oldHtml: "",
    cancelToast: "已取消本次执笔人构建",
  };
  const progress = createSkillCardProgress(saved.id);

  try {
    const outputs = await skillBuilder.buildSkillWithAiChain(saved, progress, { signal: controller.signal });
    throwIfTaskAborted(controller.signal);
    const version = skillBuilder.createSkillVersion(saved, outputs);
    progress.update("正在保存执笔人版本", 92);
    const generatedRule = parseSkillJsonObject(outputs.skillJson, saved);
    const nextStyle = {
      ...saved,
      description: generatedRule.description || generatedRule.concise_instruction || saved.description || "",
      analyses: outputs.analyses,
      analysis: outputs.analysis,
      aggregationData: outputs.aggregationData,
      aggregation: outputs.aggregation,
      qualityReport: outputs.qualityReport,
      summary: outputs.markdown,
      skillJson: outputs.skillJson,
      status: "ready",
      buildProgress: null,
      lastBuildError: "",
      lastBuildAt: now(),
      lastTest: {
        id: createId(),
        createdAt: now(),
        prompt: "AI 自动生成的执笔人测试",
        result: outputs.testDoc,
        report: outputs.testReport,
      },
      versions: [...(saved.versions || []), version].slice(-30),
    };
    nextStyle.lastBuildResult = getSkillBuildResult(nextStyle, version, outputs);
    const committed = commitSkillToState(nextStyle);
    eventBus.emit(EVENTS.RENDER_STYLE_EDITOR);
    toast(`已生成 v${version.version} 并保存到：${getSkillLocation(committed)}`);
  } catch (error) {
    const isCanceled = isTaskAbortError(error) || controller.signal.aborted;
    updateSkillBuildState(saved.id, {
      status: "failed",
      buildProgress: null,
      lastBuildError: isCanceled ? "用户取消了本次生成" : friendlyAiErrorMessage(error) || error.message || "生成失败",
      lastBuildAt: now(),
    });
    toast(isCanceled ? "已取消本次执笔人构建" : friendlyAiErrorMessage(error) || "执笔人生成失败", isCanceled ? "warn" : "error");
  } finally {
    if (ui.activeTasks[taskKey]?.controller === controller) delete ui.activeTasks[taskKey];
  }
}

function syncEditingStyleFromInputs() {
  return skillManager.syncEditingStyleFromInputs();
}

async function runSkillGenerationTest() {
  if (cancelActiveTask("skill-test")) return;
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

  await withCancelableTask({
    key: "skill-test",
    button: els.runSkillTestBtn,
    busyText: "测试中",
    progressMessage: "正在测试执笔人生成效果",
    cancelToast: "已取消本次执笔人测试",
  }, async ({ progress, signal }) => {
    const skillJson = parseSkillJsonObject(style.skillJson, style);
    progress.update("步骤 1/2：正在生成测试文档", 35);
    const outputs = await skillBuilder.testSkillOnGeneration(style, skillJson, { 用户测试任务: testPrompt }, { signal });
    throwIfTaskAborted(signal);
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
  });
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
  openSkillBuilderModal(style.id);
}

function normalizeSkillJsonText(value, style) {
  return skillManager.normalizeSkillJsonText(value, style);
}

function parseSkillJsonObject(value, style) {
  return skillManager.parseSkillJsonObject(value, style);
}

function saveStyle() {
  const saved = skillManager.saveStyle();
  if (saved) {
    closeSkillBuilderModal({ restoreFocus: false });
    eventBus.emit(EVENTS.RENDER_STYLE_EDITOR);
    eventBus.emit(EVENTS.RENDER_STYLE_LIST);
  }
  return saved;
}

function commitSkillToState(draft) {
  return skillManager.commitSkillToState(draft);
}

function deleteStyle() {
  const deleted = skillManager.deleteStyle();
  if (deleted) {
    closeSkillBuilderModal({ restoreFocus: false });
    hideSkillDetailMenu();
  }
  return deleted;
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

async function withCancelableTask(options, task) {
  const {
    key,
    button,
    busyText = "处理中",
    progressMessage = "正在处理",
    cancelToast = "已取消本次操作",
    initialProgress = 8,
  } = options;
  const controller = new AbortController();
  const oldHtml = button?.innerHTML || "";
  const activeTask = {
    key,
    controller,
    button,
    oldHtml,
    cancelToast,
  };
  ui.activeTasks[key] = activeTask;
  setCancelableButton(button, `${busyText}…点击取消`);
  try {
    return await withProgress(
      progressMessage,
      (progress) => task({
        progress,
        signal: controller.signal,
      }),
      initialProgress,
      {
        signal: controller.signal,
        onCancel: () => cancelActiveTask(key),
      },
    );
  } catch (error) {
    if (isTaskAbortError(error) || controller.signal.aborted) {
      toast(cancelToast, "warn");
      return null;
    }
    toast(friendlyAiErrorMessage(error) || "操作失败", "error");
    return null;
  } finally {
    if (ui.activeTasks[key] === activeTask) delete ui.activeTasks[key];
    restoreCancelableButton(activeTask);
  }
}

function cancelActiveTask(key) {
  const activeTask = ui.activeTasks[key];
  if (!activeTask) return false;
  if (!activeTask.controller.signal.aborted) {
    activeTask.controller.abort();
  }
  if (activeTask.button) {
    activeTask.button.disabled = true;
    activeTask.button.classList.remove("is-cancelable-task");
    activeTask.button.classList.add("is-canceling-task");
    activeTask.button.textContent = "正在取消...";
  }
  return true;
}

function setCancelableButton(button, text) {
  if (!button) return;
  button.disabled = false;
  button.textContent = text;
  button.classList.add("is-cancelable-task");
  button.classList.remove("is-canceling-task");
  button.setAttribute("aria-busy", "true");
}

function restoreCancelableButton(activeTask) {
  const button = activeTask?.button;
  if (!button) return;
  button.disabled = false;
  button.innerHTML = activeTask.oldHtml;
  button.classList.remove("is-cancelable-task", "is-canceling-task");
  button.removeAttribute("aria-busy");
  if (window.lucide) window.lucide.createIcons();
}

function throwIfTaskAborted(signal) {
  if (signal?.aborted) {
    const error = new Error("已取消本次操作");
    error.name = "AbortError";
    error.code = "aborted";
    throw error;
  }
}

function isTaskAbortError(error) {
  return isAbortError?.(error) || error?.name === "AbortError" || error?.code === "aborted";
}

async function withProgress(message, task, initialProgress = 8, options = {}) {
  return progressController.withProgress(message, task, initialProgress, options);
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
  if (tabName === "cloud") {
    switchMainView("cloud");
    return;
  }
  if (tabName === "ppt") {
    switchMainView("ppt");
    return;
  }
  switchMainView("editor");
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
  if (els.cloudTopBtn) {
    els.cloudTopBtn.classList.toggle("active", ui.mainView === "cloud");
    els.cloudTopBtn.setAttribute("aria-pressed", String(ui.mainView === "cloud"));
  }
  if (window.lucide) window.lucide.createIcons();
}

function switchMainView(view = "editor") {
  const cloudActive = view === "cloud";
  const pptActive = view === "ppt";
  ui.mainView = cloudActive ? "cloud" : pptActive ? "ppt" : "editor";
  if (els.editorPanel) {
    els.editorPanel.dataset.mainView = ui.mainView;
    els.editorPanel.setAttribute("aria-label", cloudActive ? "我的云端" : pptActive ? "PPT 生成" : "文档编辑");
  }
  if (els.cloudPanel) {
    els.cloudPanel.hidden = !cloudActive;
  }
  if (els.pptPanel) {
    els.pptPanel.hidden = !pptActive;
    els.pptPanel.classList.toggle("active", pptActive);
  }
  if (pptActive) {
    document.querySelectorAll(".tab").forEach((button) => {
      const active = button.dataset.tab === "ppt";
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === "pptPanel");
    });
  } else if (!cloudActive && !document.querySelector(".tab-panel.active:not(#pptPanel)")) {
    document.querySelectorAll(".tab").forEach((button) => {
      const active = button.dataset.tab === "style";
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === "stylePanel");
    });
  }
  if (els.cloudTopBtn) {
    els.cloudTopBtn.classList.toggle("active", cloudActive);
    els.cloudTopBtn.setAttribute("aria-pressed", String(cloudActive));
  }
  if ((cloudActive || pptActive) && els.apiTopBtn) {
    els.apiTopBtn.classList.remove("active");
    els.apiTopBtn.setAttribute("aria-pressed", "false");
  }
  if (cloudActive || pptActive) {
    if (layoutController.isMobileWorkspace()) layoutController.setMobileView("editor");
    if (cloudActive) renderCloudPanel();
    window.requestAnimationFrame(() => {
      (cloudActive ? els.cloudPanel : els.pptPanel)?.focus({ preventScroll: true });
    });
  }
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

function downloadCsv(fileName, rows) {
  const content = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  downloadBlob(fileName, `\ufeff${content}\n`, "text/csv;charset=utf-8");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.left = "-9999px";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

function toast(message, tone = "info") {
  showToast(els.toastRegion, message, tone);
}
