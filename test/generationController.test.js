import assert from "node:assert/strict";
import test from "node:test";
import {
  createGenerationController,
  normalizeAiReplacement,
  splitGeneratedDocument,
} from "../src/modules/generation/generationController.js";

function createElement(value = "") {
  return {
    value,
    disabled: false,
    selectionStart: 0,
    selectionEnd: 0,
    listeners: {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
    },
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    focus() {
      this.focused = true;
    },
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
    scrollIntoView() {},
  };
}

function createHarness(options = {}) {
  const editor = createElement(options.content || "第一段。\n第二段太啰嗦。\n第三段。");
  const targetText = options.targetText || "第二段太啰嗦。";
  const targetStart = editor.value.indexOf(targetText);
  editor.setSelectionRange(targetStart, targetStart + targetText.length);
  const prompt = createElement(options.instruction ?? "压缩成一句话，保留事实。 ");
  const toasts = [];
  const aiPrompts = [];
  let undoCount = 0;
  let saveCount = 0;
  let aiCallCount = 0;
  const doc = { id: "doc-1", title: "原标题", type: "notice", content: editor.value };
  let currentDoc = doc;
  const createdDocs = [];
  const els = {
    generateDocBtn: createElement(),
    overwriteDraftBtn: createElement(),
    insertDraftBtn: createElement(),
    generatePrompt: createElement(options.generatePrompt || "生成一份通知"),
    aiRevisionBar: createElement(),
    aiRevisionTarget: createElement(),
    aiRevisionPrompt: prompt,
    aiRevisionBtn: createElement(),
    contentEditor: editor,
    titleInput: createElement(doc.title),
    typeSelect: createElement(doc.type),
    folderSelect: createElement(),
    styleSelect: createElement(),
  };
  function switchDocument(nextDoc) {
    currentDoc = nextDoc;
    editor.value = nextDoc?.content || "";
    els.titleInput.value = nextDoc?.title || "";
    els.typeSelect.value = nextDoc?.type || "";
    els.folderSelect.value = nextDoc?.folderId || "";
    els.styleSelect.value = nextDoc?.styleId || "";
  }
  const controller = createGenerationController({
    els,
    ui: { activeTasks: {}, generatedDraft: "" },
    state: { settings: { systemPrompt: "系统提示" } },
    defaultSystemPrompt: "默认提示",
    toast: (message, type) => toasts.push({ message, type }),
    cancelActiveTask: () => false,
    withCancelableTask: async (_taskOptions, task) => task({
      progress: { update() {} },
      signal: new AbortController().signal,
    }),
    throwIfTaskAborted: () => {},
    getCurrentDoc: () => currentDoc,
    getType: () => ({ name: "通知", structure: "标题、正文、落款" }),
    resolveInvokedSkills: () => [],
    formatSkillPrompt: () => "",
    callAiWithRetry: async (messages) => {
      aiCallCount += 1;
      aiPrompts.push(messages.at(-1)?.content || "");
      if (options.onAiCall) return options.onAiCall({ editor, messages, doc, els, switchDocument });
      return options.aiResponse || "第二段简明表述。";
    },
    createDocument: (draft) => {
      const created = { id: "new-doc", ...draft };
      createdDocs.push(created);
      return created;
    },
    deriveGeneratedTitle: options.deriveGeneratedTitle || (() => "生成标题"),
    recordEditorUndoPoint: () => { undoCount += 1; },
    saveEditor: () => { saveCount += 1; },
    getDocumentLocation: () => "本机文档库 / 当前文档",
    getSelectionOrLine: () => ({
      start: editor.selectionStart,
      end: editor.selectionEnd,
      text: editor.value.slice(editor.selectionStart, editor.selectionEnd),
    }),
    ...(options.getReferenceContext ? { getReferenceContext: options.getReferenceContext } : {}),
    ...(options.skillInputForm ? { skillInputForm: options.skillInputForm } : {}),
  });
  return {
    controller,
    doc,
    editor,
    els,
    prompt,
    toasts,
    aiPrompts,
    createdDocs,
    get undoCount() { return undoCount; },
    get saveCount() { return saveCount; },
    get aiCallCount() { return aiCallCount; },
  };
}

test("custom AI revision replaces only the selected text and records undo", async () => {
  const harness = createHarness();

  const revised = await harness.controller.reviseSelectionByInstruction();

  assert.equal(revised, true);
  assert.equal(harness.editor.value, "第一段。\n第二段简明表述。\n第三段。");
  assert.equal(harness.els.titleInput.value, "原标题");
  assert.equal(harness.undoCount, 1);
  assert.equal(harness.saveCount, 1);
  assert.equal(harness.prompt.value, "");
  assert.match(harness.aiPrompts[0], /压缩成一句话/);
  assert.match(harness.aiPrompts[0], /只修改目标片段/);
  assert.match(harness.toasts.at(-1).message, /原位修改/);
});

test("revision does not overwrite text changed while the AI request is running", async () => {
  const harness = createHarness({
    onAiCall: ({ editor }) => {
      editor.value = "用户在等待期间继续修改了正文。";
      return "AI 返回的旧结果";
    },
  });

  const revised = await harness.controller.reviseSelectionByInstruction();

  assert.equal(revised, false);
  assert.equal(harness.editor.value, "用户在等待期间继续修改了正文。");
  assert.equal(harness.undoCount, 0);
  assert.equal(harness.saveCount, 0);
  assert.match(harness.toasts.at(-1).message, /结果未覆盖/);
});

test("revision requires a concrete instruction before calling AI", async () => {
  const harness = createHarness({ instruction: "   " });

  const revised = await harness.controller.reviseSelectionByInstruction();

  assert.equal(revised, false);
  assert.equal(harness.aiCallCount, 0);
  assert.equal(harness.prompt.focused, true);
  assert.match(harness.toasts.at(-1).message, /怎么修改/);
});

test("revision refuses a different document even when its body is identical", async () => {
  const harness = createHarness({
    onAiCall: ({ doc, switchDocument }) => {
      switchDocument({ ...doc, id: "doc-2" });
      return "不应写入另一篇文档的内容";
    },
  });

  assert.equal(await harness.controller.reviseSelectionByInstruction(), false);
  assert.equal(harness.editor.value, harness.doc.content);
  assert.equal(harness.saveCount, 0);
  assert.equal(harness.undoCount, 0);
});

for (const mode of ["overwrite", "insert"]) {
  test(`${mode} refuses a different document even when its body and metadata are identical`, async () => {
    const harness = createHarness({
      onAiCall: ({ doc, switchDocument }) => {
        switchDocument({ ...doc, id: "doc-2" });
        return "生成标题\n\n给原文档生成的正文。";
      },
    });

    await harness.controller.generateDocument(mode);

    assert.equal(harness.editor.value, harness.doc.content);
    assert.equal(harness.els.titleInput.value, harness.doc.title);
    assert.equal(harness.saveCount, 0);
    assert.equal(harness.undoCount, 0);
    assert.equal(harness.createdDocs.length, 0);
    assert.match(harness.toasts.at(-1).message, /未写入/);
  });

  test(`${mode} refuses to write when the target document is removed`, async () => {
    const harness = createHarness({
      onAiCall: ({ switchDocument }) => {
        switchDocument(null);
        return "生成标题\n\n过期结果。";
      },
    });

    await harness.controller.generateDocument(mode);

    assert.equal(harness.editor.value, "");
    assert.equal(harness.saveCount, 0);
    assert.equal(harness.createdDocs.length, 0);
  });

  for (const field of ["contentEditor", "titleInput", "typeSelect", "folderSelect", "styleSelect"]) {
    test(`${mode} preserves edits to ${field} made while awaiting AI`, async () => {
      const harness = createHarness({
        onAiCall: ({ els }) => {
          els[field].value = "用户的新内容";
          return "生成标题\n\n过期结果。";
        },
      });

      await harness.controller.generateDocument(mode);

      assert.equal(harness.els[field].value, "用户的新内容");
      assert.equal(harness.saveCount, 0);
      assert.equal(harness.undoCount, 0);
    });
  }
}

test("new document generation still creates a draft after the user switches documents", async () => {
  const harness = createHarness({
    onAiCall: ({ doc, switchDocument }) => {
      switchDocument({ ...doc, id: "doc-2" });
      return "生成标题\n\n新文档正文。";
    },
  });

  await harness.controller.generateDocument("new");

  assert.equal(harness.createdDocs.length, 1);
  assert.equal(harness.createdDocs[0].content, "新文档正文。");
});

test("overwrite still writes an unchanged target", async () => {
  const harness = createHarness({ aiResponse: "生成标题\n\n新正文。" });

  await harness.controller.generateDocument("overwrite");

  assert.equal(harness.editor.value, "新正文。");
  assert.equal(harness.els.titleInput.value, "生成标题");
  assert.equal(harness.saveCount, 1);
  assert.equal(harness.undoCount, 1);
});

test("generated title is separated from body content", () => {
  const result = splitGeneratedDocument(
    "## 关于专项培训的通知\n\n各部门：\n请按要求参加培训。",
    "请起草培训通知",
    () => "关于专项培训的通知",
  );

  assert.equal(result.title, "关于专项培训的通知");
  assert.equal(result.body, "各部门：\n请按要求参加培训。");
});

test("insert mode writes generated body at the remembered editor cursor", async () => {
  const harness = createHarness({
    aiResponse: "新增标题\n\n插入内容。",
    deriveGeneratedTitle: () => "新增标题",
  });
  const cursor = "第一段。".length;
  harness.editor.setSelectionRange(cursor, cursor);

  await harness.controller.generateDocument("insert");

  assert.equal(harness.editor.value, "第一段。\n\n插入内容。\n\n第二段太啰嗦。\n第三段。");
  assert.equal(harness.undoCount, 1);
  assert.equal(harness.saveCount, 1);
  assert.equal(harness.editor.value.endsWith("插入内容。"), false);
});

test("insert keeps the original cursor when the user moves it while awaiting AI", async () => {
  const harness = createHarness({
    onAiCall: ({ editor }) => {
      editor.setSelectionRange(editor.value.length, editor.value.length);
      return "生成标题\n\n插入内容。";
    },
  });
  harness.editor.setSelectionRange(4, 4);

  await harness.controller.generateDocument("insert");

  assert.equal(harness.editor.value, "第一段。\n\n插入内容。\n\n第二段太啰嗦。\n第三段。");
});

test("AI replacement removes wrapper labels while preserving boundary whitespace", () => {
  const result = normalizeAiReplacement("```text\n修改后：新的表达\n```", "  原表达\n");

  assert.equal(result, "  新的表达\n");
});

test("document generation sends references and structured input as separate prompt sections", async () => {
  const harness = createHarness({
    generatePrompt: "起草一份培训通知",
    aiResponse: "培训通知\n\n请于【培训时间】到【培训地点】参加培训。",
    deriveGeneratedTitle: () => "培训通知",
    getReferenceContext: () => ({ text: "参考资料（本次起草的事实依据）：\n【资料 1】会议纪要\n周三下午培训", items: [{ id: "doc-2" }] }),
    skillInputForm: {
      hasValues: () => true,
      checkBeforeGenerate: () => true,
      getPromptSection: () => "结构化输入（用户在执笔人表单中填写，属于本次事实）：\n- 主题：专项培训",
    },
  });

  await harness.controller.generateDocument("new");

  const prompt = harness.aiPrompts[0];
  assert.match(prompt, /用户提示词：\n起草一份培训通知/);
  assert.match(prompt, /- 主题：专项培训/);
  assert.match(prompt, /【资料 1】会议纪要/);
  assert.ok(prompt.indexOf("结构化输入") < prompt.indexOf("参考资料"), "form facts should precede reference material");
  assert.match(harness.toasts.at(-1).message, /还有 2 处待填内容/);
});

test("document generation stops when the writer form asks to fill required fields first", async () => {
  const harness = createHarness({
    skillInputForm: { hasValues: () => false, checkBeforeGenerate: () => false, getPromptSection: () => "" },
  });

  await harness.controller.generateDocument("new");

  assert.equal(harness.aiCallCount, 0);
});

test("document generation can start from references without a typed prompt", async () => {
  const harness = createHarness({
    generatePrompt: "   ",
    aiResponse: "情况报告\n\n正文。",
    getReferenceContext: () => ({ text: "参考资料（本次起草的事实依据）：\n【资料 1】素材", items: [{ id: "doc-2" }] }),
  });

  await harness.controller.generateDocument("new");

  assert.equal(harness.aiCallCount, 1);
  assert.match(harness.aiPrompts[0], /请依据下方结构化输入和参考资料起草/);
});

test("document generation still requires some input", async () => {
  const harness = createHarness({ generatePrompt: "  " });

  await harness.controller.generateDocument("new");

  assert.equal(harness.aiCallCount, 0);
  assert.match(harness.toasts.at(-1).message, /请输入起草提示词，或添加参考资料/);
});
