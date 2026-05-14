export const STORAGE_KEY = "school-doc-manager:v1";
export const STORAGE_BOOTSTRAP_KEY = `${STORAGE_KEY}:bootstrap`;
export const WORKSPACE_DB_NAME = "school-doc-manager-workspace";
export const WORKSPACE_STORE_NAME = "workspace-state";
export const WORKSPACE_STATE_ID = "current";
export const HANDLE_DB_NAME = "school-doc-manager-handles";
export const HANDLE_STORE_NAME = "directory-handles";
export const SUPPORTED_TEXT_EXTENSIONS = [".txt", ".md", ".text", ".csv"];
export const SEARCH_RENDER_DEBOUNCE_MS = 160;
export const AI_REQUEST_TIMEOUT_MS = 90000;
export const AI_RETRY_BASE_DELAY_MS = 1000;
export const AI_MAX_RETRIES = 3;

export const DOCUMENT_TYPES = [
  {
    id: "notice",
    name: "通知",
    structure: "标题、发布对象、事项背景、具体安排、工作要求、落款日期",
  },
  {
    id: "plan",
    name: "工作方案",
    structure: "指导思想、工作目标、组织安排、实施步骤、保障措施",
  },
  {
    id: "summary",
    name: "工作总结",
    structure: "基本情况、主要做法、成效亮点、问题不足、下一步安排",
  },
  {
    id: "request",
    name: "请示报告",
    structure: "请示缘由、事项依据、具体请求、经费或资源说明、妥否请批示",
  },
  {
    id: "minutes",
    name: "会议纪要",
    structure: "会议时间、地点、参会人员、议题、议定事项、责任分工",
  },
  {
    id: "letter",
    name: "函件",
    structure: "称谓、来函背景、需沟通事项、办理建议、结束语",
  },
  {
    id: "speech",
    name: "讲话稿",
    structure: "开场、重点工作、要求部署、鼓励号召、结束语",
  },
  {
    id: "custom",
    name: "自定义",
    structure: "按输入要点组织结构，保持公文表达清晰规范",
  },
];

export const DEFAULT_SYSTEM_PROMPT =
  "你是中文事务文档写作助手，擅长撰写通知、方案、总结、会议纪要、请示报告、函件和讲话稿。输出要准确、稳妥、条理清晰，避免编造事实；缺少信息时用可替换占位表达。";

export const DEFAULT_STYLE_SKILL =
  "适用场景：组织内部通知、工作安排、事项告知等正式文本。\n结构要求：标题明确；正文先说明事项背景，再列出时间、地点、对象、安排和要求；末尾保留落款与日期。\n语言风格：庄重、简洁、可执行；多用“请”“现将有关事项通知如下”“请各部门结合实际落实”等表达。\n格式要求：层级编号清晰，重要事项分条列示，避免口语化和夸张形容。";

export const folderColors = ["#0f766e", "#b65a00", "#7a4d9f", "#b42318", "#3f6f87"];
