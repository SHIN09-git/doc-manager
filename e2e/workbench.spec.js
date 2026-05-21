import { expect, test } from "@playwright/test";

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

test("exports the current document as Word by default", async ({ page }) => {
  await page.goto("/index.html");

  await dropTextFile(page, "#docDropZone", "word-export.txt", "**word-export**\n\n导出正文");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#exportDocBtn").click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/word-export\.docx$/);
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

test("drags a document card into the AI generation prompt", async ({ page }) => {
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

  await expect(page.locator("#generatePrompt")).toHaveValue(/引用文档：drag-source/);
  await expect(page.locator("#generatePrompt")).toHaveValue(/这是一段可用于起草的正文素材/);
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

test("workspace columns can be resized from the editor handles", async ({ page }) => {
  await page.goto("/index.html");

  const before = await page.evaluate(() => Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue("--inspector-w"), 10));
  await page.locator("#rightWorkspaceResizer").focus();
  await page.keyboard.press("ArrowRight");
  const after = await page.evaluate(() => Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue("--inspector-w"), 10));

  expect(after).toBeLessThan(before);
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
