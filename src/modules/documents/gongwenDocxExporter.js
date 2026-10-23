import JSZip from "jszip";
import { DOCX_MIME, cleanMarkdownHeading, stripDuplicateLeadingTitle } from "./docxExporter.js";

// GB/T 9704-2012 党政机关公文格式：A4，天头 37mm、订口 28mm，版心 156mm × 225mm，
// 每页 22 行、每行 28 字；正文 3 号仿宋，标题 2 号小标宋，页码 4 号宋体。
const MM = 1440 / 25.4;
const PAGE = { width: 11906, height: 16838 };
const MARGIN = {
  top: Math.round(37 * MM),
  bottom: Math.round(35 * MM),
  left: Math.round(28 * MM),
  right: Math.round(26 * MM),
  footer: Math.round(23 * MM),
};
const LINE_PITCH = 579; // 225mm / 22 行，单位 twip
const CHAR_SPACE = -849; // 156mm / 28 字相对 16pt 默认字宽的差值，单位 1/4096 pt
const BODY_SIZE = 32; // 3 号 = 16pt，单位半磅
const TITLE_SIZE = 44; // 2 号 = 22pt
const PAGE_NUMBER_SIZE = 28; // 4 号 = 14pt
const CHAR_TWIPS = 320;

export const GONGWEN_FONTS = {
  title: "方正小标宋简体",
  body: "仿宋_GB2312",
  h1: "黑体",
  h2: "楷体_GB2312",
  pageNumber: "宋体",
  latin: "Times New Roman",
};

// 缺少国标字体时，Word 会按 altName 回退到系统自带字体。
const FONT_FALLBACKS = [
  [GONGWEN_FONTS.title, "宋体"],
  [GONGWEN_FONTS.body, "仿宋"],
  [GONGWEN_FONTS.h2, "楷体"],
  [GONGWEN_FONTS.h1, "SimHei"],
  [GONGWEN_FONTS.pageNumber, "SimSun"],
];

const CN_NUMBER = "〇零一二三四五六七八九十百";
const H1_PATTERN = new RegExp(`^[${CN_NUMBER}]+、`);
const H2_PATTERN = new RegExp(`^[（(][${CN_NUMBER}]+[）)]`);
const H3_PATTERN = /^\d{1,2}[.．](?!\d)/;
const H4_PATTERN = /^[（(]\d{1,2}[）)]/;
const DATE_PATTERN = new RegExp(`^[${CN_NUMBER}\\d]{4}\\s*年\\s*[${CN_NUMBER}\\d]{1,2}\\s*月\\s*[${CN_NUMBER}\\d]{1,3}\\s*日$`);
const ATTACHMENT_PATTERN = /^附\s*件\s*[：:]/;
const SENTENCE_END = /[。；;，,：:！!？?]$/;
const MAX_HEADING_PHRASE = 30;

export async function createGongwenDocxBlob(doc) {
  const buffer = await createGongwenDocxArrayBuffer(doc);
  return new Blob([buffer], { type: DOCX_MIME });
}

export async function createGongwenDocxArrayBuffer(doc) {
  const title = cleanMarkdownHeading(doc?.title || "未命名文档");
  const content = stripDuplicateLeadingTitle(title, doc?.content || "");
  const blocks = classifyGongwenBlocks(content);
  const zip = new JSZip();
  zip.file("[Content_Types].xml", buildContentTypesXml());
  zip.folder("_rels").file(".rels", buildRootRelsXml());
  const word = zip.folder("word");
  word.file("document.xml", buildDocumentXml(title, blocks));
  word.file("styles.xml", buildStylesXml());
  word.file("settings.xml", buildSettingsXml());
  word.file("fontTable.xml", buildFontTableXml());
  word.file("footer1.xml", buildFooterXml("right"));
  word.file("footer2.xml", buildFooterXml("left"));
  word.folder("_rels").file("document.xml.rels", buildDocumentRelsXml());
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

/**
 * 把纯文本正文拆成公文版式块：主送机关、各级标题、正文、附件说明、署名和日期。
 * 正文中的空行只用于分段，不会原样保留（公文段落之间不空行）。
 */
export function classifyGongwenBlocks(content) {
  const lines = String(content || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => normalizeLine(line))
    .filter(Boolean);
  if (lines.length === 0) return [];

  const blocks = lines.map((text) => ({ kind: classifyLine(text), text }));
  markClosing(blocks);
  markAddressee(blocks);
  return blocks;
}

function normalizeLine(line) {
  return String(line || "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^\s*[-*]\s+/, "")
    .trim();
}

function classifyLine(text) {
  if (ATTACHMENT_PATTERN.test(text)) return "attachment";
  if (H1_PATTERN.test(text)) return "h1";
  if (H2_PATTERN.test(text)) return "h2";
  if (H4_PATTERN.test(text)) return "h4";
  if (H3_PATTERN.test(text)) return "h3";
  return "body";
}

function markClosing(blocks) {
  const last = blocks.at(-1);
  if (!last || !DATE_PATTERN.test(last.text.replace(/\s+/g, ""))) return;
  last.kind = "date";
  const previous = blocks.at(-2);
  if (
    previous &&
    previous.kind === "body" &&
    blocks.length > 2 &&
    previous.text.length <= 25 &&
    !SENTENCE_END.test(previous.text)
  ) {
    previous.kind = "signature";
  }
}

function markAddressee(blocks) {
  const first = blocks[0];
  if (!first || first.kind !== "body" || blocks.length < 2) return;
  if (/[：:]$/.test(first.text) && first.text.length <= 40 && !/[。；]/.test(first.text)) {
    first.kind = "addressee";
  }
}

/** 序号标题：短标题整行用标题字体；“一、标题。正文……”只把标题短语设为标题字体。 */
export function splitHeadingRuns(text) {
  const value = String(text || "");
  const sentenceEnd = value.search(/[。！？]/);
  if (sentenceEnd < 0) {
    return value.length <= MAX_HEADING_PHRASE ? { heading: value, rest: "" } : { heading: "", rest: value };
  }
  const heading = value.slice(0, sentenceEnd + 1);
  const rest = value.slice(sentenceEnd + 1);
  if (heading.length > MAX_HEADING_PHRASE) return { heading: "", rest: value };
  return { heading, rest };
}

export function measureTextWidth(text) {
  return [...String(text || "")].reduce((width, char) => width + (/[\u0000-ÿ]/.test(char) ? 0.5 : 1), 0);
}

function buildDocumentXml(title, blocks) {
  const paragraphs = [
    ...splitTitle(title).map((line) => paragraph(runs(line, { font: GONGWEN_FONTS.title, size: TITLE_SIZE }), { align: "center" })),
    emptyParagraph(),
  ];

  // 落款不能单独成页（避免“此页无正文”）：正文最后一段、附件说明、空行和署名都与下段同页。
  const keepWithNext = findKeepWithNextIndexes(blocks);
  let closingStarted = false;
  blocks.forEach((block, index) => {
    const previous = blocks[index - 1];
    // 附件说明和落款前各空一行
    if (block.kind === "attachment" && previous && previous.kind !== "attachment") {
      paragraphs.push(emptyParagraph({ keepNext: keepWithNext.has(index) }));
    }
    if ((block.kind === "signature" || block.kind === "date") && !closingStarted) {
      closingStarted = true;
      paragraphs.push(emptyParagraph({ keepNext: true }));
    }
    const keepNext = keepWithNext.has(index) || block.kind === "signature";
    paragraphs.push(buildBlockParagraph(block, blocks, { keepNext }));
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${paragraphs.join("\n    ")}
    <w:sectPr>
      <w:footerReference w:type="default" r:id="rIdFooterOdd"/>
      <w:footerReference w:type="even" r:id="rIdFooterEven"/>
      <w:pgSz w:w="${PAGE.width}" w:h="${PAGE.height}"/>
      <w:pgMar w:top="${MARGIN.top}" w:right="${MARGIN.right}" w:bottom="${MARGIN.bottom}" w:left="${MARGIN.left}" w:header="851" w:footer="${MARGIN.footer}" w:gutter="0"/>
      <w:pgNumType w:start="1"/>
      <w:docGrid w:type="linesAndChars" w:linePitch="${LINE_PITCH}" w:charSpace="${CHAR_SPACE}"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function findKeepWithNextIndexes(blocks) {
  const indexes = new Set();
  const closingIndex = blocks.findIndex((block) => block.kind === "signature" || block.kind === "date");
  if (closingIndex <= 0) return indexes;
  let index = closingIndex - 1;
  while (index >= 0 && blocks[index].kind === "attachment") indexes.add(index--);
  if (index >= 0) indexes.add(index);
  return indexes;
}

// 标题过长时按 GB 要求回行：尽量在 22 字左右的标点或“的”“关于”后断开。
function splitTitle(title) {
  const value = String(title || "").trim();
  if (measureTextWidth(value) <= 22) return [value];
  const lines = [];
  let rest = value;
  while (measureTextWidth(rest) > 22) {
    const window = rest.slice(0, 22);
    const breakAt = Math.max(window.lastIndexOf("的") + 1, window.lastIndexOf("，") + 1, window.lastIndexOf("、") + 1);
    const cut = breakAt >= 8 ? breakAt : 22;
    lines.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) lines.push(rest);
  return lines;
}

function buildBlockParagraph(block, blocks, { keepNext = false } = {}) {
  const indent = { firstLineChars: 200 };
  switch (block.kind) {
    case "addressee":
      return paragraph(runs(block.text), { align: "both", keepNext });
    case "h1":
    case "h2": {
      const { heading, rest } = splitHeadingRuns(block.text);
      const font = block.kind === "h1" ? GONGWEN_FONTS.h1 : GONGWEN_FONTS.h2;
      return paragraph(`${runs(heading, { font })}${runs(rest)}`, { align: "both", indent, keepNext });
    }
    case "attachment":
      return paragraph(runs(block.text), { align: "both", indent: { leftChars: 200 }, keepNext });
    case "date":
      return paragraph(runs(block.text), { align: "right", indent: { rightChars: 400 } });
    case "signature": {
      const date = blocks.find((item) => item.kind === "date");
      const offset = date ? (measureTextWidth(date.text) - measureTextWidth(block.text)) / 2 : 0;
      const rightChars = Math.max(0, Math.round((4 + offset) * 100));
      return paragraph(runs(block.text), { align: "right", indent: { rightChars }, keepNext });
    }
    default:
      return paragraph(runs(block.text), { align: "both", indent, keepNext });
  }
}

function paragraph(content, { align = "both", indent = null, keepNext = false } = {}) {
  const ind = indent ? `<w:ind${indentAttributes(indent)}/>` : "";
  return `<w:p><w:pPr>${keepNext ? "<w:keepNext/>" : ""}<w:spacing w:before="0" w:after="0" w:line="${LINE_PITCH}" w:lineRule="exact"/>${ind}<w:jc w:val="${align}"/></w:pPr>${content}</w:p>`;
}

function emptyParagraph(options = {}) {
  return paragraph("", options);
}

function indentAttributes(indent) {
  const attributes = [];
  if (indent.firstLineChars) {
    attributes.push(`w:firstLineChars="${indent.firstLineChars}"`, `w:firstLine="${(indent.firstLineChars / 100) * CHAR_TWIPS}"`);
  }
  if (indent.leftChars) {
    attributes.push(`w:leftChars="${indent.leftChars}"`, `w:left="${(indent.leftChars / 100) * CHAR_TWIPS}"`);
  }
  if (indent.rightChars !== undefined) {
    attributes.push(`w:rightChars="${indent.rightChars}"`, `w:right="${Math.round((indent.rightChars / 100) * CHAR_TWIPS)}"`);
  }
  return attributes.length ? ` ${attributes.join(" ")}` : "";
}

function runs(text, { font = GONGWEN_FONTS.body, size = BODY_SIZE, bold = false } = {}) {
  const value = String(text || "");
  if (!value) return "";
  return `<w:r><w:rPr><w:rFonts w:ascii="${GONGWEN_FONTS.latin}" w:hAnsi="${GONGWEN_FONTS.latin}" w:eastAsia="${font}" w:cs="${GONGWEN_FONTS.latin}"/>${bold ? "<w:b/>" : ""}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r>`;
}

function buildFooterXml(side) {
  const indent = side === "right" ? `<w:ind w:right="${CHAR_TWIPS}" w:rightChars="100"/>` : `<w:ind w:left="${CHAR_TWIPS}" w:leftChars="100"/>`;
  const run = (text) =>
    `<w:r><w:rPr><w:rFonts w:ascii="${GONGWEN_FONTS.pageNumber}" w:hAnsi="${GONGWEN_FONTS.pageNumber}" w:eastAsia="${GONGWEN_FONTS.pageNumber}"/><w:sz w:val="${PAGE_NUMBER_SIZE}"/><w:szCs w:val="${PAGE_NUMBER_SIZE}"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:pPr>${indent}<w:jc w:val="${side}"/></w:pPr>${run("— ")}<w:fldSimple w:instr=" PAGE ">${run("1")}</w:fldSimple>${run(" —")}</w:p>
</w:ftr>`;
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="${GONGWEN_FONTS.latin}" w:hAnsi="${GONGWEN_FONTS.latin}" w:eastAsia="${GONGWEN_FONTS.body}" w:cs="${GONGWEN_FONTS.latin}"/><w:kern w:val="2"/><w:sz w:val="${BODY_SIZE}"/><w:szCs w:val="${BODY_SIZE}"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:widowControl w:val="0"/><w:jc w:val="both"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
  <w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/></w:style>
</w:styles>`;
}

function buildSettingsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:evenAndOddHeaders/>
  <w:defaultTabStop w:val="420"/>
  <w:characterSpacingControl w:val="compressPunctuation"/>
  <w:compat><w:spaceForUL/><w:balanceSingleByteDoubleByteWidth/><w:doNotLeaveBackslashAlone/><w:ulTrailSpace/><w:doNotExpandShiftReturn/><w:adjustLineHeightInTable/><w:useFELayout/></w:compat>
</w:settings>`;
}

function buildFontTableXml() {
  const fonts = FONT_FALLBACKS.map(
    ([name, fallback]) => `<w:font w:name="${name}"><w:altName w:val="${fallback}"/><w:charset w:val="86"/><w:family w:val="auto"/><w:pitch w:val="variable"/></w:font>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${fonts}<w:font w:name="${GONGWEN_FONTS.latin}"><w:charset w:val="00"/><w:family w:val="roman"/><w:pitch w:val="variable"/></w:font></w:fonts>`;
}

function buildContentTypesXml() {
  const main = "application/vnd.openxmlformats-officedocument.wordprocessingml";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="${main}.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="${main}.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="${main}.settings+xml"/>
  <Override PartName="/word/fontTable.xml" ContentType="${main}.fontTable+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="${main}.footer+xml"/>
  <Override PartName="/word/footer2.xml" ContentType="${main}.footer+xml"/>
</Types>`;
}

function buildRootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
}

function buildDocumentRelsXml() {
  const base = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="${base}/styles" Target="styles.xml"/>
  <Relationship Id="rIdSettings" Type="${base}/settings" Target="settings.xml"/>
  <Relationship Id="rIdFontTable" Type="${base}/fontTable" Target="fontTable.xml"/>
  <Relationship Id="rIdFooterOdd" Type="${base}/footer" Target="footer1.xml"/>
  <Relationship Id="rIdFooterEven" Type="${base}/footer" Target="footer2.xml"/>
</Relationships>`;
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
