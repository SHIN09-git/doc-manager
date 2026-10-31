import { test, expect } from "@playwright/test";

test("keyed lists preserve unchanged nodes, menus and focus across reorder and filtering", async ({ page }) => {
  await page.goto("/index.html");
  const result = await page.evaluate(async () => {
    const { renderKeyedList } = await import("/src/ui/keyedList.js");
    const list = document.createElement("div");
    document.body.append(list);
    const rows = [{ id: 'one"[]', title: "One" }, { id: "two", title: "Two" }];
    const render = (row) => `<article><button>${row.title}</button><details><summary>More</summary></details></article>`;
    const initial = renderKeyedList(list, rows, render);
    const [first, second] = list.children;
    first.querySelector("details").open = true;
    first.querySelector("button").focus();
    const unchanged = renderKeyedList(list, rows, render);
    const keptFocus = document.activeElement === first.querySelector("button");
    renderKeyedList(list, [...rows].reverse(), render);
    const reordered = list.children[0] === second && list.children[1] === first;
    rows[1].title = "Edited";
    const updated = renderKeyedList(list, [...rows].reverse(), render);
    const keptOther = list.children[1] === first && first.querySelector("details").open;
    renderKeyedList(list, [rows[0]], render);
    const filtered = list.children.length === 1 && list.firstChild === first;
    renderKeyedList(list, [], render);
    const empty = list.children.length === 0;
    const restored = renderKeyedList(list, rows, render).length;
    list.remove();
    return { initial: initial.length, unchanged: unchanged.length, updated: updated.length, keptFocus, reordered, keptOther, filtered, empty, restored };
  });
  expect(result).toEqual({ initial: 2, unchanged: 0, updated: 1, keptFocus: true, reordered: true, keptOther: true, filtered: true, empty: true, restored: 2 });
});

test("document edits keep other rows intact and leave the closed trash unrendered", async ({ page }) => {
  await page.addInitScript(() => {
    const key = "school-doc-manager:v1";
    localStorage.setItem(`${key}:bootstrap`, JSON.stringify({ storage: "localStorage" }));
    localStorage.setItem(key, JSON.stringify({
      selectedDocId: "one", selectedFolderId: "all", settings: {}, styles: [],
      folders: [{ id: "folder", name: "Documents", kind: "tag" }],
      docs: [
        { id: "one", title: "First", content: "First body", folderId: "folder", type: "notice" },
        { id: "two", title: "Second", content: "Second body", folderId: "folder", type: "notice" },
        { id: "trash", title: "Deleted", content: "Deleted body", folderId: "folder", deletedAt: "2026-10-01T00:00:00Z" },
      ],
    }));
  });
  await page.goto("/index.html");
  await expect(page.locator("#titleInput")).toHaveValue("First");
  await expect(page.locator("#trashModalList .trash-item")).toHaveCount(0);
  await page.evaluate(() => {
    window.savedRow = document.querySelector('[data-doc-id="two"]');
    window.savedRow.querySelector("details").open = true;
  });
  await page.locator("#contentEditor").fill("Changed body");
  await page.locator("#saveDocBtn").click();
  await expect(page.locator('[data-doc-id="one"] .doc-snippet')).toHaveText("Changed body");
  expect(await page.evaluate(() => window.savedRow === document.querySelector('[data-doc-id="two"]') && window.savedRow.querySelector("details").open)).toBe(true);
  await expect(page.locator("#trashModalList .trash-item")).toHaveCount(0);
  await page.locator("#trashTopBtn").click();
  await expect(page.locator("#trashModalList .trash-item")).toHaveCount(1);
  await page.locator('[data-restore-doc="trash"]').click();
  await expect(page.locator("#trashModalList .trash-item")).toHaveCount(0);
  await expect(page.locator('[data-doc-id="trash"]')).toHaveCount(1);
});

test("writer progress updates keep other cards and their action handlers", async ({ page }) => {
  await page.goto("/index.html");
  const result = await page.evaluate(async () => {
    const { createSkillRenderer } = await import("/src/modules/skills/skillRenderer.js");
    const list = document.createElement("div");
    document.body.append(list);
    const state = { styles: [
      { id: "building", name: "Building", status: "building", enabled: true, buildProgress: { progress: 10 } },
      { id: "ready", name: "Ready", summary: "Instructions", enabled: true },
    ] };
    let invocations = 0;
    const renderer = createSkillRenderer({ state, ui: {}, els: { styleList: list }, onInvokeSkill: () => invocations++ });
    renderer.renderStyleList();
    const before = list.children[1];
    for (let index = 0; index < 5; index++) {
      state.styles[0].buildProgress = { progress: 20 + index, message: `Step ${index}` };
      renderer.renderStyleList();
    }
    const retained = before === list.children[1];
    before.querySelector("button").click();
    const progress = list.querySelector(".skill-progress-track span").style.width;
    list.remove();
    return { retained, invocations, progress };
  });
  expect(result).toEqual({ retained: true, invocations: 1, progress: "24%" });
});

test("icon rendering is scoped and keeps SVG classes in strict modules", async ({ page }) => {
  await page.goto("/index.html");
  const result = await page.evaluate(async () => {
    const { createIcons } = await import("/src/ui/icons.js");
    const scope = document.createElement("div");
    scope.innerHTML = '<i data-lucide="search" class="test-icon"></i>';
    const other = scope.cloneNode(true);
    document.body.append(scope, other);
    createIcons(scope);
    const svg = scope.querySelector("svg");
    createIcons(scope);
    const result = { rendered: svg.classList.contains("test-icon"), retained: scope.firstChild === svg, outsideUnchanged: other.firstChild.tagName === "I" };
    scope.remove();
    other.remove();
    return result;
  });
  expect(result).toEqual({ rendered: true, retained: true, outsideUnchanged: true });
});
