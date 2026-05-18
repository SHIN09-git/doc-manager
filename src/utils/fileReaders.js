import mammoth from "mammoth";
import JSZip from "jszip";
import { readTextFile } from "./textEncoding.js";
import {
  isLegacyPresentationFile,
  isLegacyWordFile,
  isSupportedImportFile,
  isSupportedPresentationFile,
  isSupportedTextFile,
  isSupportedWordFile,
} from "./validation.js";

export class UnsupportedImportFileError extends Error {
  constructor(fileName) {
    super(buildUnsupportedFileMessage(fileName));
    this.name = "UnsupportedImportFileError";
  }
}

export async function readImportFileText(file) {
  if (isSupportedTextFile(file?.name)) {
    return readTextFile(file);
  }
  if (isSupportedWordFile(file?.name)) {
    return readDocxFile(file);
  }
  if (isSupportedPresentationFile(file?.name)) {
    return readPptxFile(file);
  }
  throw new UnsupportedImportFileError(file?.name || "");
}

export function canImportFile(name) {
  return isSupportedImportFile(name);
}

export function buildUnsupportedFileMessage(name = "") {
  if (isLegacyWordFile(name)) {
    return "暂不支持旧版 .doc 文件，请先用 Word 或 WPS 另存为 .docx 后再导入";
  }
  if (isLegacyPresentationFile(name)) {
    return "暂不支持旧版 .ppt 文件，请先用 PowerPoint 或 WPS 另存为 .pptx 后再导入";
  }
  return "当前仅支持 .txt、.md、.text、.csv、.docx、.pptx 文件";
}

async function readDocxFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const options = createMammothOptions(arrayBuffer);
  const htmlResult = await mammoth.convertToHtml(options);
  const text = htmlToTextPreservingTables(htmlResult.value || "");
  if (text.trim()) return normalizeDocxText(text);

  const rawResult = await mammoth.extractRawText(options);
  return normalizeDocxText(rawResult.value || "");
}

function createMammothOptions(arrayBuffer) {
  const options = { arrayBuffer };
  if (typeof Buffer !== "undefined") {
    options.buffer = Buffer.from(arrayBuffer);
  }
  return options;
}

export function htmlToTextPreservingTables(html) {
  const tables = [];
  const withTableMarkers = String(html || "").replace(/<table\b[\s\S]*?<\/table>/gi, (tableHtml) => {
    const marker = `\n\n__DOCX_TABLE_${tables.length}__\n\n`;
    tables.push(tableToMarkdown(tableHtml));
    return marker;
  });
  let text = htmlBlockToText(withTableMarkers);
  tables.forEach((table, index) => {
    text = text.replace(`__DOCX_TABLE_${index}__`, table);
  });
  return normalizeDocxText(text);
}

function tableToMarkdown(tableHtml) {
  const rows = Array.from(String(tableHtml || "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi))
    .map((match) => extractTableCells(match[1]))
    .filter((row) => row.length > 0);
  if (rows.length === 0) return htmlBlockToText(tableHtml);

  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => {
    const padded = [...row];
    while (padded.length < columnCount) padded.push("");
    return padded;
  });
  const separator = Array.from({ length: columnCount }, () => "---");
  return [formatMarkdownTableRow(normalizedRows[0]), formatMarkdownTableRow(separator), ...normalizedRows.slice(1).map(formatMarkdownTableRow)].join("\n");
}

function extractTableCells(rowHtml) {
  return Array.from(String(rowHtml || "").matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)).map((match) =>
    normalizeTableCell(match[1]),
  );
}

function normalizeTableCell(cellHtml) {
  return htmlBlockToText(cellHtml)
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" / ")
    .replace(/\s+/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

function formatMarkdownTableRow(row) {
  return `| ${row.map((cell) => cell || " ").join(" | ")} |`;
}

function htmlBlockToText(html) {
  return decodeHtmlEntities(
    String(html || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "- ")
      .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n\n")
      .replace(/<\/(section|article|header|footer)>/gi, "\n\n")
      .replace(/<[^>]+>/g, ""),
  );
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number.parseInt(value, 10)));
}

function normalizeDocxText(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function readPptxFile(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort(compareNumberedPath);
  const noteFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(name))
    .sort(compareNumberedPath);

  const slides = [];
  for (const [index, slidePath] of slideFiles.entries()) {
    const slideXml = await zip.file(slidePath).async("string");
    const noteXml = noteFiles[index] ? await zip.file(noteFiles[index]).async("string") : "";
    const slide = pptxSlideXmlToText(slideXml, index + 1, noteXml);
    if (slide.trim()) slides.push(slide);
  }

  return slides.join("\n\n---\n\n").trim();
}

function compareNumberedPath(a, b) {
  return extractPathNumber(a) - extractPathNumber(b);
}

function extractPathNumber(path) {
  return Number(String(path || "").match(/(\d+)\.xml$/)?.[1] || 0);
}

export function pptxSlideXmlToText(slideXml, slideNumber = 1, noteXml = "") {
  const tables = Array.from(String(slideXml || "").matchAll(/<a:tbl\b[\s\S]*?<\/a:tbl>/gi)).map((match) =>
    pptxTableToMarkdown(match[0]),
  );
  const textWithoutTables = String(slideXml || "").replace(/<a:tbl\b[\s\S]*?<\/a:tbl>/gi, "");
  const lines = extractPptxTextRuns(textWithoutTables);
  const notes = extractPptxTextRuns(noteXml);
  const parts = [`# 幻灯片 ${slideNumber}`];
  if (lines.length) parts.push(lines.join("\n"));
  if (tables.length) parts.push(tables.join("\n\n"));
  if (notes.length) parts.push(`备注：\n${notes.join("\n")}`);
  return parts.join("\n\n");
}

function extractPptxTextRuns(xml) {
  return Array.from(String(xml || "").matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gi))
    .map((match) => decodeHtmlEntities(match[1]).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function pptxTableToMarkdown(tableXml) {
  const rows = Array.from(String(tableXml || "").matchAll(/<a:tr\b[\s\S]*?<\/a:tr>/gi))
    .map((rowMatch) =>
      Array.from(rowMatch[0].matchAll(/<a:tc\b[\s\S]*?<\/a:tc>/gi)).map((cellMatch) =>
        extractPptxTextRuns(cellMatch[0]).join(" / ").replace(/\|/g, "\\|"),
      ),
    )
    .filter((row) => row.length > 0);
  if (rows.length === 0) return "";
  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => {
    const padded = [...row];
    while (padded.length < columnCount) padded.push("");
    return padded;
  });
  const separator = Array.from({ length: columnCount }, () => "---");
  return [formatMarkdownTableRow(normalizedRows[0]), formatMarkdownTableRow(separator), ...normalizedRows.slice(1).map(formatMarkdownTableRow)].join("\n");
}
