import { DEFAULT_STYLE_SKILL, DEFAULT_SYSTEM_PROMPT, folderColors } from "../config/constants.js";

export function initializeWorkspaceState(options = {}) {
  const {
    state,
    ui = {},
    defaultCloudApiBaseUrl = "",
    createId = defaultCreateId,
    now = () => new Date().toISOString(),
    clone = (value) => structuredClone(value),
    normalizeFolder = (folder) => folder,
    normalizeSkill = (skill) => skill,
    normalizeCustomTypes = (types) => (Array.isArray(types) ? types : []),
    normalizeCloudBaseUrl = (value) => value,
    persist = () => {},
  } = options;
  if (!state || typeof state !== "object") {
    throw new TypeError("initializeWorkspaceState requires a mutable state object.");
  }

  if (!Array.isArray(state.folders) || state.folders.length === 0) {
    state.folders = createDefaultFolders({ createId, now });
  }
  state.folders = state.folders.map((folder) => normalizeFolder(folder));
  state.customTypes = normalizeCustomTypes(state.customTypes);

  if (!Array.isArray(state.styles) || state.styles.length === 0) {
    state.styles = [createDefaultNoticeWriter({ createId, now })];
  }
  state.styles = state.styles.map((style) => normalizeSkill(style));
  migrateLegacyBranding(state, { now });

  if (!Array.isArray(state.docs) || state.docs.length === 0) {
    state.docs = [createDefaultNoticeDocument({
      createId,
      now,
      folderId: state.folders[0]?.id || "",
      styleId: state.styles[0]?.id || "",
    })];
  }
  state.docs = state.docs.map((doc) => ({
    ...doc,
    deletedAt: doc.deletedAt || "",
    deletedFromFolderId: doc.deletedFromFolderId || "",
  }));

  state.settings = normalizeSettings(state.settings);
  state.cloud = normalizeCloudState(state.cloud, {
    defaultCloudApiBaseUrl,
    normalizeCloudBaseUrl,
  });

  ui.editingStyle = clone(state.styles[0]);
  persist();
  return state;
}

export function createDefaultFolders({ createId = defaultCreateId, now = () => new Date().toISOString() } = {}) {
  const officeId = createId();
  return [
    { id: officeId, name: "日常通知", kind: "tag", color: folderColors[0], createdAt: now() },
    { id: createId(), name: "会议材料", kind: "tag", color: folderColors[1], createdAt: now() },
    { id: createId(), name: "请示报告", kind: "tag", color: folderColors[2], createdAt: now() },
  ];
}

export function createDefaultNoticeWriter({ createId = defaultCreateId, now = () => new Date().toISOString() } = {}) {
  const timestamp = now();
  return {
    id: createId(),
    name: "通知写作",
    handle: "通知写作",
    category: "公文写作",
    description: "生成正式、清楚、适合组织内部发布的通知。",
    summary: DEFAULT_STYLE_SKILL,
    skillJson: createDefaultNoticeWriterJson(),
    examples: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createDefaultNoticeWriterJson() {
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

export function createDefaultNoticeDocument({
  createId = defaultCreateId,
  now = () => new Date().toISOString(),
  folderId = "",
  styleId = "",
} = {}) {
  const timestamp = now();
  return {
    id: createId(),
    title: "专项培训安排通知",
    type: "notice",
    folderId,
    styleId,
    content: DEFAULT_NOTICE_DOCUMENT_CONTENT,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function normalizeSettings(settings = {}) {
  const next = {
    provider: "openai-compatible",
    baseUrl: "",
    endpointPath: "/chat/completions",
    model: "",
    apiKey: "",
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    ...(settings || {}),
  };
  if (next.systemPrompt === LEGACY_SCHOOL_SYSTEM_PROMPT) {
    next.systemPrompt = DEFAULT_SYSTEM_PROMPT;
  }
  return next;
}

export function normalizeCloudState(cloud = {}, options = {}) {
  const {
    defaultCloudApiBaseUrl = "",
    normalizeCloudBaseUrl = (value) => value,
  } = options;
  const next = {
    apiBaseUrl: defaultCloudApiBaseUrl,
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
    ...(cloud || {}),
  };
  next.apiBaseUrl = normalizeCloudBaseUrl(next.apiBaseUrl || defaultCloudApiBaseUrl);
  next.organizations = Array.isArray(next.organizations) ? next.organizations : [];
  next.members = Array.isArray(next.members) ? next.members : [];
  next.invitations = Array.isArray(next.invitations) ? next.invitations : [];
  next.authenticated = Boolean(next.authenticated && next.user);
  return next;
}

export function migrateLegacyBranding(state, { now = () => new Date().toISOString() } = {}) {
  if (Array.isArray(state.styles)) {
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
  }

  if (!Array.isArray(state.docs)) return state;
  state.docs.forEach((doc) => {
    const content = String(doc.content || "");
    const isLegacyDefaultDoc = doc.title === "新学期工作安排通知" && content.includes("学校办公室");
    if (!isLegacyDefaultDoc) return;
    doc.title = "专项培训安排通知";
    doc.content = DEFAULT_NOTICE_DOCUMENT_CONTENT;
    doc.updatedAt = now();
  });
  return state;
}

export const LEGACY_SCHOOL_SYSTEM_PROMPT =
  "你是学校办公室文书助手，擅长撰写中文校务、公文、通知、总结、会议纪要和请示材料。输出要准确、稳妥、条理清晰，避免编造事实；缺少信息时用可替换占位表达。";

export const DEFAULT_NOTICE_DOCUMENT_CONTENT =
  "关于开展专项培训工作的通知\n\n各相关部门：\n\n为提升工作协同效率，规范业务办理流程，现将专项培训有关事项通知如下：\n\n一、培训时间为2026年5月20日（星期三）上午9:00，地点为会议室A。\n\n二、请各部门安排相关人员准时参加，并提前梳理本部门在实际工作中遇到的重点问题。\n\n三、培训结束后，请各部门于两个工作日内提交学习反馈和后续改进建议。\n\n请各部门高度重视，按要求做好参训组织和材料准备工作。\n\n综合办公室\n2026年5月14日";

function defaultCreateId() {
  return `id-${Math.random().toString(36).slice(2, 10)}`;
}
