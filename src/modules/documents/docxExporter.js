import JSZip from "jszip";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function prepareDocumentExport(doc) {
  const title = cleanMarkdownHeading(doc?.title || "未命名文档");
  return {
    title,
    content: stripDuplicateLeadingTitle(title, doc?.content || ""),
  };
}

export async function createDocxBlob(doc) {
  const arrayBuffer = await createDocxArrayBuffer(doc);
  return new Blob([arrayBuffer], { type: DOCX_MIME });
}

export async function createDocxArrayBuffer(doc) {
  const title = cleanMarkdownHeading(doc?.title || "未命名文档");
  const content = String(doc?.content || "");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", buildContentTypesXml());
  zip.folder("_rels").file(".rels", buildRootRelsXml());
  zip.folder("word").file("document.xml", buildDocumentXml(title, content));
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export function stripDuplicateLeadingTitle(title, content) {
  const lines = String(content || "").split(/\r?\n/);
  const firstIndex = lines.findIndex((line) => line.trim());
  if (firstIndex < 0) return "";
  const firstLine = cleanMarkdownHeading(lines[firstIndex]);
  if (normalizeTitle(firstLine) !== normalizeTitle(title)) return content;
  const nextLines = lines.slice(firstIndex + 1);
  while (nextLines[0] != null && !nextLines[0].trim()) {
    nextLines.shift();
  }
  return nextLines.join("\n");
}

export function cleanMarkdownHeading(value) {
  return String(value || "")
    .trim()
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .replace(/^__(.+)__$/, "$1")
    .trim();
}

function normalizeTitle(value) {
  return cleanMarkdownHeading(value)
    .replace(/[\s　*_#《》“”"':：，。,.、-]/g, "")
    .toLowerCase();
}

function buildContentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="${DOCX_MIME}.main+xml"/>
</Types>`;
}

function buildRootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
}

function buildDocumentXml(title, content) {
  const paragraphs = [
    buildParagraphXml(title, { align: "center", bold: true, size: 32, after: 320 }),
    ...String(content || "")
      .split(/\r?\n/)
      .map((line) => buildBodyParagraphXml(line)),
  ].join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function buildBodyParagraphXml(line) {
  const raw = String(line || "");
  if (!raw.trim()) return buildParagraphXml("");
  const headingMatch = raw.match(/^(#{1,6})\s+(.+)$/);
  if (headingMatch) {
    const level = headingMatch[1].length;
    return buildParagraphXml(headingMatch[2], {
      bold: true,
      size: level <= 2 ? 28 : 24,
      before: 180,
      after: 120,
    });
  }
  return buildParagraphXml(raw, { size: 24, after: 80 });
}

function buildParagraphXml(text, options = {}) {
  const align = options.align ? `<w:jc w:val="${options.align}"/>` : "";
  const spacing = `<w:spacing w:before="${options.before || 0}" w:after="${options.after || 0}" w:line="360" w:lineRule="auto"/>`;
  return `<w:p>
    <w:pPr>${spacing}${align}</w:pPr>
    ${buildRunsXml(text, options)}
  </w:p>`;
}

function buildRunsXml(text, options = {}) {
  const value = String(text || "");
  if (!value) return "";
  const parts = value.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts
    .map((part) => {
      const inlineBold = part.startsWith("**") && part.endsWith("**");
      const runText = inlineBold ? part.slice(2, -2) : part;
      return buildRunXml(runText, { ...options, bold: options.bold || inlineBold });
    })
    .join("");
}

function buildRunXml(text, options = {}) {
  const bold = options.bold ? "<w:b/>" : "";
  const size = options.size || 24;
  return `<w:r>
    <w:rPr>
      <w:rFonts w:ascii="Microsoft YaHei" w:eastAsia="Microsoft YaHei" w:hAnsi="Microsoft YaHei"/>
      ${bold}
      <w:sz w:val="${size}"/>
      <w:szCs w:val="${size}"/>
    </w:rPr>
    <w:t xml:space="preserve">${escapeXml(text)}</w:t>
  </w:r>`;
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
