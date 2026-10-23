import { expect, test } from "@playwright/test";
import JSZip from "jszip";

const STORAGE_KEY = "school-doc-manager:v1";
const STORAGE_BOOTSTRAP_KEY = `${STORAGE_KEY}:bootstrap`;

test("loads workspace from localStorage fallback when bootstrap requires it", async ({ page }) => {
  const snapshot = {
    selectedFolderId: "all",
    selectedDocId: "doc-fallback",
    folders: [{ id: "folder-1", name: "Fallback", kind: "tag", color: "#0f766e" }],
    docs: [
      {
        id: "doc-fallback",
        title: "Fallback Notice",
        type: "notice",
        folderId: "folder-1",
        styleId: "style-1",
        content: "fallback body",
        createdAt: "2026-05-18T00:00:00.000Z",
        updatedAt: "2026-05-18T00:00:00.000Z",
      },
    ],
    styles: [
      {
        id: "style-1",
        name: "Fallback Style",
        handle: "fallback",
        summary: "Fallback summary",
        examples: [],
        enabled: true,
      },
    ],
    settings: {},
  };

  await page.addInitScript(
    ({ bootstrapKey, storageKey, state }) => {
      localStorage.setItem(storageKey, JSON.stringify(state));
      localStorage.setItem(bootstrapKey, JSON.stringify({ storage: "localStorage" }));
      Object.defineProperty(window, "indexedDB", { configurable: true, value: undefined });
    },
    { bootstrapKey: STORAGE_BOOTSTRAP_KEY, storageKey: STORAGE_KEY, state: snapshot },
  );

  await page.goto("/index.html");

  await expect(page.locator("#titleInput")).toHaveValue("Fallback Notice");
  await expect(page.locator("#contentEditor")).toHaveValue(/fallback body/);
});

test("imports a document through drag and drop", async ({ page }) => {
  await page.goto("/index.html");

  await dropTextFile(page, "#docDropZone", "drop-notice.txt", "导入正文");

  await expect(page.locator("#titleInput")).toHaveValue("drop-notice");
  await expect(page.locator("#contentEditor")).toHaveValue(/导入正文/);
});

test("imports Word tables and PPTX slides through the document picker", async ({ page }) => {
  const docx = await createOfficeDocxFixture();
  const pptx = await createOfficePptxFixture();
  await page.goto("/index.html");

  await page.locator("#importInput").setInputFiles([
    {
      name: "工作台表格.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: Buffer.from(docx),
    },
    {
      name: "季度汇报.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer: Buffer.from(pptx),
    },
  ]);

  await expect(page.locator("#docList")).toContainText("工作台表格");
  await expect(page.locator("#docList")).toContainText("季度汇报");
  await page.locator(".doc-item", { hasText: "工作台表格" }).click();
  await expect(page.locator("#contentEditor")).toHaveValue(/\| 部门 \| 任务 \|/);
  await expect(page.locator("#contentEditor")).toHaveValue(/\| 综合部 \| 准备材料 \|/);
  await page.locator(".doc-item", { hasText: "季度汇报" }).click();
  await expect(page.locator("#contentEditor")).toHaveValue(/# 幻灯片 1/);
  await expect(page.locator("#contentEditor")).toHaveValue(/季度工作复盘/);
});

test("exports the current document as Word by default", async ({ page }) => {
  await page.goto("/index.html");

  await dropTextFile(page, "#docDropZone", "word-export.txt", "**word-export**\n\n导出正文");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#exportDocBtn").click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/word-export\.docx$/);
});

test("restores a local workspace backup through the top toolbar", async ({ page }) => {
  await page.goto("/index.html");
  const backup = {
    app: "mowen-nibi-workbench",
    version: 2,
    scope: "local-workspace",
    data: {
      folders: [{ id: "folder-restored", name: "恢复标签", kind: "tag", color: "#2563eb" }],
      customTypes: [],
      styles: [],
      docs: [{
        id: "doc-restored",
        title: "已恢复文档",
        type: "notice",
        folderId: "folder-restored",
        content: "这是从备份恢复的正文。",
        createdAt: "2026-07-17T00:00:00.000Z",
        updatedAt: "2026-07-17T00:00:00.000Z",
      }],
      settings: { apiKey: "must-not-import" },
    },
  };

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#restoreBackupInput").setInputFiles({
    name: "workspace-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });

  await expect(page.locator("#titleInput")).toHaveValue("已恢复文档");
  await expect(page.locator("#contentEditor")).toHaveValue("这是从备份恢复的正文。");
  await expect(page.locator("#toastRegion")).toContainText("已恢复本机工作区");
});

test("selecting a document highlights it without reordering the list", async ({ page }) => {
  const snapshot = {
    selectedFolderId: "all",
    selectedDocId: "doc-a",
    folders: [{ id: "folder-1", name: "标签", kind: "tag", color: "#0f766e" }],
    docs: [
      { id: "doc-a", title: "A 文档", type: "notice", folderId: "folder-1", content: "A", updatedAt: "2026-01-01T00:00:00.000Z" },
      { id: "doc-b", title: "B 文档", type: "notice", folderId: "folder-1", content: "B", updatedAt: "2026-05-01T00:00:00.000Z" },
      { id: "doc-c", title: "C 文档", type: "notice", folderId: "folder-1", content: "C", updatedAt: "2026-03-01T00:00:00.000Z" },
    ],
    styles: [],
    settings: {},
  };
  await page.addInitScript(
    ({ bootstrapKey, storageKey, state }) => {
      localStorage.setItem(storageKey, JSON.stringify(state));
      localStorage.setItem(bootstrapKey, JSON.stringify({ storage: "localStorage" }));
      Object.defineProperty(window, "indexedDB", { configurable: true, value: undefined });
    },
    { bootstrapKey: STORAGE_BOOTSTRAP_KEY, storageKey: STORAGE_KEY, state: snapshot },
  );

  await page.goto("/index.html");
  await page.locator(".doc-item", { hasText: "C 文档" }).click();

  await expect(page.locator("#titleInput")).toHaveValue("C 文档");
  await expect(page.locator(".doc-item").nth(0)).toContainText("A 文档");
  await expect(page.locator(".doc-item").nth(1)).toContainText("B 文档");
  await expect(page.locator(".doc-item").nth(2)).toContainText("C 文档");
  await expect(page.locator(".doc-item", { hasText: "C 文档" })).toHaveClass(/active/);
});

test("document more menu can move documents to top and bottom", async ({ page }) => {
  const snapshot = {
    selectedFolderId: "all",
    selectedDocId: "doc-a",
    folders: [{ id: "folder-1", name: "标签", kind: "tag", color: "#0f766e" }],
    docs: [
      { id: "doc-a", title: "A 文档", type: "notice", folderId: "folder-1", content: "A" },
      { id: "doc-b", title: "B 文档", type: "notice", folderId: "folder-1", content: "B" },
      { id: "doc-c", title: "C 文档", type: "notice", folderId: "folder-1", content: "C" },
    ],
    styles: [],
    settings: {},
  };
  await page.addInitScript(
    ({ bootstrapKey, storageKey, state }) => {
      localStorage.setItem(storageKey, JSON.stringify(state));
      localStorage.setItem(bootstrapKey, JSON.stringify({ storage: "localStorage" }));
      Object.defineProperty(window, "indexedDB", { configurable: true, value: undefined });
    },
    { bootstrapKey: STORAGE_BOOTSTRAP_KEY, storageKey: STORAGE_KEY, state: snapshot },
  );

  await page.goto("/index.html");
  await page.locator(".doc-item", { hasText: "C 文档" }).hover();
  await page.locator(".doc-item", { hasText: "C 文档" }).locator("[data-doc-menu] summary").click();
  await page.locator(".doc-item", { hasText: "C 文档" }).locator("[data-move-doc-top]").click();

  await expect(page.locator(".doc-item").nth(0)).toContainText("C 文档");
  await expect(page.locator(".doc-item").nth(1)).toContainText("A 文档");
  await expect(page.locator(".doc-item").nth(2)).toContainText("B 文档");

  await page.locator(".doc-item", { hasText: "C 文档" }).hover();
  await page.locator(".doc-item", { hasText: "C 文档" }).locator("[data-doc-menu] summary").click();
  await page.locator(".doc-item", { hasText: "C 文档" }).locator("[data-move-doc-bottom]").click();

  await expect(page.locator(".doc-item").nth(0)).toContainText("A 文档");
  await expect(page.locator(".doc-item").nth(1)).toContainText("B 文档");
  await expect(page.locator(".doc-item").nth(2)).toContainText("C 文档");
});

test("document cards can be dragged to reorder", async ({ page }) => {
  const snapshot = {
    selectedFolderId: "all",
    selectedDocId: "doc-a",
    folders: [{ id: "folder-1", name: "标签", kind: "tag", color: "#0f766e" }],
    docs: [
      { id: "doc-a", title: "A 文档", type: "notice", folderId: "folder-1", content: "A" },
      { id: "doc-b", title: "B 文档", type: "notice", folderId: "folder-1", content: "B" },
      { id: "doc-c", title: "C 文档", type: "notice", folderId: "folder-1", content: "C" },
    ],
    styles: [],
    settings: {},
  };
  await page.addInitScript(
    ({ bootstrapKey, storageKey, state }) => {
      localStorage.setItem(storageKey, JSON.stringify(state));
      localStorage.setItem(bootstrapKey, JSON.stringify({ storage: "localStorage" }));
      Object.defineProperty(window, "indexedDB", { configurable: true, value: undefined });
    },
    { bootstrapKey: STORAGE_BOOTSTRAP_KEY, storageKey: STORAGE_KEY, state: snapshot },
  );

  await page.goto("/index.html");
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const source = page.locator(".doc-item", { hasText: "A 文档" }).first();
  const target = page.locator(".doc-item", { hasText: "C 文档" }).first();
  const targetBox = await target.boundingBox();
  expect(targetBox).not.toBeNull();
  const dropY = targetBox.y + targetBox.height - 2;

  await source.dispatchEvent("dragstart", { dataTransfer });
  await target.dispatchEvent("dragover", { dataTransfer, clientY: dropY });
  await target.dispatchEvent("drop", { dataTransfer, clientY: dropY });
  await source.dispatchEvent("dragend", { dataTransfer });

  await expect(page.locator(".doc-item").nth(0)).toContainText("B 文档");
  await expect(page.locator(".doc-item").nth(1)).toContainText("C 文档");
  await expect(page.locator(".doc-item").nth(2)).toContainText("A 文档");
});

test("document list supports keyboard focus and enter selection", async ({ page }) => {
  const snapshot = {
    selectedFolderId: "all",
    selectedDocId: "doc-a",
    folders: [{ id: "folder-1", name: "标签", kind: "tag", color: "#0f766e" }],
    docs: [
      { id: "doc-a", title: "A 文档", type: "notice", folderId: "folder-1", content: "A" },
      { id: "doc-b", title: "B 文档", type: "notice", folderId: "folder-1", content: "B" },
      { id: "doc-c", title: "C 文档", type: "notice", folderId: "folder-1", content: "C" },
    ],
    styles: [],
    settings: {},
  };
  await page.addInitScript(
    ({ bootstrapKey, storageKey, state }) => {
      localStorage.setItem(storageKey, JSON.stringify(state));
      localStorage.setItem(bootstrapKey, JSON.stringify({ storage: "localStorage" }));
      Object.defineProperty(window, "indexedDB", { configurable: true, value: undefined });
    },
    { bootstrapKey: STORAGE_BOOTSTRAP_KEY, storageKey: STORAGE_KEY, state: snapshot },
  );

  await page.goto("/index.html");
  await expect(page.locator("#docList")).toHaveAttribute("role", "listbox");
  await page.locator(".doc-item").first().focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".doc-item").nth(1)).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.locator("#titleInput")).toHaveValue("B 文档");
  await expect(page.locator(".doc-item").first()).toContainText("A 文档");
  await expect(page.locator(".doc-item").nth(1)).toHaveClass(/active/);
});

test("document trash supports restore and permanent delete", async ({ page }) => {
  const snapshot = {
    selectedFolderId: "all",
    selectedDocId: "doc-a",
    folders: [{ id: "folder-1", name: "标签", kind: "tag", color: "#0f766e" }],
    docs: [
      { id: "doc-a", title: "可恢复文档", type: "notice", folderId: "folder-1", content: "A" },
      { id: "doc-b", title: "保留文档", type: "notice", folderId: "folder-1", content: "B" },
    ],
    styles: [],
    settings: {},
  };
  await page.addInitScript(
    ({ bootstrapKey, storageKey, state }) => {
      localStorage.setItem(storageKey, JSON.stringify(state));
      localStorage.setItem(bootstrapKey, JSON.stringify({ storage: "localStorage" }));
      Object.defineProperty(window, "indexedDB", { configurable: true, value: undefined });
    },
    { bootstrapKey: STORAGE_BOOTSTRAP_KEY, storageKey: STORAGE_KEY, state: snapshot },
  );

  await page.goto("/index.html");
  page.once("dialog", async (dialog) => dialog.accept());
  await page.locator(".doc-item", { hasText: "可恢复文档" }).locator("[data-delete-doc]").click();

  await expect(page.locator(".doc-item", { hasText: "可恢复文档" })).toHaveCount(0);
  await expect(page.locator("#trashCount")).toHaveText("1");

  await page.locator("#trashTopBtn").click();
  await expect(page.locator("#trashModal")).toBeVisible();
  await expect(page.locator("#trashModalList").locator(".trash-item", { hasText: "可恢复文档" })).toBeVisible();
  await expect(page.locator("#restoreAllTrashBtn")).toBeEnabled();
  await expect(page.locator("#clearTrashBtn")).toBeEnabled();

  await page.locator("#trashModalList").locator("[data-restore-doc='doc-a']").click();
  await expect(page.locator(".doc-item", { hasText: "可恢复文档" })).toBeVisible();
  await expect(page.locator("#trashCount")).toHaveText("0");
  await expect(page.locator("#trashModalList")).toContainText("垃圾箱为空");
  await page.locator("#closeTrashModalBtn").click();

  page.once("dialog", async (dialog) => dialog.accept());
  await page.locator(".doc-item", { hasText: "可恢复文档" }).locator("[data-delete-doc]").click();
  await page.locator("#trashTopBtn").click();
  page.once("dialog", async (dialog) => dialog.accept());
  await page.locator("#trashModalList").locator("[data-permanent-delete-doc='doc-a']").click();

  await expect(page.locator("#trashModalList")).toContainText("垃圾箱为空");
  await expect(page.locator("#trashCount")).toHaveText("0");
});

test("deleting the last active document leaves a disabled empty editor", async ({ page }) => {
  const snapshot = {
    selectedFolderId: "all",
    selectedDocId: "doc-a",
    folders: [{ id: "folder-1", name: "标签", kind: "tag", color: "#0f766e" }],
    docs: [
      { id: "doc-a", title: "最后一份文档", type: "notice", folderId: "folder-1", content: "A" },
    ],
    styles: [],
    settings: {},
  };
  await page.addInitScript(
    ({ bootstrapKey, storageKey, state }) => {
      localStorage.setItem(storageKey, JSON.stringify(state));
      localStorage.setItem(bootstrapKey, JSON.stringify({ storage: "localStorage" }));
      Object.defineProperty(window, "indexedDB", { configurable: true, value: undefined });
    },
    { bootstrapKey: STORAGE_BOOTSTRAP_KEY, storageKey: STORAGE_KEY, state: snapshot },
  );

  await page.goto("/index.html");
  page.once("dialog", async (dialog) => dialog.accept());
  await page.locator(".doc-item", { hasText: "最后一份文档" }).locator("[data-delete-doc]").click();

  await expect(page.locator("#docList")).toContainText("没有匹配的文档");
  await expect(page.locator("#titleInput")).toBeDisabled();
  await expect(page.locator("#contentEditor")).toBeDisabled();
  await expect(page.locator("#saveDocBtn")).toBeDisabled();
  await expect(page.locator("#undoEditBtn")).toBeDisabled();
  await expect(page.locator("#saveState")).toHaveText("请新建或导入文档");
  await expect(page.locator("#trashCount")).toHaveText("1");
});

test("trash bulk actions restore all and clear all documents", async ({ page }) => {
  const snapshot = {
    selectedFolderId: "all",
    selectedDocId: "doc-a",
    folders: [{ id: "folder-1", name: "标签", kind: "tag", color: "#0f766e" }],
    docs: [
      { id: "doc-a", title: "批量文档 A", type: "notice", folderId: "folder-1", content: "A" },
      { id: "doc-b", title: "批量文档 B", type: "notice", folderId: "folder-1", content: "B" },
    ],
    styles: [],
    settings: {},
  };
  await page.addInitScript(
    ({ bootstrapKey, storageKey, state }) => {
      localStorage.setItem(storageKey, JSON.stringify(state));
      localStorage.setItem(bootstrapKey, JSON.stringify({ storage: "localStorage" }));
      Object.defineProperty(window, "indexedDB", { configurable: true, value: undefined });
    },
    { bootstrapKey: STORAGE_BOOTSTRAP_KEY, storageKey: STORAGE_KEY, state: snapshot },
  );

  await page.goto("/index.html");
  page.once("dialog", async (dialog) => dialog.accept());
  await page.locator(".doc-item", { hasText: "批量文档 A" }).locator("[data-delete-doc]").click();
  page.once("dialog", async (dialog) => dialog.accept());
  await page.locator(".doc-item", { hasText: "批量文档 B" }).locator("[data-delete-doc]").click();
  await expect(page.locator("#trashCount")).toHaveText("2");

  await page.locator("#trashTopBtn").click();
  await expect(page.locator("#trashModalList").locator(".trash-item")).toHaveCount(2);
  await page.locator("#restoreAllTrashBtn").click();
  await expect(page.locator("#trashCount")).toHaveText("0");
  await expect(page.locator("#trashModalList")).toContainText("垃圾箱为空");
  await expect(page.locator(".doc-item", { hasText: "批量文档 A" })).toBeVisible();
  await expect(page.locator(".doc-item", { hasText: "批量文档 B" })).toBeVisible();
  await page.locator("#closeTrashModalBtn").click();

  page.once("dialog", async (dialog) => dialog.accept());
  await page.locator(".doc-item", { hasText: "批量文档 A" }).locator("[data-delete-doc]").click();
  page.once("dialog", async (dialog) => dialog.accept());
  await page.locator(".doc-item", { hasText: "批量文档 B" }).locator("[data-delete-doc]").click();
  await page.locator("#trashTopBtn").click();
  page.once("dialog", async (dialog) => dialog.accept());
  await page.locator("#clearTrashBtn").click();

  await expect(page.locator("#trashCount")).toHaveText("0");
  await expect(page.locator("#trashModalList")).toContainText("垃圾箱为空");
  await expect(page.locator("#docList")).toContainText("没有匹配的文档");
});

test("routes PPT panel drops into the PPT material box", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator('[data-tab="ppt"]').click();

  await dropTextFile(page, "#pptDropZone", "ppt-material.md", "PPT 素材正文");

  await expect(page.locator("#pptPromptInput")).toHaveValue(/ppt-material\.md/);
  await expect(page.locator("#pptPromptInput")).toHaveValue(/PPT 素材正文/);
});

test("drags a document card into the AI generation references", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator('[data-tab="generate"]').click();

  await dropTextFile(page, "#docDropZone", "drag-source.txt", "这是一段可用于起草的正文素材");

  const docItem = page.locator(".doc-item", { hasText: "drag-source" }).first();
  await expect(docItem).toBeVisible();
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await docItem.dispatchEvent("dragstart", { dataTransfer });
  await page.dispatchEvent("#generatePrompt", "dragenter", { dataTransfer });
  await page.dispatchEvent("#generatePrompt", "dragover", { dataTransfer });
  await page.dispatchEvent("#generatePrompt", "drop", { dataTransfer });
  await dataTransfer.dispose();

  await expect(page.locator("#referenceList .reference-chip")).toHaveCount(1);
  await expect(page.locator("#referenceList")).toContainText("drag-source");
  await expect(page.locator("#referenceSummary")).toContainText("1 份");
  await expect(page.locator("#generatePrompt")).toHaveValue("");
});

test("PPT panel supports custom count, custom style skill, and structure check", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator('[data-tab="ppt"]').click();

  await expect(page.locator("#pptStyleSelect option[value='officialBlue']")).toHaveCount(1);
  await expect(page.locator("#pptStyleSelect option[value='swissOrange']")).toHaveCount(1);

  await page.locator("#pptSlideCountSelect").fill("5");
  await page.locator("#pptStyleSelect").selectOption("custom");
  await page.locator("#pptCustomStyleInput").fill("绿色点缀，数据优先，适合校内述职。");

  page.once("dialog", async (dialog) => {
    await dialog.accept("绿色述职 PPT");
  });
  await page.locator("#savePptStyleBtn").click();
  await page.locator('[data-tab="style"]').click();
  await expect(page.locator("#styleList")).toContainText("绿色述职 PPT");

  await page.locator('[data-tab="ppt"]').click();
  await page.locator("#pptOutput").fill(
    JSON.stringify({
      title: "自检测试",
      style: "custom",
      slides: [{ type: "data", title: "关键指标", bullets: ["完成率：92%"] }],
    }),
  );
  await page.locator("#pptOutput").dispatchEvent("input");

  await expect(page.locator("#pptQualityReport")).toContainText("期望 5 页，当前 1 页");
  await expect(page.locator("#pptQualityStatus")).toContainText(/提示|需处理/);
});

test("PPT panel can use automatic slide count", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator('[data-tab="ppt"]').click();

  await page.locator("#pptAutoSlideCountInput").check();
  await expect(page.locator("#pptSlideCountSelect")).toBeDisabled();
  await page.locator("#pptOutput").fill(
    JSON.stringify({
      title: "自动页数测试",
      slideCount: "auto",
      slides: [
        { type: "cover", title: "自动页数测试" },
        { type: "content", title: "第一部分", body: "根据内容自动保留页数" },
        { type: "closing", title: "结束页" },
      ],
    }),
  );
  await page.locator("#pptOutput").dispatchEvent("input");

  await expect(page.locator("#pptQualityReport")).toContainText("自动页数");
  await expect(page.locator("#pptQualityStatus")).toContainText(/有提示|通过/);
});

test("PPT workspace opens in the editor area and edits slides inline", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator('[data-tab="ppt"]').click();

  await expect(page.locator("#editorPanel")).toHaveAttribute("data-main-view", "ppt");
  await expect(page.locator("#pptPanel")).toBeVisible();
  await expect.poll(() => page.locator("#pptPanel").evaluate((element) => element.parentElement?.id)).toBe("editorPanel");
  await expect(page.locator("#workspaceInspector #pptPanel")).toHaveCount(0);
  await expect(page.locator("#workspaceInspector")).toBeVisible();

  await page.locator("#pptOutput").fill(
    JSON.stringify({
      title: "Deck",
      style: "officialBlue",
      slides: [
        { type: "cover", title: "Original title", body: "Opening" },
        { type: "bullets", title: "Second", bullets: ["One", "Two"] },
      ],
    }),
  );
  await page.locator("#pptOutput").dispatchEvent("input");

  const firstTitle = page.locator('[data-ppt-slide-index="0"][data-ppt-slide-field="title"]');
  await expect(firstTitle).toHaveValue("Original title");
  await firstTitle.fill("Edited title");
  await expect(page.locator("#pptOutput")).toHaveValue(/Edited title/);
  await expect(page.frameLocator("#pptPreview").locator("h2").first()).toContainText("Edited title");
});

test("workspace columns can be resized from the editor handles", async ({ page }) => {
  await page.goto("/index.html");

  const before = await page.evaluate(() => Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue("--inspector-w"), 10));
  await page.locator("#rightWorkspaceResizer").focus();
  await page.keyboard.press("ArrowRight");
  const after = await page.evaluate(() => Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue("--inspector-w"), 10));

  expect(after).toBeLessThan(before);
});

test("custom document types can be added, renamed, and removed", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#typeSelect").selectOption("custom");

  const dialogAnswers = ["内部简报", "背景、重点事项、执行要求", "工作简报", "背景、工作进展、下一步安排", true];
  page.on("dialog", async (dialog) => {
    const answer = dialogAnswers.shift();
    if (answer === true) await dialog.accept();
    else await dialog.accept(String(answer || ""));
  });
  await page.locator("#addTypeBtn").click();
  await expect(page.locator("#typeSelect")).toHaveValue(/custom-/);
  await expect(page.locator("#typeSelect option", { hasText: "内部简报" })).toHaveCount(1);

  await page.locator("#renameTypeBtn").click();
  await expect(page.locator("#typeSelect option", { hasText: "工作简报" })).toHaveCount(1);

  await page.locator("#deleteTypeBtn").click();
  await expect(page.locator("#typeSelect")).toHaveValue("custom");
  await expect(page.locator("#typeSelect option", { hasText: "工作简报" })).toHaveCount(0);
});

test("editor context menu supports menu roles arrow navigation and escape", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#contentEditor").click({ button: "right" });

  await expect(page.locator("#editorMenu")).toBeVisible();
  await expect(page.locator("#editorMenu")).toHaveAttribute("role", "menu");
  await expect(page.getByRole("menuitem", { name: /复制选中内容/ })).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: /删除选中内容/ })).toBeFocused();
  await page.keyboard.press("Escape");

  await expect(page.locator("#editorMenu")).toBeHidden();
  await expect(page.locator("#contentEditor")).toBeFocused();
});

test("editor context menu rewrites selection with a chosen skill preset", async ({ page }) => {
  const snapshot = {
    selectedFolderId: "all",
    selectedDocId: "doc-a",
    folders: [{ id: "folder-1", name: "标签", kind: "tag", color: "#0f766e" }],
    docs: [
      { id: "doc-a", title: "会议记录", type: "summary", folderId: "folder-1", content: "今天开了会，大家说要推进项目。" },
    ],
    styles: [
      {
        id: "style-1",
        name: "会议纪要",
        handle: "会议纪要",
        category: "公文写作",
        enabled: true,
        skillJson: JSON.stringify({ name: "会议纪要", handle: "会议纪要", style_rules: { must: ["客观记录会议事项"] } }),
      },
    ],
    settings: {
      provider: "openai-compatible",
      baseUrl: "http://127.0.0.1:4173/mock-ai",
      endpointPath: "/chat/completions",
      model: "test-model",
    },
  };
  await page.addInitScript(
    ({ bootstrapKey, storageKey, state }) => {
      localStorage.setItem(storageKey, JSON.stringify(state));
      localStorage.setItem(bootstrapKey, JSON.stringify({ storage: "localStorage" }));
      Object.defineProperty(window, "indexedDB", { configurable: true, value: undefined });
    },
    { bootstrapKey: STORAGE_BOOTSTRAP_KEY, storageKey: STORAGE_KEY, state: snapshot },
  );
  await page.route("**/mock-ai/chat/completions", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ choices: [{ message: { content: "会议要求各相关人员持续推进项目，并按节点反馈进展。" } }] }),
    });
  });

  await page.goto("/index.html");
  await page.locator("#contentEditor").focus();
  await page.locator("#contentEditor").evaluate((editor) => editor.setSelectionRange(0, editor.value.length));
  await page.locator("#contentEditor").click({ button: "right", position: { x: 24, y: 18 } });
  await page.locator("#editorSkillSelect").selectOption("style-1");
  await page.getByRole("menuitem", { name: /改文风/ }).click();

  await expect(page.locator("#contentEditor")).toHaveValue(/会议要求各相关人员持续推进项目/);
});

test("inline AI revision replaces the selected paragraph and can be undone", async ({ page }) => {
  const originalContent = "第一段保持不变。\n第二段写得比较啰嗦，需要压缩。\n第三段也保持不变。";
  const snapshot = {
    selectedFolderId: "all",
    selectedDocId: "doc-revise",
    folders: [{ id: "folder-1", name: "标签", kind: "tag", color: "#0f766e" }],
    docs: [
      { id: "doc-revise", title: "原位修改测试", type: "notice", folderId: "folder-1", content: originalContent },
    ],
    styles: [],
    settings: {
      provider: "openai-compatible",
      baseUrl: "http://127.0.0.1:4173/mock-ai",
      endpointPath: "/chat/completions",
      model: "test-model",
    },
  };
  await page.addInitScript(
    ({ bootstrapKey, storageKey, state }) => {
      localStorage.setItem(storageKey, JSON.stringify(state));
      localStorage.setItem(bootstrapKey, JSON.stringify({ storage: "localStorage" }));
      Object.defineProperty(window, "indexedDB", { configurable: true, value: undefined });
    },
    { bootstrapKey: STORAGE_BOOTSTRAP_KEY, storageKey: STORAGE_KEY, state: snapshot },
  );
  await page.route("**/mock-ai/chat/completions", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ choices: [{ message: { content: "第二段需要压缩。" } }] }),
    });
  });

  await page.goto("/index.html");
  await page.locator("#contentEditor").evaluate((editor) => {
    const target = "第二段写得比较啰嗦，需要压缩。";
    const start = editor.value.indexOf(target);
    editor.focus();
    editor.setSelectionRange(start, start + target.length);
    editor.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await expect(page.locator("#aiRevisionTarget")).toContainText("已选中");
  await page.locator("#aiRevisionPrompt").fill("压缩为一句话，保留原意。");
  await page.locator("#aiRevisionBtn").click();

  await expect(page.locator("#contentEditor")).toHaveValue("第一段保持不变。\n第二段需要压缩。\n第三段也保持不变。");
  await expect(page.locator("#titleInput")).toHaveValue("原位修改测试");
  await page.locator("#undoEditBtn").click();
  await expect(page.locator("#contentEditor")).toHaveValue(originalContent);
});

test("AI drafting supports new, overwrite, and cursor insertion modes", async ({ page }) => {
  const snapshot = createAiWorkspaceSnapshot({
    docs: [{
      id: "doc-a",
      title: "原通知",
      type: "notice",
      folderId: "folder-1",
      content: "原正文第一段。\n原正文第二段。",
    }],
  });
  await seedWorkspace(page, snapshot);
  const requests = await installDeterministicAiRoute(page);

  await page.goto("/index.html");
  await page.locator('[data-tab="generate"]').click();
  await page.locator("#generatePrompt").fill("请起草一份校内培训通知");
  await page.locator("#generateDocBtn").click();

  await expect(page.locator("#titleInput")).toHaveValue("校内培训通知");
  await expect(page.locator("#contentEditor")).toHaveValue("请各部门按要求组织参训，时间和地点为【可替换占位符】。");
  await expect(page.locator("#contentEditor")).not.toHaveValue(/校内培训通知/);

  await page.locator("#generatePrompt").fill("覆盖为一份校内值班通知");
  await page.locator("#overwriteDraftBtn").click();
  await expect(page.locator("#titleInput")).toHaveValue("校内值班通知");
  await expect(page.locator("#contentEditor")).toHaveValue("请相关人员按值班安排到岗，具体时间为【可替换占位符】。");

  await page.locator("#contentEditor").evaluate((editor) => {
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
  });
  await page.locator("#generatePrompt").fill("插入一条补充提醒");
  await page.locator("#insertDraftBtn").click();
  await expect(page.locator("#contentEditor")).toHaveValue(/请提前确认联系方式。$/);
  expect(requests.filter((item) => item.taskType === "document_generation")).toHaveLength(3);
});

test("API connection test retries a 429 response and recovers", async ({ page }) => {
  let attempts = 0;
  await page.route("**/retry-ai/chat/completions", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        status: 429,
        headers: { "retry-after": "0.01" },
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "rate limited" } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ choices: [{ message: { content: "连接正常" } }] }),
    });
  });
  await page.goto("/index.html");
  await page.locator("#apiTopBtn").click();
  await page.locator("#baseUrlInput").fill("http://127.0.0.1:4173/retry-ai");
  await page.locator("#endpointPathInput").fill("/chat/completions");
  await page.locator("#modelInput").fill("retry-model");
  await page.locator("#testApiBtn").click();

  await expect.poll(() => attempts).toBe(2);
  await expect(page.locator("#toastRegion")).toContainText("接口返回：连接正常");
  await expect(page.locator("#aiStatus")).toContainText("已配置");
});

test("long AI drafting can be cancelled from the primary button", async ({ page }) => {
  await seedWorkspace(page, createAiWorkspaceSnapshot());
  let releaseRequest = null;
  await page.route("**/mock-ai/chat/completions", async (route) => {
    await new Promise((resolve) => {
      releaseRequest = async () => {
        try {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ choices: [{ message: { content: "不应写入的迟到结果" } }] }),
          });
        } catch {
          // The browser may already have cancelled the request.
        }
        resolve();
      };
    });
  });

  await page.goto("/index.html");
  await page.locator('[data-tab="generate"]').click();
  await page.locator("#generatePrompt").fill("开始一个可以取消的长任务");
  await page.locator("#generateDocBtn").click();
  await expect(page.locator("#generateDocBtn")).toContainText("点击取消");
  await expect.poll(() => Boolean(releaseRequest)).toBe(true);
  await page.locator("#generateDocBtn").click();
  await releaseRequest();

  await expect(page.locator("#generateDocBtn")).toContainText("生成新文档");
  await expect(page.locator("#toastRegion")).toContainText("已取消本次文档生成");
  await expect(page.locator("#titleInput")).not.toHaveValue("不应写入的迟到结果");
});

test("writer builder completes the AI chain and the generated writer can be invoked", async ({ page }) => {
  const snapshot = createAiWorkspaceSnapshot({
    docs: [
      {
        id: "doc-a",
        title: "培训通知样本一",
        type: "notice",
        folderId: "folder-1",
        content: "关于开展培训的通知。各部门按要求报名，并按时参加。",
      },
      {
        id: "doc-b",
        title: "培训通知样本二",
        type: "notice",
        folderId: "folder-1",
        content: "关于组织专题学习的通知。请各部门明确人员，做好准备。",
      },
    ],
  });
  await seedWorkspace(page, snapshot);
  const requests = await installDeterministicAiRoute(page, { delayMs: 45 });

  await page.goto("/index.html");
  await page.locator("#newStyleBtn").click();
  await page.locator("#styleNameInput").fill("学校通知执笔人");
  await page.locator("#skillSourceDocSelect").selectOption(["doc-a", "doc-b"]);
  await page.locator("#addSourceDocsToSkillBtn").click();
  await expect(page.locator("#styleExampleList .example-item")).toHaveCount(2);
  await page.locator(".skill-builder-advanced summary").click();
  await page.locator("#skillBuilderTestPrompt").fill("请起草一份校内值班通知，缺失信息保留占位符");
  await page.locator("#summarizeStyleBtn").click();

  await expect(page.locator("#skillBuilderModal")).toBeHidden();
  const card = page.locator("[data-skill-card]", { hasText: "学校通知执笔人" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("已启用", { timeout: 15_000 });
  await expect(card).toContainText("已生成 v1");
  await expect(card).toContainText("强规则 1 条");
  await expect.poll(() => requests.some((item) => item.prompt.includes("校内值班通知，缺失信息保留占位符"))).toBe(true);

  await card.locator("[data-invoke-skill]").click();
  await expect(page.locator("#generatePrompt")).toHaveValue(/@学校通知执笔人/);
  await page.locator("#generatePrompt").fill("@学校通知执笔人 请起草一份培训通知");
  await expect(page.locator("#skillInputStatus")).toHaveText("必填 0/2");
  await page.locator('[data-skill-input="事项"]').fill("专项培训");
  await page.locator('[data-skill-input="对象"]').fill("各部门负责人");
  await page.locator("#generateDocBtn").click();
  await expect(page.locator("#titleInput")).toHaveValue("校内培训通知");
  expect(requests.filter((item) => item.taskType === "document_generation").at(-1).prompt).toContain("- 对象：各部门负责人");

  await expect.poll(async () => page.evaluate(
    ({ storageKey }) => {
      const stored = JSON.parse(localStorage.getItem(storageKey));
      const writer = stored.styles.find((item) => item.name === "学校通知执笔人");
      return writer ? `${writer.status}:${writer.versions.length}:${Boolean(writer.lastTest)}` : "missing";
    },
    { storageKey: STORAGE_KEY },
  )).toBe("ready:1:true");
});

test("AI-generated PPT can be edited in-page and downloaded as native pptx", async ({ page }) => {
  await seedWorkspace(page, createAiWorkspaceSnapshot());
  await installDeterministicAiRoute(page);

  await page.goto("/index.html");
  await page.locator('[data-tab="ppt"]').click();
  await page.locator("#pptTitleInput").fill("年度工作复盘");
  await page.locator("#pptAutoSlideCountInput").check();
  await page.locator("#pptPromptInput").fill("总结年度重点工作、关键数据和下一步计划");
  await page.locator("#generatePptBtn").click();

  await expect(page.locator("[data-ppt-slide-card]")).toHaveCount(3);
  await expect(page.locator("#pptQualityReport")).toContainText("自动页数");
  const firstTitle = page.locator('[data-ppt-slide-index="0"][data-ppt-slide-field="title"]');
  await firstTitle.fill("年度工作复盘（修订）");
  await expect(page.locator("#pptOutput")).toHaveValue(/年度工作复盘（修订）/);

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#downloadPptBtn").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/年度工作复盘\.pptx$/);
});

test("skill packages can be exported and imported", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator('[data-tab="style"]').click();

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#exportSkillPackageBtn").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.skill\.json$/);

  const packageText = JSON.stringify({
    schema: "mowen-nibi-workbench.skill-package.v1",
    skill: {
      name: "导入会议纪要",
      handle: "导入会议纪要",
      summaryMd: "# 导入会议纪要",
      ruleJson: { name: "导入会议纪要", handle: "导入会议纪要", category: "公文写作" },
      sourceDocuments: [{ name: "会议样本.docx", length: 900 }],
    },
  });
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("即将导入执笔人包");
    await dialog.accept();
  });
  await page.locator("#importSkillPackageInput").setInputFiles({
    name: "meeting.skill.json",
    mimeType: "application/json",
    buffer: Buffer.from(packageText),
  });

  await expect(page.locator("#styleList")).toContainText("导入会议纪要");
  await expect(page.locator("#styleExampleList")).toContainText("会议样本.docx");
});

test("skill cards can insert an invocation into the generation prompt", async ({ page }) => {
  await page.goto("/index.html");

  await expect(page.locator("#stylePanel")).toBeVisible();
  await expect(page.locator('[data-tab="style"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#styleList")).not.toContainText("置信度");
  await page.locator("[data-invoke-skill]").first().click();

  await expect(page.locator("#generatePanel")).toBeVisible();
  await expect(page.locator('[data-tab="generate"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#generatePrompt")).toHaveValue(/@/);
  await expect(page.locator("#generatePrompt")).toBeFocused();
});

test("skill card edit saves markdown while retrain opens the builder", async ({ page }) => {
  const snapshot = {
    selectedFolderId: "all",
    selectedDocId: "doc-a",
    folders: [{ id: "folder-1", name: "Library", kind: "tag", color: "#0f766e" }],
    docs: [{ id: "doc-a", title: "Source Notice", type: "notice", folderId: "folder-1", content: "source body" }],
    styles: [
      {
        id: "style-1",
        name: "Meeting Writer",
        handle: "meeting-writer",
        category: "公文写作",
        summary: "# Meeting Writer\n\nOriginal summary",
        examples: [{ name: "sample.txt", text: "formal sample body" }],
        enabled: true,
      },
    ],
    settings: {},
  };
  await page.addInitScript(
    ({ bootstrapKey, storageKey, state }) => {
      localStorage.setItem(storageKey, JSON.stringify(state));
      localStorage.setItem(bootstrapKey, JSON.stringify({ storage: "localStorage" }));
      Object.defineProperty(window, "indexedDB", { configurable: true, value: undefined });
    },
    { bootstrapKey: STORAGE_BOOTSTRAP_KEY, storageKey: STORAGE_KEY, state: snapshot },
  );

  await page.goto("/index.html");
  await page.locator('[data-tab="style"]').click();
  await expect(page.locator('[data-edit-skill="style-1"]')).toHaveCount(0);
  await expect(page.locator('[data-retrain-skill="style-1"]')).toHaveCount(0);
  await expect(page.locator('[data-skill-card="style-1"]')).toHaveAttribute("aria-expanded", "false");
  await page.locator('[data-skill-card="style-1"]').click();
  await expect(page.locator('[data-skill-card="style-1"]')).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('[data-edit-skill="style-1"]')).toBeVisible();
  await page.locator('[data-edit-skill="style-1"]').click();

  await expect(page.locator("#skillDetailMenu")).toBeVisible();
  await expect(page.locator("#markdownDetailPanel")).toHaveClass(/active/);
  await expect(page.locator("#styleSummaryInput")).toBeFocused();

  const updatedSummary = "# Meeting Writer\n\nUpdated summary with trailing space. ";
  await page.locator("#styleSummaryInput").fill(updatedSummary);
  await expect(page.locator("#saveSkillMdBtn")).toHaveAttribute("data-dirty", "true");
  await page.locator("#saveSkillMdBtn").click();
  await expect(page.locator("#saveSkillMdBtn")).toHaveAttribute("data-dirty", "false");
  await expect
    .poll(async () =>
      page.evaluate(
        ({ storageKey }) => JSON.parse(localStorage.getItem(storageKey)).styles.find((style) => style.id === "style-1").summary,
        { storageKey: STORAGE_KEY },
      ),
    )
    .toBe(updatedSummary);

  await page.locator("#skillDetailCloseBtn").click();
  await page.locator('[data-retrain-skill="style-1"]').click();

  await expect(page.locator("#skillBuilderModal")).toBeVisible();
  await expect(page.locator("#styleExampleList .example-item")).toHaveCount(1);
});

test("building skill cards stay expanded with progress controls", async ({ page }) => {
  const snapshot = {
    selectedFolderId: "all",
    selectedDocId: "doc-a",
    folders: [{ id: "folder-1", name: "Library", kind: "tag", color: "#0f766e" }],
    docs: [{ id: "doc-a", title: "Source Notice", type: "notice", folderId: "folder-1", content: "source body" }],
    styles: [
      {
        id: "style-building",
        name: "Building Writer",
        handle: "building-writer",
        category: "公文写作",
        status: "building",
        buildProgress: { message: "正在分析单篇文档", progress: 45 },
        examples: [{ name: "sample.txt", text: "sample body" }],
        enabled: true,
      },
    ],
    settings: {},
  };
  await page.addInitScript(
    ({ bootstrapKey, storageKey, state }) => {
      localStorage.setItem(storageKey, JSON.stringify(state));
      localStorage.setItem(bootstrapKey, JSON.stringify({ storage: "localStorage" }));
      Object.defineProperty(window, "indexedDB", { configurable: true, value: undefined });
    },
    { bootstrapKey: STORAGE_BOOTSTRAP_KEY, storageKey: STORAGE_KEY, state: snapshot },
  );

  await page.goto("/index.html");

  await expect(page.locator('[data-skill-card="style-building"]')).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('[data-skill-card="style-building"]')).toContainText("正在分析单篇文档");
  await expect(page.locator('[data-cancel-skill-build="style-building"]')).toBeVisible();
});

test("responsive tablet layout opens tools in a drawer", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 760 });
  await page.goto("/index.html");

  await expect(page.locator("#responsiveInspectorToggle")).toBeVisible();
  await expect(page.locator("#rightWorkspaceResizer")).toBeHidden();
  await expect(page.locator("body")).not.toHaveClass(/inspector-open/);

  await page.locator("#responsiveInspectorToggle").click();
  await expect(page.locator("body")).toHaveClass(/inspector-open/);
  await expect(page.locator("#responsiveInspectorToggle")).toHaveAttribute("aria-expanded", "true");

  await page.locator("#responsiveBackdrop").click();
  await expect(page.locator("body")).not.toHaveClass(/inspector-open/);
});

test("responsive mobile layout switches between docs editor and tools", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await page.goto("/index.html");

  await expect(page.locator("#mobileWorkspaceNav")).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-mobile-view", "editor");
  await expect(page.locator(".editor-panel")).toBeVisible();
  await expect(page.locator(".sidebar")).toBeHidden();

  await page.locator("[data-mobile-view='docs']").click();
  await expect(page.locator("body")).toHaveAttribute("data-mobile-view", "docs");
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(page.locator(".editor-panel")).toBeHidden();

  await page.locator("[data-mobile-view='tools']").click();
  await expect(page.locator("body")).toHaveAttribute("data-mobile-view", "tools");
  await expect(page.locator(".inspector")).toBeVisible();
  await expect(page.locator(".editor-panel")).toBeHidden();

  await page.locator("[data-tab='ppt']").click();
  await expect(page.locator("#pptPanel")).toBeVisible();
});

test("PPT preview modal expands the generated HTML preview", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator('[data-tab="ppt"]').click();

  await page.locator("#pptOutput").fill(
    JSON.stringify({
      title: "预览测试",
      style: "officialBlue",
      slides: [
        { type: "cover", title: "预览测试" },
        { type: "bullets", title: "要点", bullets: ["一页一个观点"] },
      ],
    }),
  );
  await page.locator("#pptOutput").dispatchEvent("input");

  await page.locator("#openPptPreviewBtn").click();
  await expect(page.locator("#pptPreviewOverlay")).toBeVisible();
  await expect(page.locator("#pptPreviewModalFrame")).toBeVisible();
  await expect(page.locator("#closePptPreviewBtn")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#closePptPreviewBtn")).toBeFocused();
  await page.locator("#closePptPreviewBtn").click();
  await expect(page.locator("#pptPreviewOverlay")).toBeHidden();
  await expect(page.locator("#openPptPreviewBtn")).toBeFocused();
});

test("cloud panel keeps local mode safe before login", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#cloudTopBtn").click();

  await expect(page.locator("#cloudPanel")).toBeVisible();
  await expect(page.locator("#editorPanel")).toHaveAttribute("data-main-view", "cloud");
  await expect(page.locator("#workspaceInspector #cloudPanel")).toHaveCount(0);
  await expect(page.locator("#contentEditor")).toBeHidden();
  await expect(page.locator("#cloudStatusLabel")).toContainText("本地模式");
  await expect(page.locator("#cloudBaseUrlInput")).toHaveValue("http://127.0.0.1:8787/api");
  await expect(page.locator("#cloudAccountCard")).toContainText("未连接云端");
  await expect(page.locator("#cloudSaveDocBtn")).toBeDisabled();
  await expect(page.locator("#cloudCheckoutBtn")).toHaveCount(0);
  await expect(page.locator("[data-admin-only-cloud-section]")).toHaveCount(0);
  await expect(page.locator("#cloudUseAiProxyBtn")).toHaveCount(0);
  await expect(page.locator("#cloudAdminDashboardBtn")).toHaveCount(0);
  await expect(page.locator("#cloudRecentErrorsBtn")).toHaveCount(0);
  await expect(page.locator("#cloudBillingReport")).toContainText("登录云端后显示套餐");
  await expect(page.locator("#featureMapGrid")).toContainText("文档管理");
  await expect(page.locator("#featureMapGrid")).toContainText("套餐与充值");
  await page.locator(".feature-map-summary").click();
  await page.locator('[data-feature-action="draft"]').click();
  await expect(page.locator("#editorPanel")).toHaveAttribute("data-main-view", "editor");
  await expect(page.locator("#generatePanel")).toHaveClass(/active/);
  await expect(page.locator("#generatePrompt")).toBeFocused();
  await page.locator("#cloudTopBtn").click();
  await page.locator("#cloudBackToEditorBtn").click();
  await expect(page.locator("#editorPanel")).toHaveAttribute("data-main-view", "editor");
  await expect(page.locator("#contentEditor")).toBeVisible();
});

test("cloud user journey registers, verifies, syncs, recharges, and submits feedback", async ({ page }) => {
  const snapshot = createAiWorkspaceSnapshot({
    styles: [{
      id: "style-cloud",
      name: "云端通知执笔人",
      handle: "cloud-notice",
      category: "公文写作",
      description: "云端同步测试",
      enabled: true,
      summary: "# 云端通知执笔人",
      skillJson: JSON.stringify({ name: "云端通知执笔人", handle: "cloud-notice" }),
      examples: [],
      versions: [],
    }],
  });
  snapshot.cloud = {
    apiBaseUrl: "http://127.0.0.1:4173/mock-cloud",
    authenticated: false,
    user: null,
    activeOrganization: null,
    membership: null,
  };
  await seedWorkspace(page, snapshot);
  const cloudMock = await installMockCloudRoute(page);

  await page.goto("/index.html");
  await page.locator("#cloudTopBtn").click();
  await expect(page.locator("#cloudBaseUrlInput")).toHaveValue("http://127.0.0.1:4173/mock-cloud");
  await page.locator("#cloudEmailInput").fill("qa-cloud@example.com");
  await page.locator("#cloudPasswordInput").fill("Qa-cloud-2026!");
  await page.locator("#cloudNameInput").fill("云端测试员");
  await page.locator("#cloudRegisterBtn").click();

  await expect(page.locator("#cloudAccountCard")).toContainText("qa-cloud@example.com");
  await expect(page.locator("#cloudEmailTokenInput")).toHaveValue("verify-cloud-token");
  await page.locator("#cloudVerifyEmailBtn").click();
  await expect(page.locator("#cloudAccountCard")).toContainText("邮箱已验证");

  await page.locator("#cloudSaveDocBtn").click();
  await page.locator("#cloudSaveWriterBtn").click();
  await expect.poll(() => cloudMock.documents.length).toBe(1);
  await expect.poll(() => cloudMock.writers.length).toBe(1);
  cloudMock.documents.push({
    id: "cloud-doc-extra",
    title: "云端新增文档",
    type: "notice",
    content: "从另一台设备同步的正文",
    metadata: {},
    version: 1,
    created_at: "2026-07-17T00:00:00.000Z",
    updated_at: "2026-07-17T00:00:00.000Z",
  });
  await page.locator("#cloudPullDocsBtn").click();
  await expect(page.locator("#docList")).toContainText("云端新增文档");

  await page.locator("#cloudManualPackageSelect").selectOption("credits_1000");
  await page.locator("#cloudManualOrderNoteInput").fill("微信尾号 1234");
  await page.locator("#cloudManualProofInput").fill("交易单号 QA-20260717");
  await page.locator("#cloudManualOrderBtn").click();
  await expect(page.locator("#cloudBillingReport")).toContainText("待确认");
  await expect(page.locator("#cloudBillingReport")).toContainText("1000 点 AI 额度");

  await page.locator("#cloudFeedbackInput").fill("云端操作旅程测试反馈");
  await page.locator("#cloudSendFeedbackBtn").click();
  await expect(page.locator("#cloudFeedbackInput")).toHaveValue("");
  expect(cloudMock.feedbacks).toEqual(["云端操作旅程测试反馈"]);
});

test("admin workspace hash is guarded before login", async ({ page }) => {
  await page.goto("/index.html#admin");

  await expect(page.locator("#cloudPanel")).toBeVisible();
  await expect(page.locator("#cloudStatusLabel")).toContainText("本地模式");
  await expect(page.locator("#cloudAdminWorkspace")).toHaveCount(0);
});

test("standalone admin page shows login gate before cloud session", async ({ page }) => {
  await page.goto("/admin.html");

  await expect(page.locator("#adminTitle")).toContainText("管理后台");
  await expect(page.locator("#adminLoginView")).toBeVisible();
  await expect(page.locator("#adminBaseUrlInput")).toHaveValue("http://127.0.0.1:8787/api");
  await expect(page.locator("#adminMainView")).toBeHidden();
});

test("standalone admin page supports core management actions with API session", async ({ page }) => {
  const adminApiBaseKey = "mowen-admin:api-base-url";
  await page.addInitScript((storageKey) => {
    localStorage.setItem(storageKey, "http://127.0.0.1:4173/mock-api");
    window.__openedAdminUrls = [];
    window.open = (url) => {
      window.__openedAdminUrls.push(String(url));
      return null;
    };
  }, adminApiBaseKey);

  let orgName = "示例组织";
  let memberRole = "member";
  let invitation = null;
  let adminPreferences = { audit_filters: [] };
  let adminPreferenceWriteCount = 0;
  let feedbackBatchWriteCount = 0;
  let checkoutUrl = "http://127.0.0.1:4173/checkout?plan=pro";
  let apiKeys = [{ id: "key-1", provider: "openai-compatible", key_hint: "sk-…test", updated_at: "2026-05-24T00:00:00.000Z" }];
  const usageRows = [
    { id: "use-1", task_type: "draft", status: "success", total_tokens: 1200, estimated_cost: 0.03, created_at: "2026-05-23T01:00:00.000Z" },
    { id: "use-2", task_type: "skill_build", status: "failed", total_tokens: 340, estimated_cost: 0, created_at: "2026-05-24T02:00:00.000Z" },
  ];
  const auditRows = [
    { id: "aud-1", action: "organization.update", target_type: "organization", created_at: "2026-05-24T03:00:00.000Z" },
    { id: "aud-2", action: "api_key.create", target_type: "api_key", created_at: "2026-05-24T04:00:00.000Z" },
  ];
  let feedbacks = [
    { id: "fb-1", message: "需要优化导出", created_at: "2026-05-24T05:00:00.000Z", metadata: { status: "pending" } },
    { id: "fb-2", message: "希望后台更清晰", created_at: "2026-05-24T06:00:00.000Z", metadata: { status: "processing" } },
  ];
  let recentErrors = [
    { id: "err-1", level: "error", type: "api", message: "AI proxy failed", created_at: "2026-05-24T07:00:00.000Z", metadata: { triage_status: "open" } },
    { id: "err-2", level: "warn", type: "email", message: "Email bounced", created_at: "2026-05-24T08:00:00.000Z", metadata: { triage_status: "open", sla_at: "2026-05-27" } },
  ];
  let manualOrders = [
    { id: "mop-1", user_id: "usr-1", title: "1000 点 AI 额度", package_id: "credits_1000", amount_cny: 50, credits: 1000, plan: "", duration_days: 0, payment_channel: "wechat", payer_note: "微信尾号 1234", proof_text: "交易单号 202605240001", status: "pending", created_at: "2026-05-24T09:00:00.000Z" },
  ];
  let creditLedger = [];

  await page.route("**/mock-api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/mock-api", "") || "/";
    const method = request.method();
    let body = {};
    try {
      body = request.postDataJSON();
    } catch {
      body = {};
    }
    const json = (status, payload) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });

    if (path === "/me" && method === "GET") {
      return json(200, {
        authenticated: true,
        user: { id: "usr-1", email: "owner@example.com" },
        organizations: [{ id: "org-1", name: orgName, plan: "free" }],
        organization: { id: "org-1", name: orgName, plan: "free" },
        membership: { id: "mem-1", role: "owner", organization_id: "org-1", user_id: "usr-1" },
      });
    }

    if (path === "/admin/dashboard" && method === "GET") {
      return json(200, {
        organization: { id: "org-1", name: orgName, plan: "free" },
        members: [
          { id: "mem-1", role: "owner", user_id: "usr-1", created_at: "2026-05-24T00:00:00.000Z", user: { email: "owner@example.com" } },
          { id: "mem-2", role: memberRole, user_id: "usr-2", created_at: "2026-05-24T00:00:00.000Z", user: { email: "member@example.com" } },
        ],
        invitations: invitation ? [invitation] : [],
        usage: { request_count: 4, failed_count: 1, estimated_cost: 0.03 },
        limits: { user_daily: 100, org_daily: 500, plan: "free" },
        budget: { today_cost: 0.03, month_cost: 0.03, daily_budget_cny: 1, monthly_budget_cny: 10 },
        feedbacks,
        recent_errors: recentErrors,
        email_deliveries: [],
        billing: { payment_webhooks: [], manual_orders: manualOrders, credits: { total_balance: 0, account_count: 0 }, credit_ledger: creditLedger },
      });
    }

    if (path === "/usage/history" && method === "GET") return json(200, { usage: usageRows });
    if (path === "/audit" && method === "GET") return json(200, { audit_logs: auditRows });
    if (path === "/billing/summary" && method === "GET") {
      return json(200, {
        organization: { id: "org-1", name: orgName, plan: "free" },
        limits: { user_daily: 100, org_daily: 500 },
        usage: { request_count: 4, failed_count: 1, estimated_cost: 0.03 },
        budget: { today_cost: 0.03, month_cost: 0.03, daily_budget_cny: 1, monthly_budget_cny: 10 },
        payment_webhooks: [],
        manual_orders: manualOrders,
        credit_ledger: creditLedger,
        credits: { balance: 0 },
        manual_payment: { packages: [{ id: "credits_1000", title: "1000 点 AI 额度", amount_cny: 50, credits: 1000 }], methods: [] },
        checkout: { enabled: true, available_plans: [{ plan: "pro", price_id: "price_pro" }] },
      });
    }
    if (path === "/api-keys" && method === "GET") return json(200, { api_keys: apiKeys });
    if (path === "/admin/preferences" && method === "GET") return json(200, { preferences: adminPreferences });
    if (path === "/admin/preferences" && method === "PUT") {
      adminPreferenceWriteCount += 1;
      adminPreferences = body.preferences || body || {};
      return json(200, { preferences: adminPreferences });
    }
    if (path === "/admin/preferences" && method === "DELETE") {
      adminPreferences = { audit_filters: [] };
      return json(200, { preferences: adminPreferences });
    }
    if (path === "/api-keys" && method === "POST") {
      apiKeys = [{ id: "key-2", provider: body.provider, key_hint: "sk-…live", updated_at: "2026-05-24T00:00:00.000Z" }];
      return json(201, { api_key: apiKeys[0] });
    }
    if (path === "/api-keys/key-2" && method === "DELETE") {
      apiKeys = [];
      return json(200, { api_key: { id: "key-2", disabled_at: "2026-05-24T00:00:00.000Z" } });
    }
    if (path === "/orgs/org-1" && method === "PUT") {
      orgName = body.name;
      return json(200, { organization: { id: "org-1", name: orgName, plan: "free" } });
    }
    if (path === "/orgs/org-1/invitations" && method === "POST") {
      invitation = { id: "inv-1", email: body.email, role: body.role, token: "invite-token", expires_at: "2026-06-01T00:00:00.000Z" };
      return json(201, { invitation });
    }
    if (path === "/orgs/org-1/members/mem-2" && method === "PUT") {
      memberRole = body.role;
      return json(200, { membership: { id: "mem-2", role: memberRole } });
    }
    if (path === "/billing/checkout" && method === "POST") {
      return json(201, { checkout: { plan: body.plan, price_id: body.price_id, checkout_url: checkoutUrl } });
    }
    if (path === "/billing/manual-orders/mop-1/review" && method === "POST") {
      manualOrders = manualOrders.map((item) =>
        item.id === "mop-1" ? { ...item, status: body.action === "reject" ? "rejected" : "approved", reviewed_at: "2026-05-24T10:00:00.000Z", review_note: body.review_note || "" } : item);
      if (body.action !== "reject") {
        creditLedger = [{ id: "led-1", user_id: "usr-1", user_email: "owner@example.com", order_id: "mop-1", direction: "in", amount: 1000, balance_after: 1000, reason: "manual_payment_approved", order_title: "1000 点 AI 额度", created_at: "2026-05-24T10:00:00.000Z" }];
      }
      return json(200, { order: manualOrders[0], credits: { balance: 1000 } });
    }
    if (path.startsWith("/feedback/") && path.endsWith("/status") && method === "POST") {
      const feedbackId = path.split("/")[2];
      feedbacks = feedbacks.map((item) =>
        item.id === feedbackId ? { ...item, metadata: { ...(item.metadata || {}), status: body.status, assignee: body.assignee || item.metadata.assignee || "", sla_at: body.sla_at || item.metadata.sla_at || "", note: body.note || item.metadata.note || "" } } : item);
      return json(200, { feedback: feedbacks.find((item) => item.id === feedbackId) });
    }
    if (path === "/feedback/batch-status" && method === "POST") {
      feedbackBatchWriteCount += 1;
      const ids = new Set(body.feedback_ids || body.feedbackIds || body.ids || []);
      feedbacks = feedbacks.map((item) =>
        ids.has(item.id) ? { ...item, metadata: { ...(item.metadata || {}), status: body.status || "processing" } } : item);
      return json(200, { count: ids.size, feedbacks: feedbacks.filter((item) => ids.has(item.id)) });
    }
    if (path.startsWith("/ops/events/") && path.endsWith("/triage") && method === "POST") {
      const errorId = path.split("/")[3];
      recentErrors = recentErrors.map((item) =>
        item.id === errorId ? { ...item, metadata: { ...(item.metadata || {}), triage_status: body.status || "open", priority: body.priority || "normal", assignee: body.assignee || "", sla_at: body.sla_at || "", note: body.note || "" } } : item);
      return json(200, { event: recentErrors.find((item) => item.id === errorId) });
    }

    return json(404, { error: { message: `missing route ${method} ${path}` } });
  });

  await page.goto("/admin.html");

  await expect(page.locator("#adminMainView")).toBeVisible();
  await expect(page.locator("#adminSummary")).toContainText("接口配置");

  await page.locator('[data-admin-form="org-name"] input[name="name"]').fill("正式运营组织");
  await page.locator('[data-admin-form="org-name"] button[type="submit"]').click();
  await expect(page.locator("#adminSubtitle")).toContainText("正式运营组织");

  await page.locator('[data-admin-view="members"]').click();
  await page.locator('[data-admin-form="invite-member"] input[name="email"]').fill("new-member@example.com");
  await page.locator('[data-admin-form="invite-member"] button[type="submit"]').click();
  await expect(page.locator("#adminContent")).toContainText("new-member@example.com");
  await expect(page.locator('[data-admin-action="invite-copy"]')).toBeEnabled();
  await page.locator('[data-member-role="mem-2"]').selectOption("admin");
  await page.locator('[data-admin-action="member-role"][data-member-id="mem-2"]').click();
  await expect(page.locator("#adminContent")).toContainText("管理员");

  await page.locator('[data-admin-view="keys"]').click();
  await page.locator('[data-admin-form="api-key"] input[name="provider"]').fill("deepseek");
  await page.locator('[data-admin-form="api-key"] input[name="apiKey"]').fill("sk-live-value");
  await page.locator('[data-admin-form="api-key"] button[type="submit"]').click();
  await expect(page.locator("#adminContent")).toContainText("deepseek");
  await page.locator('[data-admin-action="key-delete"]').click();
  await expect(page.locator("#adminConfirmModal")).toBeVisible();
  await page.locator("#adminConfirmModal [data-admin-confirm-ok]").click();
  await expect(page.locator("#adminContent")).toContainText("暂无接口配置");

  await page.locator('[data-admin-view="usage"]').click();
  await expect(page.locator("#adminContent")).toContainText("总 tokens");
  await expect(page.locator("#adminContent")).toContainText("估算成本");
  await expect(page.locator("#adminContent")).toContainText("今日成本");
  await expect(page.locator("#adminContent")).toContainText("任务成本估算");
  await expect(page.locator(".admin-trend-bar")).toHaveCount(2);
  await expect(page.locator("#adminContent")).toContainText("skill_build");
  await page.locator('[data-admin-action="copy-usage"]').first().click();

  await page.locator('[data-admin-view="audit"]').click();
  await expect(page.locator("#adminContent")).toContainText("动作分布");
  await expect(page.locator("#adminContent")).toContainText("organization.update");
  await page.locator('[data-admin-form="audit-filter"] input[name="filterName"]').fill("接口变更");
  await page.locator('[data-admin-form="audit-filter"] button[type="submit"]').click();
  await expect(page.locator(".admin-filter-pill")).toContainText("接口变更");
  await expect.poll(() => adminPreferenceWriteCount).toBeGreaterThan(0);
  await page.locator('[data-admin-action="audit-filter-apply"]').first().click();
  await page.locator('[data-admin-action="copy-audit"]').first().click();

  await page.locator('[data-admin-view="feedback"]').click();
  await expect(page.locator("#adminContent")).toContainText("反馈处理");
  const firstFeedbackForm = page.locator('[data-admin-form="feedback-triage"]').first();
  await firstFeedbackForm.locator('input[name="assignee"]').fill("运营同学");
  await firstFeedbackForm.locator('input[name="sla_at"]').fill("2026-05-30");
  await firstFeedbackForm.locator('input[name="note"]').fill("已排期跟进");
  await firstFeedbackForm.locator('button[type="submit"]').click();
  await expect(page.locator("#adminContent")).toContainText("运营同学");
  await page.locator('[data-admin-action="feedback-batch"][data-status="resolved"]').click();
  await expect(page.locator("#adminConfirmModal")).toBeVisible();
  await page.locator("#adminConfirmModal [data-admin-confirm-ok]").click();
  await expect(page.locator("#adminContent")).toContainText("已解决");
  expect(feedbackBatchWriteCount).toBe(1);

  await page.locator('[data-admin-view="errors"]').click();
  await expect(page.locator("#adminContent")).toContainText("错误事件");
  await page.locator("[data-admin-error-level]").selectOption("warn");
  await expect(page.locator("#adminContent")).toContainText("Email bounced");
  await expect(page.locator("#adminContent")).not.toContainText("AI proxy failed");
  const errorForm = page.locator('[data-admin-form="error-triage"]').first();
  await errorForm.locator('select[name="status"]').selectOption("processing");
  await errorForm.locator('select[name="priority"]').selectOption("high");
  await errorForm.locator('input[name="assignee"]').fill("技术负责人");
  await errorForm.locator('input[name="sla_at"]').fill("2026-05-31");
  await errorForm.locator('input[name="note"]').fill("检查邮件服务商回调");
  await errorForm.locator('button[type="submit"]').click();
  await expect(page.locator("#adminContent")).toContainText("技术负责人");
  await page.locator('[data-admin-action="copy-visible-errors"]').click();

  await page.locator('[data-admin-view="billing"]').click();
  await expect(page.locator("#adminContent")).toContainText("人工确认充值");
  await page.locator('[data-admin-action="manual-order-approve"]').click();
  await expect(page.locator("#adminConfirmModal")).toBeVisible();
  await page.locator("#adminConfirmModal [data-admin-confirm-ok]").click();
  await expect(page.locator("#adminContent")).toContainText("已确认");
  await expect(page.locator("#adminContent")).toContainText("额度明细");
  await page.locator('[data-admin-action="billing-checkout"]').click();
  await expect.poll(() => page.evaluate(() => window.__openedAdminUrls.at(-1))).toContain("plan=pro");
  checkoutUrl = "javascript:alert(1)";
  const openedCheckoutCount = await page.evaluate(() => window.__openedAdminUrls.length);
  await page.locator('[data-admin-action="billing-checkout"]').click();
  await expect.poll(() => page.evaluate(() => window.__openedAdminUrls.length)).toBe(openedCheckoutCount);
});

test("routes style panel drops into the current skill examples", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator('[data-tab="style"]').click();
  await page.locator("#newStyleBtn").click();
  await expect(page.locator("#skillBuilderModal")).toBeVisible();
  expect(await page.locator("#skillSourceDocSelect option").count()).toBeGreaterThan(0);
  await page.locator("#skillSourceDocSelect option").first().evaluate((option) => {
    option.selected = true;
    option.parentElement.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.locator("#addSourceDocsToSkillBtn").click();
  await expect(page.locator("#styleExampleList .example-item")).toHaveCount(1);

  await dropTextFile(page, "#styleDropZone", "style-example.txt", "示范正文");

  await expect(page.locator("#styleExampleList")).toContainText("style-example.txt");
  await expect(page.locator("#styleExampleList")).toContainText("示范正文");
});

async function dropTextFile(page, selector, name, text) {
  const dataTransfer = await page.evaluateHandle(
    ({ fileName, fileText }) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([fileText], fileName, { type: "text/plain" }));
      return transfer;
    },
    { fileName: name, fileText: text },
  );
  await page.dispatchEvent(selector, "dragover", { dataTransfer });
  await page.dispatchEvent(selector, "drop", { dataTransfer });
  await dataTransfer.dispose();
}

function createAiWorkspaceSnapshot(overrides = {}) {
  return {
    selectedFolderId: "all",
    selectedDocId: overrides.docs?.[0]?.id || "doc-a",
    folders: [{ id: "folder-1", name: "工作文档", kind: "tag", color: "#0f766e" }],
    docs: overrides.docs || [{
      id: "doc-a",
      title: "工作素材",
      type: "notice",
      folderId: "folder-1",
      content: "这是用于测试的工作素材。",
    }],
    styles: overrides.styles || [],
    settings: {
      provider: "openai-compatible",
      baseUrl: "http://127.0.0.1:4173/mock-ai",
      endpointPath: "/chat/completions",
      model: "deterministic-test-model",
    },
  };
}

async function seedWorkspace(page, state) {
  await page.addInitScript(
    ({ bootstrapKey, storageKey, snapshot }) => {
      localStorage.setItem(storageKey, JSON.stringify(snapshot));
      localStorage.setItem(bootstrapKey, JSON.stringify({ storage: "localStorage" }));
      Object.defineProperty(window, "indexedDB", { configurable: true, value: undefined });
    },
    { bootstrapKey: STORAGE_BOOTSTRAP_KEY, storageKey: STORAGE_KEY, snapshot: state },
  );
}

async function installDeterministicAiRoute(page, options = {}) {
  const requests = [];
  await page.route("**/mock-ai/chat/completions", async (route) => {
    const body = route.request().postDataJSON();
    const prompt = (body.messages || []).map((message) => message.content || "").join("\n");
    requests.push({ prompt, taskType: body.task_type || "chat" });
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));

    let content;
    if (prompt.includes("单篇文档分析器")) {
      content = JSON.stringify({
        document_type: "通知",
        scenario: "校内工作安排",
        title_format: "关于事项的通知",
        body_structure: ["背景", "分条安排", "执行要求"],
        tone_style: ["正式", "清晰"],
        candidate_rules: [{
          category: "structure",
          rule: "正文使用分条表达",
          support_count: 1,
          confidence: "medium",
        }],
        case_specific_items: [],
        privacy_or_sensitive_items: [],
        forbidden_to_reuse: [],
      });
    } else if (prompt.includes("多篇聚合器")) {
      content = JSON.stringify({
        document_count: 2,
        overall_confidence: "medium",
        mixed_sample_warning: false,
        detected_document_types: ["通知"],
        detected_scenarios: ["校内工作安排"],
        aggregation_policy: "按同类样本提炼稳定结构、文风和格式规则",
        common_structure: ["标题、正文安排、执行要求"],
        common_style: ["正式清晰"],
        common_format: ["分条表达"],
        strong_rules: [{
          category: "structure",
          rule: "正文使用分条表达",
          support_count: 2,
          support_doc_ids: ["doc-a", "doc-b"],
          scope: "document_type",
          confidence: "medium",
        }],
        candidate_rules: [],
        conflicts: [],
        case_specific_exclusions: [],
        privacy_findings: [],
      });
    } else if (prompt.includes("执笔人草案生成器")) {
      content = JSON.stringify({
        markdown: "# 学校通知执笔人\n\n用于生成校内正式通知。",
        skill_json: {
          name: "学校通知执笔人",
          handle: "学校通知执笔人",
          category: "公文写作",
          description: "按分条结构起草清晰、可执行的学校通知。",
          confidence: "medium",
          style_rules: { must: ["正文使用分条表达"], recommended: ["语气正式清晰"], optional: [] },
          rule_evidence: {
            "正文使用分条表达": {
              support_count: 2,
              support_doc_ids: ["doc-a", "doc-b"],
              scope: "document_type",
              confidence: "medium",
            },
          },
          input_contract: {
            required_fields: ["事项", "对象"],
            optional_fields: ["时间", "地点"],
            missing_fact_policy: "事实缺失时使用【可替换占位符】",
          },
          forbidden: ["不得编造事实"],
          privacy_filters: [],
          case_specific_exclusions: [],
        },
        quality_report: { confidence: "medium", strong_rule_count: 1, candidate_rule_count: 0 },
        example_input: { 事项: "值班安排" },
      });
    } else if (prompt.includes("生成测试与规则命中检查器")) {
      content = JSON.stringify({
        test_cases: [
          { case_id: "normal_test", passed: true, score: 96, issues: [], test_document_markdown: "# 测试通知\n\n一、工作安排" },
          { case_id: "missing_fact_test", passed: true, score: 95, issues: [], test_document_markdown: "时间：【可替换占位符】" },
          { case_id: "leakage_test", passed: true, score: 98, issues: [], test_document_markdown: "未复用样本个案" },
        ],
        overall_result: {
          passed: true,
          score: 96,
          must_rule_miss_count: 0,
          privacy_leak_count: 0,
          case_specific_leak_count: 0,
          fabrication_risk_count: 0,
          save_allowed: true,
        },
      });
    } else if (prompt.includes("归藏 PPT 执笔人")) {
      content = JSON.stringify({
        title: "年度工作复盘",
        style: "officialBlue",
        slides: [
          { type: "cover", title: "年度工作复盘", body: "重点工作与下一步计划", notes: "开场说明" },
          { type: "data", title: "关键成果", bullets: ["重点任务完成率 92%", "材料按期交付"], notes: "说明数据口径" },
          { type: "roadmap", title: "下一步计划", bullets: ["完善流程", "按月复盘"], notes: "明确责任分工" },
        ],
      });
    } else if (prompt.includes("覆盖为一份校内值班通知")) {
      content = "校内值班通知\n\n请相关人员按值班安排到岗，具体时间为【可替换占位符】。";
    } else if (prompt.includes("插入一条补充提醒")) {
      content = "补充提醒\n\n请提前确认联系方式。";
    } else {
      content = "校内培训通知\n\n请各部门按要求组织参训，时间和地点为【可替换占位符】。";
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ choices: [{ message: { content } }] }),
    });
  });
  return requests;
}

async function installMockCloudRoute(page) {
  const state = {
    authenticated: false,
    verified: false,
    documents: [],
    writers: [],
    orders: [],
    feedbacks: [],
  };
  const user = { id: "user-cloud", email: "qa-cloud@example.com", name: "云端测试员", email_verified_at: null };
  const organization = { id: "org-cloud", name: "云端测试员工作区", plan: "free" };
  const membership = { id: "member-cloud", role: "owner", organization_id: organization.id, user_id: user.id };
  const manualPayment = {
    packages: [
      { id: "pro_monthly", title: "Pro 月度会员", amount_cny: 29, plan: "pro", duration_days: 30 },
      { id: "credits_1000", title: "1000 点 AI 额度", amount_cny: 50, credits: 1000 },
    ],
    methods: [{ id: "wechat", label: "微信", qr_url: "", receiver: "测试收款方" }],
  };

  await page.route("**/mock-cloud/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/mock-cloud", "") || "/";
    const method = request.method();
    let body = {};
    try {
      body = request.postDataJSON();
    } catch {
      body = {};
    }
    const json = (status, payload) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
    const sessionPayload = () => ({
      authenticated: state.authenticated,
      user: { ...user, email_verified_at: state.verified ? "2026-07-17T00:00:00.000Z" : null },
      organization,
      organizations: [organization],
      membership,
    });

    if (path === "/me" && method === "GET") {
      return json(200, state.authenticated ? sessionPayload() : { authenticated: false });
    }
    if (path === "/auth/register" && method === "POST") {
      state.authenticated = true;
      return json(201, { ...sessionPayload(), email_verification_token: "verify-cloud-token" });
    }
    if (path === "/auth/verify-email" && method === "POST") {
      state.verified = body.token === "verify-cloud-token";
      return json(200, { user: sessionPayload().user });
    }
    if (path === "/usage/current" && method === "GET") {
      return json(200, {
        usage: { request_count: 2, failed_count: 0, total_tokens: 900, estimated_cost: 0.02, by_task_type: { draft: 2 } },
        limits: { user_daily: 100, org_daily: 500, plan: "free" },
      });
    }
    if (path === "/billing/summary" && method === "GET") {
      return json(200, {
        organization,
        limits: { user_daily: 100, org_daily: 500 },
        usage: { request_count: 2, failed_count: 0, estimated_cost: 0.02 },
        manual_payment: manualPayment,
        manual_orders: state.orders,
        credits: { balance: 0 },
        credit_ledger: [],
        checkout: { enabled: false, available_plans: [] },
      });
    }
    if (path === "/documents" && method === "POST") {
      const document = {
        id: `cloud-doc-${state.documents.length + 1}`,
        ...body,
        metadata: body.metadata || {},
        version: 1,
        created_at: "2026-07-17T00:00:00.000Z",
        updated_at: "2026-07-17T00:00:00.000Z",
      };
      state.documents.push(document);
      return json(201, { document });
    }
    if (path === "/documents" && method === "GET") return json(200, { documents: state.documents });
    if (path === "/writers" && method === "POST") {
      const writer = {
        id: `cloud-writer-${state.writers.length + 1}`,
        ...body,
        version: 1,
        created_at: "2026-07-17T00:00:00.000Z",
        updated_at: "2026-07-17T00:00:00.000Z",
      };
      state.writers.push(writer);
      return json(201, { writer });
    }
    if (path === "/writers" && method === "GET") return json(200, { writers: state.writers });
    if (path === "/billing/manual-orders" && method === "POST") {
      const order = {
        id: `manual-${state.orders.length + 1}`,
        title: "1000 点 AI 额度",
        package_id: body.package_id,
        amount_cny: 50,
        credits: 1000,
        payment_channel: body.payment_channel,
        status: "pending",
        created_at: "2026-07-17T00:00:00.000Z",
      };
      state.orders.push(order);
      return json(201, { order });
    }
    if (path === "/feedback" && method === "POST") {
      state.feedbacks.push(body.message);
      return json(201, { feedback: { id: `feedback-${state.feedbacks.length}`, message: body.message } });
    }
    return json(404, { error: { message: `missing route ${method} ${path}` } });
  });
  return state;
}

async function createOfficeDocxFixture() {
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
    <w:p><w:r><w:t>工作任务表</w:t></w:r></w:p>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>部门</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>任务</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>综合部</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>准备材料</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
  </w:body>
</w:document>`,
  );
  return zip.generateAsync({ type: "uint8array" });
}

async function createOfficePptxFixture() {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`,
  );
  zip.folder("ppt").folder("slides").file(
    "slide1.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>季度工作复盘</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`,
  );
  return zip.generateAsync({ type: "uint8array" });
}

test("references and the writer form are sent as facts with the drafting prompt", async ({ page }) => {
  const snapshot = createAiWorkspaceSnapshot({
    docs: [
      { id: "doc-a", title: "培训会议纪要", type: "minutes", folderId: "folder-1", content: "周三下午三点在三楼会议室开展专项培训。" },
      { id: "doc-b", title: "上级通知", type: "notice", folderId: "folder-1", content: "各单位须于月底前完成全员培训。" },
    ],
    styles: [{
      id: "style-form",
      name: "培训通知",
      handle: "培训通知",
      category: "公文写作",
      description: "起草培训类通知",
      enabled: true,
      status: "ready",
      skillJson: JSON.stringify({
        name: "培训通知",
        handle: "培训通知",
        input_contract: { required_fields: ["主题", "对象"], optional_fields: ["语气"] },
      }),
      examples: [],
      versions: [],
    }],
  });
  await seedWorkspace(page, snapshot);
  const requests = await installDeterministicAiRoute(page);

  await page.goto("/index.html");
  await page.locator('[data-tab="generate"]').click();
  await page.locator("#generatePrompt").fill("@培训通知 起草一份培训通知");

  await expect(page.locator("#skillInputForm")).toBeVisible();
  await expect(page.locator("#skillInputFields [data-skill-input]")).toHaveCount(3);
  await expect(page.locator("#skillInputStatus")).toHaveText("必填 0/2");

  await page.locator("#addCurrentReferenceBtn").click();
  await page.locator("#pickReferenceBtn").click();
  await page.locator('[data-reference-option="doc-b"]').check();
  await expect(page.locator("#referenceList .reference-chip")).toHaveCount(2);
  await expect(page.locator("#referenceSummary")).toHaveText("2 份");

  await page.locator("#generateDocBtn").click();
  await expect(page.locator("#skillInputWarning")).toBeVisible();
  await expect(page.locator("#skillInputWarning")).toContainText("主题、对象");
  await expect(page.locator('[data-skill-input="主题"]')).toBeFocused();
  expect(requests.filter((item) => item.taskType === "document_generation")).toHaveLength(0);

  await page.locator('[data-skill-input="主题"]').fill("专项业务培训");
  await expect(page.locator("#skillInputStatus")).toHaveText("必填 1/2");
  await page.locator("#generateDocBtn").click();
  await expect(page.locator("#skillInputWarning")).toContainText("对象");
  await page.locator("#generateDocBtn").click();

  await expect(page.locator("#titleInput")).toHaveValue("校内培训通知");
  const draftRequests = requests.filter((item) => item.taskType === "document_generation");
  expect(draftRequests).toHaveLength(1);
  expect(draftRequests[0].prompt).toContain("- 主题：专项业务培训");
  expect(draftRequests[0].prompt).toContain("- 对象：【未填写】");
  expect(draftRequests[0].prompt).toContain("【资料 1】培训会议纪要");
  expect(draftRequests[0].prompt).toContain("周三下午三点在三楼会议室开展专项培训。");
  expect(draftRequests[0].prompt).toContain("【资料 2】上级通知");
  await expect(page.locator("#toastRegion")).toContainText("还有 1 处待填内容");
});

test("placeholder checklist locates and fills pending content", async ({ page }) => {
  await seedWorkspace(page, createAiWorkspaceSnapshot({
    docs: [{
      id: "doc-a",
      title: "培训通知",
      type: "notice",
      folderId: "folder-1",
      content: "请于【培训时间】到【培训地点】报到。\n培训时间：【培训时间】。",
    }],
  }));

  await page.goto("/index.html");
  await expect(page.locator("#placeholderToggleBtn")).toBeVisible();
  await expect(page.locator("#placeholderCount")).toHaveText("3");

  await page.locator("#contentEditor").evaluate((editor) => {
    editor.focus();
    editor.setSelectionRange(0, 0);
  });
  await page.locator("#contentEditor").press("F8");
  expect(await page.locator("#contentEditor").evaluate((editor) => editor.value.slice(editor.selectionStart, editor.selectionEnd))).toBe("【培训时间】");
  await page.locator("#contentEditor").press("F8");
  expect(await page.locator("#contentEditor").evaluate((editor) => editor.value.slice(editor.selectionStart, editor.selectionEnd))).toBe("【培训地点】");

  await page.locator("#placeholderToggleBtn").click();
  await expect(page.locator("#placeholderPanel")).toBeVisible();
  await expect(page.locator("#placeholderSummary")).toHaveText("3 处 · 2 项");
  const timeRow = page.locator('[data-placeholder-token="【培训时间】"]');
  await timeRow.locator("input").fill("5 月 20 日上午 9:00");
  await timeRow.locator("input").press("Enter");

  await expect(page.locator("#contentEditor")).toHaveValue("请于5 月 20 日上午 9:00到【培训地点】报到。\n培训时间：5 月 20 日上午 9:00。");
  await expect(page.locator("#placeholderCount")).toHaveText("1");
  await page.locator("#undoEditBtn").click();
  await expect(page.locator("#contentEditor")).toHaveValue(/【培训时间】/);
});

test("export reminds about pending placeholders and supports the GB/T 9704 layout", async ({ page }) => {
  await seedWorkspace(page, createAiWorkspaceSnapshot({
    docs: [{
      id: "doc-a",
      title: "关于开展专项培训的通知",
      type: "notice",
      folderId: "folder-1",
      content: "各部门：\n\n一、培训安排\n请于【培训时间】报到。\n\n综合办公室\n2026年5月14日",
    }],
  }));

  await page.goto("/index.html");
  let dialogMessage = "";
  page.once("dialog", async (dialog) => {
    dialogMessage = dialog.message();
    await dialog.dismiss();
  });
  await page.locator("#exportDocBtn").click();
  await expect.poll(() => dialogMessage).toContain("还有 1 处待填内容");
  await expect(page.locator("#toastRegion")).toContainText("已取消导出");

  await page.locator("#exportFormatBtn").click();
  await expect(page.locator("#exportFormatMenu")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  const downloadPromise = page.waitForEvent("download");
  await page.locator('[data-export-layout="gongwen"]').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("关于开展专项培训的通知.docx");
  await expect(page.locator("#exportFormatMenu")).toBeHidden();
  await expect(page.locator("#exportDocBtn")).toHaveAttribute("data-export-layout", "gongwen");

  const zip = await JSZip.loadAsync(await readDownload(download));
  const documentXml = await zip.file("word/document.xml").async("string");
  expect(documentXml).toContain('w:eastAsia="方正小标宋简体"');
  expect(documentXml).toContain('w:eastAsia="黑体"');
  expect(documentXml).toContain('w:linePitch="579"');
  expect(zip.file("word/footer2.xml")).toBeTruthy();
});

async function readDownload(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

for (const mode of ["overwrite", "insert"]) {
  test(`${mode} protects against cross-document writes while generation is pending`, async ({ page }) => {
    await seedWorkspace(page, createAiWorkspaceSnapshot({
      docs: [
        { id: "doc-a", title: "通知 A", type: "notice", folderId: "folder-1", content: "文档 A 原文。" },
        { id: "doc-b", title: "通知 B", type: "notice", folderId: "folder-1", content: "文档 B 原文。" },
      ],
    }));
    let release;
    const responseReady = new Promise((resolve) => { release = resolve; });
    await page.route("**/mock-ai/chat/completions", async (route) => {
      await responseReady;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ choices: [{ message: { content: "通知 A 新稿\n\n为 A 生成的内容。" } }] }),
      });
    });
    await page.goto("/index.html");
    await page.locator('[data-tab="generate"]').click();
    await page.locator("#generatePrompt").fill("为文档 A 生成通知");
    const requested = page.waitForRequest("**/mock-ai/chat/completions");
    await page.locator(mode === "overwrite" ? "#overwriteDraftBtn" : "#insertDraftBtn").click();
    await requested;
    try {
      await page.locator('[data-doc-id="doc-b"]').click();
    } finally {
      release();
    }

    await expect(page.locator("#toastRegion")).toContainText("本次生成结果未写入");
    await expect(page.locator("#titleInput")).toHaveValue("通知 B");
    await expect(page.locator("#contentEditor")).toHaveValue("文档 B 原文。");
    await page.locator('[data-doc-id="doc-a"]').click();
    await expect(page.locator("#contentEditor")).toHaveValue("文档 A 原文。");
  });
}

test("placeholder checklist clears cross-document drafts even when closed", async ({ page }) => {
  await seedWorkspace(page, createAiWorkspaceSnapshot({
    docs: [
      { id: "doc-a", title: "通知 A", type: "notice", folderId: "folder-1", content: "A 的时间：【时间】。" },
      { id: "doc-b", title: "通知 B", type: "notice", folderId: "folder-1", content: "B 的时间：【时间】。" },
    ],
  }));
  await page.goto("/index.html");
  await page.locator("#placeholderToggleBtn").click();
  const input = page.locator("#placeholderList input");
  await input.fill("A 的日期");
  await page.locator("#saveDocBtn").click();
  await expect(input).toHaveValue("A 的日期");

  await page.locator('[data-doc-id="doc-b"]').click();
  await expect(input).toHaveValue("");
  await input.fill("B 的日期");
  await page.locator("#placeholderCloseBtn").click();
  await page.locator('[data-doc-id="doc-a"]').click();
  await page.locator("#placeholderToggleBtn").click();
  await expect(input).toHaveValue("");
  await input.fill("A 的新日期");
  await input.press("Enter");
  await expect(page.locator("#contentEditor")).toHaveValue("A 的时间：A 的新日期。");
  await page.locator('[data-doc-id="doc-b"]').click();
  await expect(page.locator("#contentEditor")).toHaveValue("B 的时间：【时间】。");
});

test("an empty required field before a newline still blocks the first generation attempt", async ({ page }) => {
  await seedWorkspace(page, createAiWorkspaceSnapshot({
    styles: [{
      id: "style-required", name: "培训通知", handle: "培训通知", enabled: true, status: "ready",
      examples: [], versions: [],
      skillJson: JSON.stringify({
        name: "培训通知", handle: "培训通知",
        input_contract: { required_fields: ["时间", "地点"] },
      }),
    }],
  }));
  const requests = await installDeterministicAiRoute(page);
  await page.goto("/index.html");
  await page.locator('[data-tab="generate"]').click();
  await page.locator("#generatePrompt").fill("@培训通知\n时间：\n地点：三楼会议室");
  await expect(page.locator("#skillInputStatus")).toHaveText("必填 1/2");
  await page.locator("#generateDocBtn").click();
  await expect(page.locator("#skillInputWarning")).toContainText("时间");
  await expect(page.locator('[data-skill-input="时间"]')).toBeFocused();
  expect(requests).toHaveLength(0);
});
