import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { buildUnsupportedFileMessage, readImportFileText } from "../src/utils/fileReaders.js";

test("readImportFileText extracts raw text from docx files", async () => {
  const docx = await createMinimalDocx("Notice", "Body content");
  const text = await readImportFileText({
    name: "notice.docx",
    arrayBuffer: async () => docx,
  });
  assert.match(text, /Notice/);
  assert.match(text, /Body content/);
});

test("readImportFileText preserves docx tables as markdown tables", async () => {
  const docx = await createMinimalDocx("Notice", "Body content", [
    ["Name", "Task"],
    ["Alice", "Prepare materials"],
  ]);
  const text = await readImportFileText({
    name: "table.docx",
    arrayBuffer: async () => docx,
  });
  assert.match(text, /\| Name \| Task \|/);
  assert.match(text, /\| --- \| --- \|/);
  assert.match(text, /\| Alice \| Prepare materials \|/);
});

test("buildUnsupportedFileMessage gives a clear .doc hint", () => {
  assert.match(buildUnsupportedFileMessage("legacy.doc"), /\.docx/);
});

test("readImportFileText extracts pptx slide text and tables", async () => {
  const pptx = await createMinimalPptx();
  const text = await readImportFileText({
    name: "deck.pptx",
    arrayBuffer: async () => pptx,
  });
  assert.match(text, /# 幻灯片 1/);
  assert.match(text, /Quarterly Review/);
  assert.match(text, /\| Metric \| Value \|/);
  assert.match(text, /\| Revenue \| 120 \|/);
});

test("buildUnsupportedFileMessage gives a clear .ppt hint", () => {
  assert.match(buildUnsupportedFileMessage("legacy.ppt"), /\.pptx/);
});

async function createMinimalDocx(title, body, tableRows = []) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.folder("_rels").file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.folder("word").file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${escapeXml(title)}</w:t></w:r></w:p>
    <w:p><w:r><w:t>${escapeXml(body)}</w:t></w:r></w:p>
    ${buildTableXml(tableRows)}
  </w:body>
</w:document>`,
  );
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function buildTableXml(rows) {
  if (!rows.length) return "";
  return `<w:tbl>${rows
    .map(
      (row) =>
        `<w:tr>${row
          .map((cell) => `<w:tc><w:p><w:r><w:t>${escapeXml(cell)}</w:t></w:r></w:p></w:tc>`)
          .join("")}</w:tr>`,
    )
    .join("")}</w:tbl>`;
}

async function createMinimalPptx() {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`,
  );
  zip.folder("ppt").folder("slides").file(
    "slide1.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp><p:txBody><a:p><a:r><a:t>Quarterly Review</a:t></a:r></a:p></p:txBody></p:sp>
      <p:graphicFrame><a:graphic><a:graphicData><a:tbl>
        <a:tr>
          <a:tc><a:txBody><a:p><a:r><a:t>Metric</a:t></a:r></a:p></a:txBody></a:tc>
          <a:tc><a:txBody><a:p><a:r><a:t>Value</a:t></a:r></a:p></a:txBody></a:tc>
        </a:tr>
        <a:tr>
          <a:tc><a:txBody><a:p><a:r><a:t>Revenue</a:t></a:r></a:p></a:txBody></a:tc>
          <a:tc><a:txBody><a:p><a:r><a:t>120</a:t></a:r></a:p></a:txBody></a:tc>
        </a:tr>
      </a:tbl></a:graphicData></a:graphic></p:graphicFrame>
    </p:spTree>
  </p:cSld>
</p:sld>`,
  );
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
