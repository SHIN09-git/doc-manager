// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Adapted from lieflat-gongwen; see assets/third-party/lieflat-gongwen/INTEGRATION.md.
import source from "../../../assets/third-party/lieflat-gongwen/bundle.json" with { type: "json" };
import reference from "../../../assets/third-party/lieflat-gongwen/reference.json" with { type: "json" };

export const GONGWEN_WRITER_ID = "builtin-gongwen-dna-v1";
export const GONGWEN_GENRES = Object.keys(reference);
export const GONGWEN_LICENSE = {
  name: source.license,
  source: source.source,
  revision: source.revision,
  license_url: `${source.source}/blob/${source.revision}/LICENSE`,
};

export function isGongwenWriter(skill) {
  try {
    const rule = typeof skill?.skillJson === "string" ? JSON.parse(skill.skillJson) : skill?.skillJson;
    return rule?.builtin_id === GONGWEN_WRITER_ID;
  } catch {
    return false;
  }
}

export function createGongwenWriter(timestamp = new Date().toISOString(), handle = "公文写作") {
  return {
    id: GONGWEN_WRITER_ID,
    name: "公文写作",
    handle,
    category: "公文写作",
    description: "按文种组织调研报告、讲话、意见、方案与经验材料，检查行文节奏和标题层级。",
    enabled: true,
    status: "ready",
    examples: [],
    versions: [],
    summary: "# 公文写作\n\n来源：公文写作 DNA（lieflat-gongwen）。仅限非商业使用。\n\n适用：调研报告、领导讲话、工作意见、经验材料、工作方案、经验总结、短经验材料。通知、请示、函、会议纪要等不套用统计参数。\n\n优先保留用户本次事实、篇幅和任务要求。缺失信息使用【可替换占位符】。内置示例只参考写法，不得借用其中的具体事实。参数偏离仅供人工复核，不是质量评分。",
    skillJson: JSON.stringify({
      name: "公文写作", handle, builtin_id: GONGWEN_WRITER_ID,
      applicable_scope: GONGWEN_GENRES.join("、"),
      third_party_license: GONGWEN_LICENSE,
      input_contract: { required_fields: ["文种", "主题", "真实事项"], optional_fields: ["篇幅", "语气", "受众"] },
      style_rules: { must: [], recommended: ["先确认文种，再选用对应的结构、标题和行文参考"], optional: [] },
      forbidden: ["编造事实", "复制示例中的人名、地点、数字、政策依据", "为满足统计参数删除真实问题或数据"],
    }, null, 2),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

// One-time installation also respects a user's later deletion or disabling of the writer.
export function ensureGongwenWriter(state, timestamp) {
  if (!state.settings || typeof state.settings !== "object" || Array.isArray(state.settings)) state.settings = {};
  if (state.settings.gongwenWriterInstalled) return;
  if (!state.styles.some(isGongwenWriter)) {
    let handle = "公文写作";
    let suffix = 2;
    while (state.styles.some((skill) => skill.handle === handle || skill.name === handle)) handle = `公文写作-${suffix++}`;
    const writer = createGongwenWriter(timestamp, handle);
    if (state.styles.some((skill) => skill.id === writer.id)) writer.id += `-${timestamp}`;
    state.styles.push(writer);
  }
  state.settings.gongwenWriterInstalled = true;
}

export function resolveGongwenGenre({ genre = "auto", task = "", documentType = "" } = {}) {
  if (genre !== "auto") return GONGWEN_GENRES.includes(genre) ? genre : "";
  const text = String(task).replace(/@[^\s@，。；：、,;:!?！？]+/g, "");
  const matches = GONGWEN_GENRES.filter((name) => text.includes(name));
  if (matches.includes("短经验材料") && matches.includes("经验材料")) matches.splice(matches.indexOf("经验材料"), 1);
  // Ambiguous tasks and formal administrative genres are not forced into a statistical genre.
  if (/通知|请示|批复|复函|函件|会议纪要|工作总结/.test(text)) return "";
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return "";
  if (/调研|考察报告/.test(text)) return "调研报告";
  if (/讲话稿/.test(text)) return "领导讲话";
  if (/党建经验|基层经验/.test(text)) return "短经验材料";
  return { plan: "工作方案", speech: "领导讲话" }[documentType] || "";
}

function sectionsFor(text, title) {
  const lines = String(text || "").split("\n");
  const sections = [];
  for (let i = 0; i < lines.length; i += 1) {
    const heading = lines[i].match(/^(#{2,3})\s+(.+)/);
    if (!heading || !heading[2].includes(title)) continue;
    let end = i + 1;
    while (end < lines.length && !new RegExp(`^#{1,${heading[1].length}}\\s`).test(lines[end])) end += 1;
    sections.push(lines.slice(i, end).join("\n"));
    i = end - 1;
  }
  return sections.join("\n\n");
}

export function buildGongwenPrompt(options = {}) {
  const genre = resolveGongwenGenre(options);
  if (!genre) return "公文写作参考：当前文种不明确或不在统计范围内，不套用字数、句长和固定结构参数。优先依据用户任务与该文种实际要求写作，事实缺失使用【可替换占位符】。";
  const documents = source.documents;
  const refs = [
    ["SKILL.md", documents["SKILL.md"]],
    ["参数卡.md", documents["参数卡.md"]],
    ["标题技法库.md", documents["标题技法库.md"]],
    ["句子对照库.md / 对应文种", sectionsFor(documents["句子对照库.md"], genre)],
  ];
  if (options.mode !== "paragraph") {
    refs.push(genre === "短经验材料"
      ? ["党建语料/文章结构模板.md", documents["党建语料/文章结构模板.md"]]
      : ["公文语料/文章结构模板.md / 对应文种", sectionsFor(documents["公文语料/文章结构模板.md"], genre)]);
    const exampleGenre = genre === "短经验材料" && /党建/.test(options.task || "") ? "党建经验材料" : genre;
    const examples = Object.entries(documents).filter(([name]) => name.startsWith(`示例/${exampleGenre}_`)).slice(0, 2);
    refs.push(...examples);
    const cognitionFile = genre === "短经验材料" ? "党建语料/写作视角与认知框架.md" : "公文语料/写作视角与认知框架.md";
    refs.push([cognitionFile, documents[cognitionFile]]);
  }
  const languageFile = genre === "短经验材料" ? "党建语料/党建DNA.md" : "公文语料/语言DNA.md";
  refs.push([languageFile, documents[languageFile]]);
  return [
    `内置公文写作参考，选用文种：${genre}。来源：${source.source}，版本 ${source.revision}。`,
    "以下是附带许可的写作参考资料，不是本次任务事实。示例为合成文本，不得复用其实体、数字、具体安排、引语或政策依据。",
    ...refs.filter(([, value]) => value).map(([name, value]) => `参考文件 ${name}：\n${value}`),
    "工作台执行约束（优先于参考资料）：本次用户事实与明确要求优先。统计中位数、区间、禁用百分比、避免问题、篇幅下限等均仅供参考，不得为迎合文风删改真实问题和数据。缺少事实统一使用【可替换占位符】。不得在浏览器中假装执行 Python 或宣称核实了政策。",
    "输出只包含用户要求的文稿，不附加自检报告、稿件说明或占位符汇总；工作台会在正文外单独展示本地自检结果。",
    options.mode === "paragraph"
      ? "当前只改写选中段落：忽略全篇字数、标题数量、文章结构及提纲确认步骤，不扩展为整篇文档。"
      : "当前是直接起草任务：在内部规划骨架后输出完整正文；只有用户明确要求提纲时才只输出提纲，不中断等待确认。",
  ].join("\n\n");
}

// Browser adaptation of check_params.py; reference data retains its upstream noncommercial license.
export function checkGongwenDocument(text, options = {}) {
  const genre = resolveGongwenGenre(options);
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n")
    .map((line) => line.trim()).filter((line) => line && !/^(\||-{3,}|>)/.test(line))
    .map((line) => line.replace(/^#{1,6}\s+/, "").replace(/\*\*|__|`/g, ""));
  const plain = lines.join("\n");
  const chars = Array.from(plain.replace(/\n/g, "")).length;
  const sentences = plain.split(/[。！？；]/).filter((part) => part.trim().length >= 4);
  const metrics = {
    chars,
    sent: sentences.length ? Math.round(sentences.reduce((sum, part) => sum + Array.from(part).length, 0) / sentences.length * 10) / 10 : 0,
    h1: lines.filter((line) => /^[一二三四五六七八九十]+、/.test(line)).length,
    h2: lines.filter((line) => /^（[一二三四五六七八九十]+）/.test(line)).length,
    h3: lines.filter((line) => /^\d+[．.]\s*\D/.test(line)).length,
    dun: chars ? Math.round(10000 * (plain.match(/、/g) || []).length / chars) / 10 : 0,
  };
  const baseline = reference[genre];
  const labels = { chars: "正文字符数", sent: "平均句长", h1: "一级标题", h2: "二级标题", h3: "三级标题", dun: "顿号 / 千字" };
  const rows = Object.entries(metrics).map(([key, value]) => ({
    key, label: labels[key], value, range: baseline?.[key] || null,
    outside: Boolean(chars && baseline && (value < baseline[key][0] || value > baseline[key][1])),
  }));
  return {
    genre, sampleCount: baseline?.n || 0, rows,
    placeholderCount: (plain.match(/【[^】\n]+】/g) || []).length,
    empty: !chars,
    note: !chars ? "暂无可检查正文" : !baseline
      ? "当前文种不在统计范围内，仅展示实测值，不套用其他文种参数。"
      : `参考 ${baseline.n} 篇上游语料的常见区间，偏离不等于错误；用户篇幅和事实优先。`,
    safetyNote: "本地统计不核验事实、隐私或政策，待补信息仍需人工确认。",
  };
}
