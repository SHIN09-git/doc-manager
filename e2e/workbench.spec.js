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

test("keeps the clicked document first without reordering other documents", async ({ page }) => {
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

  await expect(page.locator(".doc-item").nth(0)).toContainText("C 文档");
  await expect(page.locator(".doc-item").nth(1)).toContainText("A 文档");
  await expect(page.locator(".doc-item").nth(2)).toContainText("B 文档");
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
  await page.locator("#closePptPreviewBtn").click();
  await expect(page.locator("#pptPreviewOverlay")).toBeHidden();
});

test("routes style panel drops into the current skill examples", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator('[data-tab="style"]').click();

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
