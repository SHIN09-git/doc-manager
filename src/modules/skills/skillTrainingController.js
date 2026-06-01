import { EVENTS } from "../../core/eventBus.js";
import { buildUnsupportedFileMessage, canImportFile, readImportFileText } from "../../utils/fileReaders.js";
import { createId, now } from "../../utils/helpers.js";
import { filterImportableFilesBySize } from "../../utils/importGuards.js";
import { scanPrivacyRisksInObject } from "../../utils/privacyScan.js";

export function createSkillTrainingController(deps = {}) {
  const {
    ui = { activeTasks: {} },
    els = {},
    eventBus = { emit: () => {} },
    skillBuilder,
    toast = () => {},
    withProgress = async (_message, task) => task({ update: () => {} }),
    importSkillPackageFiles = async () => {},
    isSkillPackageFile = () => false,
    confirmLargeImport = () => true,
    confirmPrivacyRiskNotice = () => true,
    confirmUnstableDraft = () => true,
    syncEditingStyleFromInputs = () => ui.editingStyle || {},
    commitSkillToState = (style) => style,
    parseSkillJsonObject = (value) => JSON.parse(value || "{}"),
    renderStyleExamples = () => {},
    renderSkillDetailExamples = () => {},
    closeSkillBuilderModal = () => {},
    switchTab = () => {},
    createSkillCardProgress = () => ({ update: () => {} }),
    getSkillBuildResult = () => ({}),
    updateSkillBuildState = () => {},
    getSkillLocation = (style) => style?.name || "执笔人库",
    getSkillTrainingLocation = (style) => `${style?.name || "未命名执笔人"} / 训练样本`,
    friendlyAiErrorMessage = (error) => error?.message || "",
    isTaskAbortError = () => false,
    throwIfTaskAborted = () => {},
    createAbortController = () => new AbortController(),
    logger = console,
  } = deps;

  async function importStyleExamples(event) {
    const files = Array.from(event?.target?.files || []);
    const result = await importStyleExampleFiles(files);
    if (event?.target) event.target.value = "";
    return result;
  }

  async function importStyleDropFiles(files) {
    const fileList = Array.from(files || []);
    const skillPackages = fileList.filter(isSkillPackageFile);
    const exampleFiles = fileList.filter((file) => !isSkillPackageFile(file));
    const result = { packageCount: skillPackages.length, exampleCount: exampleFiles.length };
    if (skillPackages.length > 0) {
      result.packageResult = await importSkillPackageFiles(skillPackages);
    }
    if (exampleFiles.length > 0) {
      result.exampleResult = await importStyleExampleFiles(exampleFiles);
    }
    return result;
  }

  async function importStyleExampleFiles(files) {
    if (!files || files.length === 0) return { importedCount: 0, skippedFiles: [], sizeSkipped: [] };
    if (!ui.editingStyle) {
      toast("请先打开执笔人生成窗口", "warn");
      return { importedCount: 0, skippedFiles: [], sizeSkipped: [] };
    }
    ui.editingStyle.examples = Array.isArray(ui.editingStyle.examples) ? ui.editingStyle.examples : [];
    const { accepted: importFiles, skipped: sizeSkipped } = await filterImportableFilesBySize(files, {
      confirm: confirmLargeImport,
      notify: toast,
    });
    if (importFiles.length === 0) return { importedCount: 0, skippedFiles: [], sizeSkipped };

    let importedCount = 0;
    const skippedFiles = [];
    await withProgress(`正在导入 ${importFiles.length} 个示范文件`, async (progress) => {
      for (const [index, file] of importFiles.entries()) {
        progress.update(`正在读取 ${file.name}`, Math.round((index / importFiles.length) * 78) + 10);
        if (!canImportFile(file.name)) {
          skippedFiles.push(file.name);
          continue;
        }
        let text = "";
        try {
          text = await readImportFileText(file);
        } catch (error) {
          skippedFiles.push(file.name);
          logger.warn?.("导入示范文件失败", file.name, error);
          continue;
        }
        ui.editingStyle.examples.push({
          id: createId(),
          name: file.name,
          text,
          addedAt: now(),
        });
        importedCount += 1;
      }
      progress.update("正在刷新示范列表", 92);
    });
    if (importedCount === 0 && skippedFiles.length > 0) {
      toast(`未添加示范：${buildUnsupportedFileMessage(skippedFiles[0])}`, "warn");
      return { importedCount, skippedFiles, sizeSkipped };
    }
    renderStyleExamples();
    renderSkillDetailExamples();
    const skippedCount = skippedFiles.length + sizeSkipped.length;
    toast(`已添加 ${importedCount} 份示范到：${getSkillTrainingLocation(ui.editingStyle)}${skippedCount ? `，已跳过 ${skippedCount} 个暂不支持、过大或读取失败的文件` : ""}`);
    return { importedCount, skippedFiles, sizeSkipped };
  }

  async function summarizeStyle() {
    const style = syncEditingStyleFromInputs();
    if (!String(style?.name || "").trim()) {
      toast("请输入执笔人名称", "warn");
      els.styleNameInput?.focus?.();
      return null;
    }
    if (!style.examples || style.examples.length === 0) {
      toast("请先添加示范文件", "warn");
      return null;
    }
    if (style.examples.length < 2) {
      const ok = confirmUnstableDraft("只有 1 篇示范只能生成不稳定草案，建议至少 3-5 篇。是否继续生成草案？");
      if (!ok) return null;
    }
    const findings = scanPrivacyRisksInObject(
      (style.examples || []).map((example) => ({ name: example.name, text: example.text })),
      { path: "训练样本" },
    );
    if (!confirmPrivacyRiskNotice("训练样本将发送给已配置的 AI 接口用于生成执笔人。", findings)) {
      toast("已取消生成执笔人", "warn");
      return null;
    }

    style.status = "building";
    style.buildProgress = { message: "准备构建执笔人", progress: 8 };
    style.lastBuildError = "";
    style.lastBuildAt = now();

    let saved;
    try {
      saved = commitSkillToState(style);
    } catch (error) {
      toast(error.message || "保存执笔人失败", "error");
      return null;
    }

    closeSkillBuilderModal({ restoreFocus: false });
    ui.selectedSkillCardId = saved.id;
    switchTab("style");
    const taskKey = `skill-build:${saved.id}`;
    ui.activeTasks = ui.activeTasks || {};
    if (ui.activeTasks[taskKey]) {
      toast("该执笔人正在生成中", "warn");
      return null;
    }

    const controller = createAbortController();
    ui.activeTasks[taskKey] = {
      key: taskKey,
      controller,
      button: null,
      oldHtml: "",
      cancelToast: "已取消本次执笔人构建",
    };
    const progress = createSkillCardProgress(saved.id);

    try {
      const outputs = await skillBuilder.buildSkillWithAiChain(saved, progress, { signal: controller.signal });
      throwIfTaskAborted(controller.signal);
      const version = skillBuilder.createSkillVersion(saved, outputs);
      progress.update("正在保存执笔人版本", 92);
      const generatedRule = parseSkillJsonObject(outputs.skillJson, saved);
      const nextStyle = {
        ...saved,
        description: generatedRule.description || generatedRule.concise_instruction || saved.description || "",
        analyses: outputs.analyses,
        analysis: outputs.analysis,
        aggregationData: outputs.aggregationData,
        aggregation: outputs.aggregation,
        qualityReport: outputs.qualityReport,
        summary: outputs.markdown,
        skillJson: outputs.skillJson,
        status: "ready",
        buildProgress: null,
        lastBuildError: "",
        lastBuildAt: now(),
        lastTest: {
          id: createId(),
          createdAt: now(),
          prompt: "AI 自动生成的执笔人测试",
          result: outputs.testDoc,
          report: outputs.testReport,
        },
        versions: [...(saved.versions || []), version].slice(-30),
      };
      nextStyle.lastBuildResult = getSkillBuildResult(nextStyle, version, outputs);
      const committed = commitSkillToState(nextStyle);
      eventBus.emit(EVENTS.RENDER_STYLE_EDITOR);
      toast(`已生成 v${version.version} 并保存到：${getSkillLocation(committed)}`);
      return committed;
    } catch (error) {
      const isCanceled = isTaskAbortError(error) || controller.signal?.aborted;
      updateSkillBuildState(saved.id, {
        status: "failed",
        buildProgress: null,
        lastBuildError: isCanceled ? "用户取消了本次生成" : friendlyAiErrorMessage(error) || error.message || "生成失败",
        lastBuildAt: now(),
      });
      toast(isCanceled ? "已取消本次执笔人构建" : friendlyAiErrorMessage(error) || "执笔人生成失败", isCanceled ? "warn" : "error");
      return null;
    } finally {
      if (ui.activeTasks?.[taskKey]?.controller === controller) delete ui.activeTasks[taskKey];
    }
  }

  return {
    importStyleExamples,
    importStyleDropFiles,
    importStyleExampleFiles,
    summarizeStyle,
  };
}
