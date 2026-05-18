import { parseLooseJson } from "../../utils/formatters.js";
import {
  buildPptStyleGuide as buildRegisteredPptStyleGuide,
  getPreviewTheme,
  normalizePptStyleId,
} from "./pptStyles.js";

export { PPT_STYLE_OPTIONS } from "./pptStyles.js";

export function buildGuizangPptPrompt({ title, style, styleDescription, slideCount, autoSlideCount, content, skillPrompt }) {
  const styleGuide = buildRegisteredPptStyleGuide(style, styleDescription);
  const slideCountInstruction = autoSlideCount
    ? "页数模式：自动。请根据用户材料的信息量、结构层级和演示节奏自行决定页数，通常控制在 6-24 页；内容少就少页，内容复杂就拆成更多页，但最多不要超过 40 页。"
    : `建议页数：${slideCount || 12}`;
  return [
    "你是内置的“归藏 PPT 执笔人”。请根据用户材料生成一份可编辑的原生 PowerPoint 演示稿结构数据。",
    "你的交付物不是 HTML，也不是 Markdown，而是严格 JSON。程序会把这个 JSON 转换成 .pptx。",
    "只输出 JSON，不要输出代码围栏、解释文字或额外说明。",
    "每一页只表达一个核心观点，文字要适合演示页阅读；复杂内容拆成多页；事实不明确时使用可替换占位，不要编造。",
    "不要使用 emoji；不要引用本机路径；不要把网页交互、CSS、脚本写进结果。",
    "可用页面类型：cover、section、content、bullets、timeline、comparison、quote、data、roadmap、orgchart、imageText、appendix、closing。",
    "请根据内容选择合适页面类型：数据页用于指标/数字，路线图用于阶段安排，组织图用于职责层级，图文页用于图片占位+说明，附录页用于补充材料。",
    styleGuide,
    skillPrompt ? `额外执笔人规则：\n${skillPrompt}` : "",
    "JSON 结构：",
    JSON.stringify(buildSchemaExample(), null, 2),
    `PPT 标题：${title || "未命名演示稿"}`,
    slideCountInstruction,
    `用户材料：\n${content}`,
  ].join("\n\n");
}

export function parseGuizangPptSpec(value, fallback = {}) {
  const result = parseLooseJson(value);
  if (!result.ok || !result.value || typeof result.value !== "object") {
    throw new Error("AI 未返回可识别的 PPT 结构 JSON，请重试或调整提示词");
  }
  return normalizePptSpec(result.value, fallback);
}

export function normalizePptSpec(spec, fallback = {}) {
  const source = Array.isArray(spec) ? { slides: spec } : spec || {};
  const rawSlides = coerceSlides(source.slides || source.pages || source.deck || []);
  const autoSlideCount =
    isAutoSlideCount(fallback.autoSlideCount) ||
    isAutoSlideCount(source.autoSlideCount) ||
    isAutoSlideCount(source.slideCount) ||
    isAutoSlideCount(source.slide_count);
  const sourceRequestedCount = Number.parseInt(source.requestedSlideCount || source.slideCount || source.slide_count, 10);
  const requestedCount = autoSlideCount
    ? (Number.isFinite(sourceRequestedCount) ? sourceRequestedCount : rawSlides.length || estimateSlideCountFromContent(fallback.content))
    : Number.parseInt(fallback.slideCount || source.slideCount || source.slide_count || 12, 10);
  const targetCount = Number.isFinite(requestedCount) ? Math.min(Math.max(requestedCount, 1), 40) : 12;
  const slides = rawSlides.slice(0, autoSlideCount ? 40 : targetCount);
  const title = asText(source.title || fallback.title || "未命名演示稿");
  const style = normalizePptStyleId(source.style || fallback.style);
  return {
    title,
    subtitle: asText(source.subtitle || source.summary || ""),
    style,
    styleDescription: asText(source.styleDescription || source.style_description || fallback.styleDescription || ""),
    requestedSlideCount: targetCount,
    autoSlideCount,
    audience: asText(source.audience || ""),
    slides: slides.length ? slides : buildFallbackSlides(title, fallback.content, targetCount),
  };
}

export function inspectPptSpec(spec, options = {}) {
  const normalized = normalizePptSpec(spec, options);
  const autoSlideCount = isAutoSlideCount(options.autoSlideCount) || normalized.autoSlideCount;
  const requestedCount = autoSlideCount ? null : Number.parseInt(options.slideCount || normalized.requestedSlideCount || normalized.slides.length, 10);
  const checks = [];

  const addCheck = (id, label, status, message, severity = status === "fail" ? "error" : "warn") => {
    checks.push({ id, label, status, message, severity });
  };

  if (autoSlideCount) {
    addCheck("slide-count", "页数", "pass", `已启用自动页数，当前 ${normalized.slides.length} 页。`, "info");
  } else if (Number.isFinite(requestedCount) && normalized.slides.length !== requestedCount) {
    addCheck(
      "slide-count",
      "页数",
      "warn",
      `期望 ${requestedCount} 页，当前 ${normalized.slides.length} 页。`,
    );
  } else {
    addCheck("slide-count", "页数", "pass", `当前 ${normalized.slides.length} 页，符合页数要求。`, "info");
  }

  const missingTitleIndexes = normalized.slides
    .map((slide, index) => (!slide.title || /^第\s*\d+\s*页$/.test(slide.title) ? index + 1 : null))
    .filter(Boolean);
  if (missingTitleIndexes.length) {
    addCheck("missing-title", "标题完整性", "fail", `第 ${missingTitleIndexes.join("、")} 页缺少明确标题。`);
  } else {
    addCheck("missing-title", "标题完整性", "pass", "每页都有标题。", "info");
  }

  const largeTables = normalized.slides
    .map((slide, index) => {
      const rows = slide.table?.rows || [];
      if (!rows.length) return null;
      const cols = Math.max(...rows.map((row) => row.length));
      return rows.length > 7 || cols > 5 ? `${index + 1}页(${rows.length}行/${cols}列)` : null;
    })
    .filter(Boolean);
  if (largeTables.length) {
    addCheck("table-size", "表格尺寸", "warn", `表格过大，导出时会压缩或截断：${largeTables.join("、")}。`);
  } else {
    addCheck("table-size", "表格尺寸", "pass", "表格尺寸适合演示页。", "info");
  }

  const emptyNotes = normalized.slides.filter((slide) => !slide.notes).length;
  if (emptyNotes) {
    addCheck("speaker-notes", "备注", "warn", `${emptyNotes} 页没有演讲者备注，可按需要补充。`);
  } else {
    addCheck("speaker-notes", "备注", "pass", "每页都有演讲者备注。", "info");
  }

  const layoutSet = new Set(normalized.slides.map((slide) => slide.type));
  if (layoutSet.size <= 2 && normalized.slides.length >= 6) {
    addCheck("layout-variety", "布局丰富度", "warn", "页面类型较少，建议加入数据页、路线图、图文页或附录页增强节奏。");
  } else {
    addCheck("layout-variety", "布局丰富度", "pass", `已使用 ${layoutSet.size} 种页面类型。`, "info");
  }

  return {
    ok: checks.every((check) => check.status !== "fail"),
    checks,
    errors: checks.filter((check) => check.severity === "error" && check.status !== "pass"),
    warnings: checks.filter((check) => check.severity === "warn" && check.status !== "pass"),
  };
}

export function formatPptQualityReport(report) {
  if (!report?.checks?.length) return "尚未生成结构自检。";
  return report.checks
    .map((check) => {
      const mark = check.status === "pass" ? "通过" : check.status === "fail" ? "需处理" : "提示";
      return `${mark}｜${check.label}：${check.message}`;
    })
    .join("\n");
}

export function renderPptSpecPreview(spec) {
  const normalized = normalizePptSpec(spec);
  const theme = getPreviewTheme(normalized.style);
  const slides = normalized.slides
    .map((slide, index) => {
      const bullets = slide.bullets.length
        ? `<ul>${slide.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
        : "";
      const table = slide.table
        ? `<table>${slide.table.rows
            .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
            .join("")}</table>`
        : "";
      return `<article class="slide ${escapeHtml(slide.type)}">
        <div class="kicker">${String(index + 1).padStart(2, "0")} / ${escapeHtml(slide.type)}</div>
        <h2>${escapeHtml(slide.title || normalized.title)}</h2>
        ${slide.kicker ? `<p class="eyebrow">${escapeHtml(slide.kicker)}</p>` : ""}
        ${slide.body ? `<p>${escapeHtml(slide.body)}</p>` : ""}
        ${bullets}
        ${table}
      </article>`;
    })
    .join("");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <style>
    body { margin: 0; background: ${theme.shell}; color: ${theme.ink}; font-family: ${theme.font}; }
    main { display: grid; gap: 18px; padding: 20px; }
    .slide { aspect-ratio: 16 / 9; border: 1px solid ${theme.line}; background: ${theme.bg}; padding: 34px; box-sizing: border-box; display: grid; align-content: start; gap: 12px; }
    .kicker { color: ${theme.accent}; font-size: 12px; letter-spacing: .12em; text-transform: uppercase; }
    .eyebrow { color: ${theme.muted}; margin: 0; }
    h2 { margin: 0; font-size: 34px; line-height: 1.1; }
    p { margin: 0; font-size: 17px; line-height: 1.55; max-width: 76%; }
    ul { margin: 0; padding-left: 22px; display: grid; gap: 8px; font-size: 16px; line-height: 1.45; }
    table { border-collapse: collapse; font-size: 13px; }
    td { border: 1px solid ${theme.line}; padding: 6px 8px; }
  </style>
</head>
<body><main>${slides}</main></body>
</html>`;
}

function coerceSlides(slides) {
  if (!Array.isArray(slides)) return [];
  return slides.map((slide, index) => normalizeSlide(slide, index)).filter((slide) => slide.title || slide.body || slide.bullets.length);
}

function normalizeSlide(slide, index) {
  const source = typeof slide === "string" ? { title: slide } : slide || {};
  return {
    type: normalizeSlideType(source.type || source.layout || (index === 0 ? "cover" : "content")),
    title: asText(source.title || source.heading || `第 ${index + 1} 页`),
    subtitle: asText(source.subtitle || ""),
    kicker: asText(source.kicker || source.eyebrow || ""),
    body: asText(source.body || source.content || source.summary || ""),
    bullets: coerceTextArray(source.bullets || source.points || source.key_points),
    notes: asText(source.notes || source.speaker_notes || ""),
    table: normalizeTable(source.table),
  };
}

function normalizeSlideType(type) {
  const value = String(type || "").toLowerCase();
  const aliases = {
    datareport: "data",
    metric: "data",
    metrics: "data",
    roadmap: "roadmap",
    road_map: "roadmap",
    organization: "orgchart",
    org: "orgchart",
    org_chart: "orgchart",
    image_text: "imageText",
    imagetext: "imageText",
    appendix: "appendix",
    annex: "appendix",
  };
  if (aliases[value]) return aliases[value];
  if (["cover", "section", "content", "bullets", "timeline", "comparison", "quote", "data", "roadmap", "orgchart", "imageText", "appendix", "closing"].includes(value)) return value;
  return "content";
}

function normalizeTable(table) {
  if (!table) return null;
  if (Array.isArray(table)) {
    const rows = table.map((row) => coerceTextArray(row)).filter((row) => row.length);
    return rows.length ? { rows } : null;
  }
  const headers = coerceTextArray(table.headers || table.head || []);
  const rows = (Array.isArray(table.rows) ? table.rows : []).map((row) => coerceTextArray(row)).filter((row) => row.length);
  const merged = headers.length ? [headers, ...rows] : rows;
  return merged.length ? { rows: merged } : null;
}

function coerceTextArray(value) {
  if (!Array.isArray(value)) {
    if (value && typeof value === "object") return Object.values(value).map((item) => asText(item)).filter(Boolean).slice(0, 10);
    return value ? [asText(value)] : [];
  }
  return value.map((item) => asText(item)).filter(Boolean).slice(0, 10);
}

function asText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

function isAutoSlideCount(value) {
  return value === true || String(value || "").trim().toLowerCase() === "auto";
}

function estimateSlideCountFromContent(content) {
  const text = asText(content);
  if (!text) return 8;
  const compactLength = text.replace(/\s+/g, "").length;
  const paragraphCount = text.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean).length;
  const countByLength = Math.ceil(compactLength / 260) + 2;
  const countByParagraph = Math.ceil(paragraphCount / 2) + 2;
  return Math.min(Math.max(countByLength, countByParagraph, 6), 24);
}

function buildFallbackSlides(title, content, maxSlides = 6) {
  const text = asText(content);
  const limit = Math.min(Math.max(maxSlides - 1, 1), 12);
  const chunks = text ? text.split(/\n{2,}/).filter(Boolean).slice(0, limit) : [];
  return [
    normalizeSlide({ type: "cover", title, subtitle: "由摹文拟笔工作台生成" }, 0),
    ...chunks.map((chunk, index) =>
      normalizeSlide(
        {
          type: "content",
          title: `要点 ${index + 1}`,
          body: chunk.slice(0, 180),
        },
        index + 1,
      ),
    ),
  ];
}

function buildSchemaExample() {
  return {
    title: "演示稿标题",
    subtitle: "一句话说明演示目标",
    style: "magazine | magazineForest | swiss | swissLemon | officialBlue | educationGreen | custom",
    styleDescription: "当 style 为 custom 时填写自定义视觉风格描述",
    audience: "面向对象",
    slides: [
      {
        type: "cover | section | content | bullets | timeline | comparison | quote | data | roadmap | orgchart | imageText | appendix | closing",
        title: "页面标题",
        subtitle: "可选副标题",
        kicker: "可选栏目提示",
        body: "一段不超过 80 字的正文",
        bullets: ["要点一", "要点二", "要点三"],
        table: {
          headers: ["项目", "说明"],
          rows: [["示例", "示例内容"]],
        },
        notes: "演讲者备注，可为空",
      },
    ],
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
