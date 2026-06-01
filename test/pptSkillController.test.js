import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPptStyleSkillDraft,
  createPptSkillController,
} from "../src/modules/ppt/pptSkillController.js";

function createInput(value = "") {
  return {
    value,
    focused: false,
    focus() {
      this.focused = true;
    },
  };
}

function createHarness({
  styleDescription = "冷静、正式、留白充足",
  title = "期末工作汇报",
  promptResult = "期末工作汇报 PPT 风格",
  commitImpl,
} = {}) {
  const calls = [];
  const els = {
    pptCustomStyleInput: createInput(styleDescription),
    pptTitleInput: createInput(title),
  };
  const controller = createPptSkillController({
    els,
    windowRef: {
      prompt(message, defaultValue) {
        calls.push(["prompt", message, defaultValue]);
        return promptResult;
      },
    },
    toast(message, tone = "info") {
      calls.push(["toast", message, tone]);
    },
    commitSkillToState: commitImpl || ((draft) => {
      calls.push(["commit", draft]);
      return { ...draft, id: "ppt-skill-1" };
    }),
    getSkillLocation(skill) {
      return `本地执笔人库 / ${skill.name}`;
    },
  });

  return { controller, calls, els };
}

test("savePptStyleAsSkill requires a custom style description", () => {
  const { controller, calls, els } = createHarness({ styleDescription: "" });

  const result = controller.savePptStyleAsSkill();

  assert.equal(result, null);
  assert.equal(els.pptCustomStyleInput.focused, true);
  assert.deepEqual(calls, [["toast", "请先填写自定义风格描述，再保存为 PPT 执笔人", "warn"]]);
});

test("savePptStyleAsSkill cancels when the user does not provide a name", () => {
  const { controller, calls } = createHarness({ promptResult: "" });

  const result = controller.savePptStyleAsSkill();

  assert.equal(result, null);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ["prompt", "PPT 执笔人名称", "期末工作汇报 PPT 风格"]);
});

test("savePptStyleAsSkill rejects names that cannot form an @ handle", () => {
  const { controller, calls } = createHarness({ promptResult: "!!!" });

  const result = controller.savePptStyleAsSkill();

  assert.equal(result, null);
  assert.deepEqual(calls.at(-1), ["toast", "PPT 执笔人名称需要包含中文、英文、数字、下划线或连字符", "warn"]);
  assert.equal(calls.some(([type]) => type === "commit"), false);
});

test("savePptStyleAsSkill saves a PPT writer draft and reports its location", () => {
  const { controller, calls } = createHarness();

  const result = controller.savePptStyleAsSkill();

  assert.equal(result.id, "ppt-skill-1");
  const commitCall = calls.find(([type]) => type === "commit");
  assert.ok(commitCall);
  const draft = commitCall[1];
  assert.equal(draft.name, "期末工作汇报 PPT 风格");
  assert.equal(draft.handle, "期末工作汇报PPT风格");
  assert.equal(draft.category, "PPT");
  assert.match(draft.summary, /在 PPT 内容与要求中输入 @期末工作汇报PPT风格/);
  const skillJson = JSON.parse(draft.skillJson);
  assert.equal(skillJson.category, "PPT");
  assert.equal(skillJson.ppt_generation.style, "custom");
  assert.equal(skillJson.style_rules.recommended[0], "冷静、正式、留白充足");
  assert.deepEqual(calls.at(-1), [
    "toast",
    "已保存 PPT 执笔人 @期末工作汇报PPT风格 到：本地执笔人库 / 期末工作汇报 PPT 风格",
    "info",
  ]);
});

test("savePptStyleAsSkill surfaces commit errors without throwing", () => {
  const { controller, calls } = createHarness({
    commitImpl() {
      throw new Error("@期末工作汇报PPT风格 已被使用");
    },
  });

  const result = controller.savePptStyleAsSkill();

  assert.equal(result, null);
  assert.deepEqual(calls.at(-1), ["toast", "@期末工作汇报PPT风格 已被使用", "error"]);
});

test("buildPptStyleSkillDraft keeps the PPT execution card self-contained", () => {
  const draft = buildPptStyleSkillDraft({
    name: "会议汇报 PPT 风格",
    handle: "会议汇报PPT风格",
    styleDescription: "蓝白配色，标题克制，页面留白明显",
  });
  const skillJson = JSON.parse(draft.skillJson);

  assert.equal(draft.description, "PPT 生成专用执笔人");
  assert.equal(draft.createdAt, draft.updatedAt);
  assert.match(draft.summary, /适用范围/);
  assert.ok(skillJson.style_rules.must.some((rule) => rule.includes("原生 PowerPoint")));
  assert.ok(skillJson.forbidden.some((rule) => rule.includes("不得编造")));
  assert.ok(skillJson.ppt_generation.supported_layouts.includes("roadmap"));
});
