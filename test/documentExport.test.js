import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { createDocxArrayBuffer, prepareDocumentExport, stripDuplicateLeadingTitle } from "../src/modules/documents/docxExporter.js";
import { createDocumentRenderer } from "../src/modules/documents/documentRenderer.js";

test("stripDuplicateLeadingTitle removes generated bold title from export body", () => {
  const content = "**关于培训安排的通知**\n\n各部门：\n请按要求参加培训。";
  assert.equal(stripDuplicateLeadingTitle("关于培训安排的通知", content), "各部门：\n请按要求参加培训。");
});

test("createDocxArrayBuffer creates a Word package without duplicated heading text", async () => {
  const prepared = prepareDocumentExport({
    title: "**关于培训安排的通知**",
    content: "**关于培训安排的通知**\n\n各部门：\n请按要求参加培训。",
  });
  const bytes = await createDocxArrayBuffer(prepared);
  const zip = await JSZip.loadAsync(bytes);
  const documentXml = await zip.file("word/document.xml").async("string");

  assert.ok(zip.file("[Content_Types].xml"));
  assert.match(documentXml, /关于培训安排的通知/);
  assert.match(documentXml, /各部门/);
  assert.equal((documentXml.match(/关于培训安排的通知/g) || []).length, 1);
});

test("document list keeps current document first without reordering the rest", () => {
  const renderer = createDocumentRenderer({
    state: {
      folders: [],
      docs: [
        { id: "a", title: "A", content: "", updatedAt: "2026-01-01T00:00:00.000Z" },
        { id: "b", title: "B", content: "", updatedAt: "2026-05-01T00:00:00.000Z" },
        { id: "c", title: "C", content: "", updatedAt: "2026-03-01T00:00:00.000Z" },
      ],
    },
    ui: { selectedDocId: "b", selectedFolderId: "all" },
    els: { searchInput: { value: "" } },
    getType: () => ({ name: "文档" }),
    getCurrentDoc: () => null,
    getDocumentLocation: () => "",
    onSelectDocument: () => {},
    onCopyDocument: () => {},
    onDeleteDocument: () => {},
  });

  assert.deepEqual(
    renderer.getVisibleDocuments().map((doc) => doc.id),
    ["b", "a", "c"],
  );
});
