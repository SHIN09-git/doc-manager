import pptxgen from "pptxgenjs";
import { normalizePptSpec } from "./guizangPpt.js";
import { getPptxTheme } from "./pptStyles.js";

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const SLIDE_W = 13.333;
const SLIDE_H = 7.5;

export async function createPptxBlob(deckSpec, options = {}) {
  const arrayBuffer = await createPptxArrayBuffer(deckSpec, options);
  return new Blob([arrayBuffer], { type: PPTX_MIME });
}

export async function createPptxArrayBuffer(deckSpec, options = {}) {
  const normalized = normalizePptSpec(deckSpec, options);
  const theme = getPptxTheme(normalized.style);
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "摹文拟笔工作台";
  pptx.company = "摹文拟笔工作台";
  pptx.subject = normalized.subtitle || normalized.title;
  pptx.title = normalized.title;
  pptx.lang = "zh-CN";
  pptx.theme = {
    headFontFace: theme.titleFont,
    bodyFontFace: "Microsoft YaHei",
    lang: "zh-CN",
  };

  normalized.slides.forEach((slideSpec, index) => {
    const slide = pptx.addSlide();
    renderSlide(pptx, slide, slideSpec, {
      theme,
      deck: normalized,
      index,
      total: normalized.slides.length,
    });
  });

  return pptx.write({ outputType: "arraybuffer" });
}

function renderSlide(pptx, slide, slideSpec, context) {
  addBackground(pptx, slide, context.theme);
  switch (slideSpec.type) {
    case "cover":
      renderCover(pptx, slide, slideSpec, context);
      break;
    case "section":
      renderSection(pptx, slide, slideSpec, context);
      break;
    case "timeline":
      renderTimeline(pptx, slide, slideSpec, context);
      break;
    case "comparison":
      renderComparison(pptx, slide, slideSpec, context);
      break;
    case "quote":
      renderQuote(pptx, slide, slideSpec, context);
      break;
    case "data":
      renderData(pptx, slide, slideSpec, context);
      break;
    case "roadmap":
      renderRoadmap(pptx, slide, slideSpec, context);
      break;
    case "orgchart":
      renderOrgChart(pptx, slide, slideSpec, context);
      break;
    case "imageText":
      renderImageText(pptx, slide, slideSpec, context);
      break;
    case "appendix":
      renderAppendix(pptx, slide, slideSpec, context);
      break;
    case "closing":
      renderClosing(pptx, slide, slideSpec, context);
      break;
    case "bullets":
      renderBullets(pptx, slide, slideSpec, context);
      break;
    default:
      renderContent(pptx, slide, slideSpec, context);
  }
  addFooter(slide, context);
  if (slideSpec.notes) slide.addNotes(slideSpec.notes);
}

function addBackground(pptx, slide, theme) {
  slide.background = { color: theme.bg };
  if (theme.family === "magazine") {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: SLIDE_W,
      h: SLIDE_H,
      fill: { color: theme.bg },
      line: { color: theme.bg, transparency: 100 },
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.45,
      y: 0.4,
      w: 0.08,
      h: 6.65,
      fill: { color: theme.accent },
      line: { color: theme.accent, transparency: 100 },
    });
  } else {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: SLIDE_W,
      h: SLIDE_H,
      fill: { color: theme.bg },
      line: { color: theme.bg, transparency: 100 },
    });
    slide.addShape(pptx.ShapeType.line, {
      x: 0.55,
      y: 0.55,
      w: 12.2,
      h: 0,
      line: { color: theme.line, width: 0.6 },
    });
  }
}

function renderCover(pptx, slide, spec, { theme, deck }) {
  slide.addText(spec.kicker || deck.audience || "PRESENTATION", {
    ...textBox(0.92, 0.72, 4.8, 0.32),
    ...smallCaps(theme),
  });
  slide.addText(spec.title || deck.title, {
    ...textBox(0.9, 1.55, 9.6, 2.35),
    color: theme.ink,
    fontFace: theme.titleFont,
    fontSize: theme.family === "magazine" ? 36 : 40,
    bold: true,
    breakLine: false,
    fit: "shrink",
    margin: 0,
  });
  const subtitle = spec.subtitle || spec.body || deck.subtitle;
  if (subtitle) {
    slide.addText(subtitle, {
      ...textBox(0.95, 4.12, 7.3, 0.95),
      ...bodyText(theme, 15),
      color: theme.muted,
      fit: "shrink",
    });
  }
  slide.addShape(pptx.ShapeType.rect, {
    x: 9.8,
    y: 1.05,
    w: 2.55,
    h: 4.9,
    fill: { color: theme.accent },
    line: { color: theme.accent, transparency: 100 },
    transparency: theme.family === "magazine" ? 8 : 0,
  });
  slide.addText(new Date().getFullYear().toString(), {
    ...textBox(10.15, 5.25, 1.9, 0.42),
    color: theme.accentText,
    fontFace: theme.bodyFont,
    fontSize: 14,
    bold: true,
    margin: 0,
    align: "right",
  });
}

function renderSection(pptx, slide, spec, context) {
  const { theme, index } = context;
  slide.addText(String(index + 1).padStart(2, "0"), {
    ...textBox(0.92, 0.9, 2.4, 1),
    color: theme.accent,
    fontFace: theme.titleFont,
    fontSize: 44,
    bold: true,
    margin: 0,
  });
  slide.addText(spec.title, {
    ...textBox(0.92, 2.2, 9.6, 1.6),
    ...titleText(theme, 34),
    fit: "shrink",
  });
  addBodyOrBullets(slide, spec, theme, 1.02, 4.08, 8.5, 1.25);
}

function renderContent(pptx, slide, spec, context) {
  const { theme } = context;
  addSlideTitle(slide, spec, theme);
  addBodyOrBullets(slide, spec, theme, 0.92, 1.82, 7.2, 2.95);
  renderTableIfNeeded(slide, spec, theme, 8.45, 1.78, 3.9, 3.45);
  slide.addShape(pptx.ShapeType.rect, {
    x: 9.55,
    y: 5.68,
    w: 2.3,
    h: 0.15,
    fill: { color: theme.accent },
    line: { color: theme.accent, transparency: 100 },
  });
}

function renderBullets(pptx, slide, spec, { theme }) {
  addSlideTitle(slide, spec, theme);
  const bullets = spec.bullets.length ? spec.bullets : splitBody(spec.body);
  slide.addText(bullets.join("\n"), {
    ...textBox(1.05, 1.88, 10.6, 3.9),
    ...bodyText(theme, 19),
    breakLine: false,
    bullet: { type: "ul" },
    paraSpaceAfterPt: 12,
    fit: "shrink",
  });
}

function renderTimeline(pptx, slide, spec, { theme }) {
  addSlideTitle(slide, spec, theme);
  const items = (spec.bullets.length ? spec.bullets : splitBody(spec.body)).slice(0, 6);
  const step = 10.4 / Math.max(items.length, 1);
  slide.addShape(pptx.ShapeType.line, {
    x: 1.22,
    y: 3.56,
    w: 10.4,
    h: 0,
    line: { color: theme.line, width: 1.2 },
  });
  items.forEach((item, index) => {
    const x = 1.15 + step * index;
    slide.addShape(pptx.ShapeType.ellipse, {
      x,
      y: 3.33,
      w: 0.46,
      h: 0.46,
      fill: { color: theme.accent },
      line: { color: theme.accent },
    });
    slide.addText(String(index + 1).padStart(2, "0"), {
      ...textBox(x - 0.15, 2.68, 0.78, 0.32),
      ...smallCaps(theme),
      align: "center",
    });
    slide.addText(item, {
      ...textBox(x - 0.35, 4.02, Math.min(step + 0.28, 2.05), 1.15),
      ...bodyText(theme, 12),
      fit: "shrink",
      margin: 0,
    });
  });
}

function renderComparison(pptx, slide, spec, { theme }) {
  addSlideTitle(slide, spec, theme);
  const items = spec.bullets.length ? spec.bullets : splitBody(spec.body);
  const left = items.filter((_, index) => index % 2 === 0).slice(0, 5);
  const right = items.filter((_, index) => index % 2 === 1).slice(0, 5);
  addColumn(slide, "A", left, theme, 1.0, 1.85);
  addColumn(slide, "B", right.length ? right : left, theme, 6.9, 1.85);
  renderTableIfNeeded(slide, spec, theme, 1.0, 5.3, 11.1, 1.0);
}

function renderQuote(pptx, slide, spec, { theme }) {
  slide.addText(spec.kicker || "QUOTE", {
    ...textBox(0.95, 0.9, 3.5, 0.3),
    ...smallCaps(theme),
  });
  slide.addText(`“${spec.body || spec.title}”`, {
    ...textBox(1.35, 1.75, 9.3, 2.45),
    ...titleText(theme, 30),
    fit: "shrink",
  });
  if (spec.title && spec.body) {
    slide.addText(spec.title, {
      ...textBox(1.42, 4.55, 5.5, 0.5),
      ...bodyText(theme, 14),
      color: theme.muted,
    });
  }
}

function renderData(pptx, slide, spec, { theme }) {
  addSlideTitle(slide, spec, theme);
  const items = getSlideItems(spec).slice(0, 4);
  const cardW = 2.75;
  items.forEach((item, index) => {
    const x = 0.95 + index * 3.05;
    const [label, value] = splitMetric(item, index);
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y: 2.0,
      w: cardW,
      h: 2.35,
      fill: { color: theme.cardFill },
      line: { color: theme.line, width: 0.6 },
    });
    slide.addText(value, {
      ...textBox(x + 0.18, 2.35, cardW - 0.36, 0.78),
      color: theme.accent,
      fontFace: theme.titleFont,
      fontSize: 28,
      bold: true,
      margin: 0,
      fit: "shrink",
    });
    slide.addText(label, {
      ...textBox(x + 0.2, 3.35, cardW - 0.4, 0.72),
      ...bodyText(theme, 12),
      color: theme.muted,
      fit: "shrink",
    });
  });
  renderTableIfNeeded(slide, spec, theme, 1.0, 4.95, 11.2, 1.1);
}

function renderRoadmap(pptx, slide, spec, { theme }) {
  addSlideTitle(slide, spec, theme);
  const items = getSlideItems(spec).slice(0, 5);
  items.forEach((item, index) => {
    const x = 1.0 + index * 2.25;
    const y = index % 2 === 0 ? 2.15 : 3.55;
    slide.addShape(pptx.ShapeType.line, {
      x: x + 0.7,
      y: 3.25,
      w: index === items.length - 1 ? 0 : 1.58,
      h: 0,
      line: { color: theme.line, width: 1 },
    });
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y,
      w: 1.65,
      h: 1.05,
      fill: { color: index === 0 ? theme.accent : theme.cardFill },
      line: { color: index === 0 ? theme.accent : theme.line, width: 0.7 },
    });
    slide.addText(`阶段 ${index + 1}`, {
      ...textBox(x + 0.12, y + 0.12, 1.35, 0.22),
      color: index === 0 ? theme.accentText : theme.accent,
      fontFace: theme.bodyFont,
      fontSize: 8,
      bold: true,
      margin: 0,
    });
    slide.addText(item, {
      ...textBox(x + 0.12, y + 0.42, 1.38, 0.45),
      ...bodyText(theme, 10),
      color: index === 0 ? theme.accentText : theme.ink,
      fit: "shrink",
    });
  });
}

function renderOrgChart(pptx, slide, spec, { theme }) {
  addSlideTitle(slide, spec, theme);
  const items = getSlideItems(spec).slice(0, 6);
  const root = items[0] || spec.title;
  slide.addShape(pptx.ShapeType.rect, {
    x: 4.65,
    y: 1.82,
    w: 4.0,
    h: 0.82,
    fill: { color: theme.accent },
    line: { color: theme.accent, width: 0.8 },
  });
  slide.addText(root, {
    ...textBox(4.85, 2.05, 3.6, 0.34),
    ...bodyText(theme, 14),
    color: theme.accentText,
    bold: true,
    align: "center",
    fit: "shrink",
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 6.65,
    y: 2.64,
    w: 0,
    h: 0.52,
    line: { color: theme.line, width: 0.7 },
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 2.22,
    y: 3.16,
    w: 8.95,
    h: 0,
    line: { color: theme.line, width: 0.7 },
  });
  const children = (items.length > 1 ? items.slice(1) : splitBody(spec.body)).slice(0, 4);
  children.forEach((item, index) => {
    const x = 1.05 + index * 3.0;
    slide.addShape(pptx.ShapeType.line, {
      x: x + 1.18,
      y: 3.16,
      w: 0,
      h: 0.44,
      line: { color: theme.line, width: 0.7 },
    });
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y: 3.6,
      w: 2.35,
      h: 1.15,
      fill: { color: theme.cardFill },
      line: { color: theme.line, width: 0.7 },
    });
    slide.addText(item, {
      ...textBox(x + 0.15, 3.92, 2.05, 0.52),
      ...bodyText(theme, 12),
      align: "center",
      fit: "shrink",
    });
  });
}

function renderImageText(pptx, slide, spec, { theme }) {
  addSlideTitle(slide, spec, theme);
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.95,
    y: 1.9,
    w: 5.2,
    h: 3.9,
    fill: { color: theme.cardFill },
    line: { color: theme.line, width: 0.8, dash: "dash" },
  });
  slide.addText(spec.kicker || "图片占位", {
    ...textBox(2.15, 3.55, 2.8, 0.4),
    ...smallCaps(theme),
    align: "center",
  });
  addBodyOrBullets(slide, spec, theme, 6.75, 2.05, 5.25, 3.1);
}

function renderAppendix(pptx, slide, spec, { theme }) {
  slide.addText(spec.kicker || "APPENDIX", {
    ...textBox(0.95, 0.72, 4.3, 0.28),
    ...smallCaps(theme),
  });
  slide.addText(spec.title || "附录", {
    ...textBox(0.95, 1.12, 10.8, 0.62),
    ...titleText(theme, 22),
    fit: "shrink",
  });
  if (spec.table?.rows?.length) {
    renderTableIfNeeded(slide, spec, theme, 0.95, 1.98, 11.4, 4.35);
  } else {
    addBodyOrBullets(slide, spec, theme, 1.0, 2.05, 10.6, 3.8);
  }
}

function renderClosing(pptx, slide, spec, { theme, deck }) {
  slide.addText(spec.title || "谢谢", {
    ...textBox(1.2, 2.2, 9.8, 1.05),
    ...titleText(theme, 36),
    fit: "shrink",
    align: "center",
  });
  const body = spec.body || spec.subtitle || deck.subtitle;
  if (body) {
    slide.addText(body, {
      ...textBox(2.6, 3.55, 8.0, 0.85),
      ...bodyText(theme, 15),
      color: theme.muted,
      align: "center",
      fit: "shrink",
    });
  }
}

function addColumn(slide, label, items, theme, x, y) {
  slide.addText(label, {
    ...textBox(x, y, 0.6, 0.42),
    color: theme.accent,
    fontFace: theme.titleFont,
    fontSize: 18,
    bold: true,
    margin: 0,
  });
  slide.addShape("line", {
    x,
    y: y + 0.62,
    w: 4.6,
    h: 0,
    line: { color: theme.line, width: 0.75 },
  });
  slide.addText((items.length ? items : ["待补充"]).join("\n"), {
    ...textBox(x, y + 0.95, 4.7, 2.4),
    ...bodyText(theme, 15),
    bullet: { type: "ul" },
    paraSpaceAfterPt: 8,
    fit: "shrink",
  });
}

function addSlideTitle(slide, spec, theme) {
  if (spec.kicker) {
    slide.addText(spec.kicker, {
      ...textBox(0.92, 0.62, 4.6, 0.3),
      ...smallCaps(theme),
    });
  }
  slide.addText(spec.title, {
    ...textBox(0.92, 0.9, 10.4, 0.74),
    ...titleText(theme, 24),
    fit: "shrink",
  });
}

function addBodyOrBullets(slide, spec, theme, x, y, w, h) {
  if (spec.bullets.length) {
    slide.addText(spec.bullets.join("\n"), {
      ...textBox(x, y, w, h),
      ...bodyText(theme, 16),
      bullet: { type: "ul" },
      paraSpaceAfterPt: 8,
      fit: "shrink",
    });
    return;
  }
  if (spec.body) {
    slide.addText(spec.body, {
      ...textBox(x, y, w, h),
      ...bodyText(theme, 16),
      fit: "shrink",
    });
  }
}

function renderTableIfNeeded(slide, spec, theme, x, y, w, h) {
  if (!spec.table?.rows?.length) return;
  const maxCols = Math.min(Math.max(...spec.table.rows.map((row) => row.length)), 5);
  const rows = spec.table.rows.slice(0, 7).map((row) => row.slice(0, maxCols));
  slide.addTable(rows, {
    x,
    y,
    w,
    h,
    border: { type: "solid", color: theme.line, pt: 0.6 },
    fill: { color: theme.tableFill },
    color: theme.ink,
    fontFace: theme.bodyFont,
    fontSize: 9,
    margin: 0.06,
    valign: "mid",
    fit: "shrink",
    autoFit: true,
  });
}

function addFooter(slide, { theme, deck, index, total }) {
  slide.addText(deck.title, {
    ...textBox(0.92, 6.86, 5.8, 0.22),
    color: theme.muted,
    fontFace: theme.bodyFont,
    fontSize: 7,
    margin: 0,
    fit: "shrink",
  });
  slide.addText(`${index + 1} / ${total}`, {
    ...textBox(11.5, 6.86, 0.9, 0.22),
    color: theme.muted,
    fontFace: theme.bodyFont,
    fontSize: 7,
    margin: 0,
    align: "right",
  });
}

function splitBody(body) {
  return String(body || "")
    .split(/[；;\n。]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function getSlideItems(spec) {
  if (spec.bullets?.length) return spec.bullets;
  if (spec.table?.rows?.length) {
    return spec.table.rows
      .slice(0, 8)
      .map((row) => row.filter(Boolean).join("："))
      .filter(Boolean);
  }
  return splitBody(spec.body);
}

function splitMetric(item, index) {
  const text = String(item || "").trim();
  const parts = text.split(/[：:|｜]/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return [parts.slice(0, -1).join("："), parts.at(-1)];
  const match = text.match(/(.{0,12}?)([\d.]+%?|[一二三四五六七八九十百千万]+项?)$/);
  if (match) return [match[1] || `指标 ${index + 1}`, match[2]];
  return [text || `指标 ${index + 1}`, String(index + 1).padStart(2, "0")];
}

function textBox(x, y, w, h) {
  return { x, y, w, h };
}

function titleText(theme, fontSize) {
  return {
    color: theme.ink,
    fontFace: theme.titleFont,
    fontSize,
    bold: true,
    margin: 0,
    breakLine: false,
  };
}

function bodyText(theme, fontSize) {
  return {
    color: theme.ink,
    fontFace: theme.bodyFont,
    fontSize,
    breakLine: false,
    margin: 0.05,
    valign: "top",
  };
}

function smallCaps(theme) {
  return {
    color: theme.accent,
    fontFace: theme.bodyFont,
    fontSize: 9,
    bold: true,
    margin: 0,
    charSpace: 1.2,
  };
}

const magazineTheme = {
  name: "magazine",
  bg: "FBFAF6",
  ink: "1F2933",
  muted: "687076",
  line: "D8CFBD",
  accent: "A65F2B",
  accentText: "FFF7ED",
  tableFill: "FFFDF8",
  cardFill: "FFF7ED",
  titleFont: "Microsoft YaHei",
  bodyFont: "Microsoft YaHei",
};

const swissTheme = {
  name: "swiss",
  bg: "FFFFFF",
  ink: "111827",
  muted: "64748B",
  line: "CBD5E1",
  accent: "0057B8",
  accentText: "FFFFFF",
  tableFill: "F8FAFC",
  cardFill: "F8FAFC",
  titleFont: "Arial",
  bodyFont: "Microsoft YaHei",
};

const customTheme = {
  name: "custom",
  bg: "FFFEFB",
  ink: "172026",
  muted: "56616B",
  line: "C8D0D6",
  accent: "0F766E",
  accentText: "FFFFFF",
  tableFill: "F9FBFA",
  cardFill: "ECFDF5",
  titleFont: "Microsoft YaHei",
  bodyFont: "Microsoft YaHei",
};
