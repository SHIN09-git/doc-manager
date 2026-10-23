import { test, expect } from "@playwright/test";

test("built-in writer invokes pinned references and checks generated output separately", async ({ page }) => {
  const errors = [];
  const prompts = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("school-doc-manager:v1", JSON.stringify({
      styles: [], folders: [], docs: [],
      settings: { provider: "openai-compatible", baseUrl: "http://127.0.0.1:4173/gongwen-mock", model: "fixture", endpointPath: "/chat/completions" },
    }));
    localStorage.setItem("school-doc-manager:v1:bootstrap", JSON.stringify({ storage: "localStorage" }));
    Object.defineProperty(window, "indexedDB", { configurable: true, value: undefined });
  });
  await page.route("**/gongwen-mock/chat/completions", async (route) => {
    prompts.push(route.request().postDataJSON().messages.at(-1).content);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ choices: [{ message: {
      content: "设备检查工作方案\n\n一、主要任务\n（一）检查安排\n1.核对设备清单\n按【时间】完成设备、场地和材料检查。",
    } }] }) });
  });
  await page.goto("/index.html");
  await page.locator('[data-invoke-skill="builtin-gongwen-dna-v1"]').click();
  await expect(page.locator("#generatePrompt")).toHaveValue(/@公文写作/);
  await expect(page.locator("#gongwenOptions")).toBeVisible();
  await page.locator("#gongwenGenreSelect").selectOption("工作方案");
  await page.locator("#generatePrompt").fill("@公文写作 起草设备检查工作方案。设备清单已准备，其他事实待补。只写200字。");
  await expect(page.locator("#skillInputFields [data-skill-input='文种']")).toHaveCount(0);
  await page.locator("#generateDocBtn").click();
  await expect(page.locator("#skillInputWarning")).toContainText("主题、真实事项");
  expect(prompts).toHaveLength(0);
  await page.locator("#generateDocBtn").click();
  await expect(page.locator("#contentEditor")).toHaveValue(/设备、场地和材料/);
  await expect(page.locator("#skillInputWarning")).toBeHidden();
  await expect(page.locator("#gongwenCheckPanel")).toBeVisible();
  await expect(page.locator("#gongwenCheckBody")).toContainText("参考 10 篇");
  await expect(page.locator("#gongwenCheckBody")).toContainText("待确认占位内容 1 处");
  await expect(page.locator("#contentEditor")).not.toHaveValue(/行文自检|实测|常见区间/);
  expect(prompts).toHaveLength(1);
  expect(prompts[0]).toContain("参考文件 SKILL.md");
  expect(prompts[0]).toContain("不得为迎合文风删改真实问题和数据");
  expect(prompts[0]).toContain("只写200字");
  await page.locator("#contentEditor").evaluate((editor) => {
    editor.focus();
    editor.setSelectionRange(0, editor.value.length);
  });
  await page.locator("#aiRevisionPrompt").fill("请把这一段改得更自然，保留事实");
  await page.locator("#aiRevisionBtn").click();
  await expect(page.locator("#gongwenCheckPanel")).toBeHidden();
  expect(prompts).toHaveLength(2);
  expect(prompts[1]).toContain("选用文种：工作方案");
  expect(prompts[1]).toContain("当前只改写选中段落");
  await page.locator("#contentEditor").fill("调整后内容");
  await expect(page.locator("#gongwenCheckPanel")).toBeHidden();
  await page.locator("#gongwenCheckBtn").click();
  await expect(page.locator("#gongwenCheckPanel")).toBeVisible();
  expect(prompts).toHaveLength(2);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "output/playwright/gongwen-desktop.png", fullPage: true });
});

test("local checker stays usable on mobile and never borrows unsupported genre parameters", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/index.html");
  await page.locator("#gongwenCheckBtn").click();
  await page.locator("#gongwenCheckGenre").selectOption("unsupported");
  await expect(page.locator("#gongwenCheckBody")).toContainText("未设参数");
  await expect(page.locator("#gongwenCheckBody")).toContainText("不套用其他文种参数");
  const dimensions = await page.locator("#gongwenCheckPanel").boundingBox();
  expect(dimensions.width).toBeLessThanOrEqual(390);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await page.screenshot({ path: "output/playwright/gongwen-mobile.png", fullPage: true });
  await page.locator("#gongwenCheckCloseBtn").click();
  await expect(page.locator("#gongwenCheckBtn")).toBeFocused();
});

test("direct-file workspace includes the built-in writer and checks without a network fetch", async ({ page }) => {
  await page.goto(new URL("../index.html", import.meta.url).href);
  await expect(page.locator('[data-invoke-skill="builtin-gongwen-dna-v1"]')).toBeVisible();
  await page.locator("#gongwenCheckBtn").click();
  await page.locator("#gongwenCheckGenre").selectOption("领导讲话");
  await expect(page.locator("#gongwenCheckBody")).toContainText("参考 44 篇");
});
