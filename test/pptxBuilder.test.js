import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import {
  formatPptQualityReport,
  inspectPptSpec,
  normalizePptSpec,
  parseGuizangPptSpec,
  PPT_STYLE_OPTIONS,
} from "../src/modules/ppt/guizangPpt.js";
import { createPptxArrayBuffer } from "../src/modules/ppt/pptxBuilder.js";

test("parseGuizangPptSpec accepts fenced JSON and normalizes slides", () => {
  const spec = parseGuizangPptSpec(`\`\`\`json
{
  "title": "工作汇报",
  "style": "swiss",
  "slides": [
    { "type": "cover", "title": "工作汇报", "body": "阶段总结" },
    { "type": "bullets", "title": "重点事项", "bullets": ["完成排期", "明确责任"] }
  ]
}
\`\`\``);
  assert.equal(spec.title, "工作汇报");
  assert.equal(spec.style, "swiss");
  assert.equal(spec.slides.length, 2);
  assert.deepEqual(spec.slides[1].bullets, ["完成排期", "明确责任"]);
});

test("parseGuizangPptSpec supports custom slide count, style, and new layouts", () => {
  const spec = parseGuizangPptSpec(
    JSON.stringify({
      title: "项目汇报",
      style: "custom",
      styleDescription: "克制、数据优先",
      slides: [
        { type: "data", title: "关键指标", bullets: ["完成率：92%", "覆盖人数：1200"] },
        { type: "roadmap", title: "实施路线", bullets: ["准备", "试点", "推广"] },
        { type: "orgchart", title: "职责分工", bullets: ["领导小组", "教务处", "年级组"] },
        { type: "imageText", title: "现场照片", body: "左侧保留图片占位，右侧说明要点。" },
        { type: "appendix", title: "附录材料", table: { headers: ["项目", "说明"], rows: [["A", "B"]] } },
      ],
    }),
    { slideCount: 4 },
  );

  assert.equal(spec.style, "custom");
  assert.equal(spec.styleDescription, "克制、数据优先");
  assert.deepEqual(spec.slides.map((slide) => slide.type), ["data", "roadmap", "orgchart", "imageText"]);
});

test("PPT style registry exposes guizang variants and official defaults", () => {
  const ids = PPT_STYLE_OPTIONS.map((option) => option.id);
  assert.ok(ids.includes("magazineForest"));
  assert.ok(ids.includes("swissOrange"));
  assert.ok(ids.includes("officialBlue"));
  assert.ok(ids.includes("educationGreen"));

  const spec = parseGuizangPptSpec(
    JSON.stringify({
      title: "正式汇报",
      style: "officialblue",
      slides: [{ type: "cover", title: "正式汇报" }],
    }),
  );
  assert.equal(spec.style, "officialBlue");
});

test("PPT auto slide count keeps generated pages instead of forcing manual count", () => {
  const spec = normalizePptSpec(
    {
      title: "自动页数",
      slideCount: "auto",
      slides: Array.from({ length: 9 }, (_, index) => ({
        type: index === 0 ? "cover" : "content",
        title: `第 ${index + 1} 页`,
      })),
    },
    { autoSlideCount: true, slideCount: 4 },
  );
  const report = inspectPptSpec(spec, { autoSlideCount: true, slideCount: 4 });

  assert.equal(spec.autoSlideCount, true);
  assert.equal(spec.slides.length, 9);
  assert.equal(report.checks.find((check) => check.id === "slide-count")?.status, "pass");
});

test("inspectPptSpec reports page count, missing titles, large tables, and empty notes", () => {
  const report = inspectPptSpec(
    {
      title: "自检演示",
      slides: [
        {
          type: "data",
          title: "",
          table: {
            rows: Array.from({ length: 8 }, (_, rowIndex) =>
              Array.from({ length: 6 }, (_, colIndex) => `${rowIndex}-${colIndex}`),
            ),
          },
        },
      ],
    },
    { slideCount: 2 },
  );
  const text = formatPptQualityReport(report);

  assert.equal(report.ok, false);
  assert.match(text, /期望 2 页，当前 1 页/);
  assert.match(text, /缺少明确标题/);
  assert.match(text, /表格过大/);
  assert.match(text, /没有演讲者备注/);
});

test("createPptxArrayBuffer generates an editable pptx package", async () => {
  const bytes = await createPptxArrayBuffer({
    title: "工作汇报",
    style: "magazine",
    slides: [
      { type: "cover", title: "工作汇报", subtitle: "阶段总结" },
      {
        type: "content",
        title: "推进情况",
        body: "本页使用原生文本框生成。",
        bullets: ["完成排期", "明确责任"],
        table: { headers: ["项目", "状态"], rows: [["排期", "完成"]] },
        notes: "这里是演讲者备注。",
      },
    ],
  });
  assert.ok(bytes.byteLength > 10000);
  const zip = await JSZip.loadAsync(bytes);
  assert.ok(zip.file("ppt/slides/slide1.xml"));
  assert.ok(zip.file("ppt/slides/slide2.xml"));
  const slide2 = await zip.file("ppt/slides/slide2.xml").async("string");
  assert.match(slide2, /推进情况/);
  assert.match(slide2, /完成排期/);
  assert.match(slide2, /项目/);
});

test("createPptxArrayBuffer renders new native PPTX layouts", async () => {
  const bytes = await createPptxArrayBuffer({
    title: "P1 布局测试",
    style: "custom",
    slides: [
      { type: "cover", title: "P1 布局测试" },
      { type: "data", title: "关键指标", bullets: ["完成率：92%", "覆盖人数：1200"] },
      { type: "roadmap", title: "实施路线", bullets: ["准备", "试点", "推广"] },
      { type: "orgchart", title: "职责分工", bullets: ["领导小组", "教务处", "年级组"] },
      { type: "imageText", title: "图文说明", body: "图文页正文" },
      { type: "appendix", title: "附录材料", table: { headers: ["项目", "说明"], rows: [["A", "B"]] } },
    ],
  });

  const zip = await JSZip.loadAsync(bytes);
  assert.ok(zip.file("ppt/slides/slide6.xml"));
  const slide2 = await zip.file("ppt/slides/slide2.xml").async("string");
  const slide4 = await zip.file("ppt/slides/slide4.xml").async("string");
  const slide6 = await zip.file("ppt/slides/slide6.xml").async("string");
  assert.match(slide2, /关键指标/);
  assert.match(slide2, /92%/);
  assert.match(slide4, /领导小组/);
  assert.match(slide6, /附录材料/);
});

test("createPptxArrayBuffer uses official PPTX themes", async () => {
  const bytes = await createPptxArrayBuffer({
    title: "公文汇报",
    style: "officialBlue",
    slides: [
      { type: "cover", title: "公文汇报" },
      { type: "bullets", title: "工作要点", bullets: ["规范结构", "控制文风"] },
    ],
  });

  assert.ok(bytes.byteLength > 10000);
  const zip = await JSZip.loadAsync(bytes);
  const slide1 = await zip.file("ppt/slides/slide1.xml").async("string");
  assert.match(slide1, /公文汇报/);
});
