import { normalizeHandle, now } from "../../utils/helpers.js";

export function createPptSkillController({
  els = {},
  windowRef = globalThis,
  toast = () => {},
  commitSkillToState = () => null,
  getSkillLocation = () => "",
} = {}) {
  function savePptStyleAsSkill() {
    const styleDescription = els.pptCustomStyleInput?.value?.trim() || "";
    if (!styleDescription) {
      toast("请先填写自定义风格描述，再保存为 PPT 执笔人", "warn");
      els.pptCustomStyleInput?.focus?.();
      return null;
    }

    const title = els.pptTitleInput?.value?.trim() || "";
    const defaultName = title ? `${title} PPT 风格` : "自定义 PPT 风格";
    const name = windowRef.prompt?.("PPT 执笔人名称", defaultName);
    if (!name || !name.trim()) return null;

    const handle = normalizeHandle(name);
    if (!handle) {
      toast("PPT 执笔人名称需要包含中文、英文、数字、下划线或连字符", "warn");
      return null;
    }

    try {
      const saved = commitSkillToState(buildPptStyleSkillDraft({
        name: name.trim(),
        handle,
        styleDescription,
      }));
      toast(`已保存 PPT 执笔人 @${saved.handle} 到：${getSkillLocation(saved)}`);
      return saved;
    } catch (error) {
      toast(error.message || "保存 PPT 执笔人失败", "error");
      return null;
    }
  }

  return {
    savePptStyleAsSkill,
  };
}

export function buildPptStyleSkillDraft({ name, handle, styleDescription }) {
  const timestamp = now();
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
      recommended: [
        styleDescription,
        "正式汇报建议以 cover 开场，以 closing 或 appendix 收束，并在中间穿插数据页、路线图或对比页形成节奏。",
      ],
      optional: [],
    },
    forbidden: [
      "不得依赖网页脚本、CSS 动画、本机路径、外部图片 URL 或截图式输出",
      "不得编造用户未提供的事实、数字、时间和责任人",
    ],
    generation_steps: ["判断演示目标", "拆分页结构", "选择页面类型", "控制文字密度", "补充演讲者备注", "执行结构自检"],
    self_checklist: [
      "页数是否符合要求",
      "每页标题是否明确",
      "文字密度是否适合演示页",
      "表格是否适合演示页",
      "备注是否完整",
      "是否存在外部资源或网页效果依赖",
      "布局是否有节奏变化",
    ],
    ppt_generation: {
      style: "custom",
      styleDescription,
      supported_layouts: [
        "cover",
        "section",
        "content",
        "bullets",
        "timeline",
        "comparison",
        "quote",
        "data",
        "roadmap",
        "orgchart",
        "imageText",
        "appendix",
        "closing",
      ],
    },
  };

  return {
    id: null,
    name,
    handle,
    category: "PPT",
    description: "PPT 生成专用执笔人",
    enabled: true,
    summary,
    skillJson: JSON.stringify(skillJson, null, 2),
    examples: [],
    versions: [],
    feedbacks: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
