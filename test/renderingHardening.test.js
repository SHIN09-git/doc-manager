import assert from "node:assert/strict";
import test from "node:test";
import { createDocumentRenderer } from "../src/modules/documents/documentRenderer.js";
import { createFolderRenderer } from "../src/modules/folders/folderRenderer.js";

test("document renderer escapes document ids in HTML attributes", () => {
  const originalWindow = globalThis.window;
  globalThis.window = {};
  const docList = createFakeElement();
  try {
    const renderer = createDocumentRenderer({
      state: {
        folders: [],
        docs: [{
          id: 'doc-1" onclick="alert(1)',
          title: "安全测试",
          content: "正文",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }],
      },
      ui: { selectedDocId: "", selectedFolderId: "all" },
      els: {
        searchInput: { value: "" },
        docCount: {},
        docList,
      },
      getType: () => ({ name: "通知" }),
      getCurrentDoc: () => null,
      getDocumentLocation: () => "",
      onSelectDocument: () => {},
      onCopyDocument: () => {},
      onMoveDocument: () => {},
      onMoveDocumentToTop: () => {},
      onMoveDocumentToBottom: () => {},
      onDeleteDocument: () => {},
    });

    renderer.renderDocList();
    assert.match(docList.innerHTML, /doc-1&quot; onclick=&quot;alert\(1\)/);
    assert.equal(docList.innerHTML.includes('doc-1" onclick="alert(1)'), false);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("folder renderer escapes folder ids and sanitizes folder colors", () => {
  const folderList = createFakeElement();
  const folderSelect = createFakeElement();
  const renderer = createFolderRenderer({
    state: {
      docs: [],
      folders: [{
        id: 'folder-1" data-bad="1',
        name: "异常文件夹",
        kind: "tag",
        color: 'red";background:url(javascript:alert(1))',
      }],
    },
    ui: { selectedFolderId: "all" },
    els: { folderList, folderSelect },
    onSelectFolder: () => {},
    onRenameFolder: () => {},
    onSyncFolder: () => {},
    onDeleteFolder: () => {},
  });

  renderer.renderFolders();
  renderer.renderFolderSelect();
  assert.match(folderList.innerHTML, /folder-1&quot; data-bad=&quot;1/);
  assert.equal(folderList.innerHTML.includes('folder-1" data-bad="1'), false);
  assert.equal(folderList.innerHTML.includes("javascript:alert"), false);
  assert.match(folderList.innerHTML, /background:#2d3234/);
  assert.match(folderSelect.innerHTML, /folder-1&quot; data-bad=&quot;1/);
});

function createFakeElement() {
  return {
    innerHTML: "",
    textContent: "",
    setAttribute() {},
    querySelectorAll() {
      return [];
    },
  };
}
