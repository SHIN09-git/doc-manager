import { normalizeHandle, sanitizeFileName } from "../../utils/helpers.js";
import { formatPrivacyRiskSummary, scanPrivacyRisksInObject } from "../../utils/privacyScan.js";

export function createSkillPackageController(deps = {}) {
  const {
    ui = {},
    els = {},
    skillManager,
    toast = () => {},
    withProgress = async (_message, task) => task({ update: () => {} }),
    switchTab = () => {},
    syncEditingStyleFromInputs = () => ui.editingStyle || {},
    getSelectedSkillCategory = () => ui.editingStyle?.category || "自定义",
    normalizeSkillJsonText = (value) => value || "{}",
    downloadBlob = () => {},
    getDownloadLocation = (fileName) => fileName,
    windowRef = () => globalThis.window,
    logger = console,
  } = deps;

  function bindEvents() {
    els.importSkillPackageBtn?.addEventListener("click", () => els.importSkillPackageInput?.click?.());
    els.exportSkillPackageBtn?.addEventListener("click", exportPackage);
    els.importSkillPackageInput?.addEventListener("change", importPackages);
    els.exportSkillMdBtn?.addEventListener("click", exportMarkdown);
    els.exportSkillJsonBtn?.addEventListener("click", exportJson);
  }

  function exportMarkdown() {
    const skill = getEditingSkill({
      summary: els.styleSummaryInput?.value ?? ui.editingStyle?.summary ?? "",
    });
    const content = skill.summary || `# ${skill.name}\n\n`;
    const fileName = `${sanitizeFileName(skill.name)}-执笔人说明.md`;
    downloadBlob(fileName, content, "text/markdown;charset=utf-8");
    toast(`已导出执笔人说明.md 到：${getDownloadLocation(fileName)}`);
    return { fileName, content };
  }

  function exportJson() {
    const skill = getEditingSkill({
      category: getSelectedSkillCategory(),
      description: els.skillDescriptionInput?.value.trim() || ui.editingStyle?.description || "",
    });
    const content = normalizeSkillJsonText(els.skillJsonInput?.value || "{}", skill);
    const fileName = `${sanitizeFileName(skill.name)}-执笔人规则.json`;
    downloadBlob(fileName, content, "application/json;charset=utf-8");
    toast(`已导出执笔人规则 JSON 到：${getDownloadLocation(fileName)}`);
    return { fileName, content };
  }

  function exportPackage() {
    const skill = syncEditingStyleFromInputs();
    if (!String(skill?.name || "").trim()) {
      toast("请先填写执笔人名称", "warn");
      return null;
    }
    const packageData = skillManager.createSkillPackage(skill);
    const findings = scanPrivacyRisksInObject(packageData.skill || packageData, { path: "执笔人包" });
    if (!confirmPrivacyRiskNotice("导出的执笔人包可能包含敏感或个案信息。", findings)) {
      toast("已取消导出执笔人包", "warn");
      return null;
    }
    const fileName = `${sanitizeFileName(skill.name)}.skill.json`;
    const content = JSON.stringify(packageData, null, 2);
    downloadBlob(fileName, content, "application/json;charset=utf-8");
    toast(`已导出执笔人包到：${getDownloadLocation(fileName)}`);
    return { fileName, packageData };
  }

  async function importPackages(event) {
    const files = Array.from(event?.target?.files || []);
    const result = await importPackageFiles(files);
    if (event?.target) event.target.value = "";
    return result;
  }

  async function importPackageFiles(files) {
    if (!files || files.length === 0) return { importedCount: 0, cancelledCount: 0, failed: [] };
    let importedCount = 0;
    let cancelledCount = 0;
    const failed = [];
    await withProgress(`正在导入 ${files.length} 个执笔人包`, async (progress) => {
      for (const [index, file] of files.entries()) {
        progress.update(`正在读取 ${file.name}`, Math.round((index / files.length) * 72) + 12);
        try {
          const payload = JSON.parse(await file.text());
          const preview = skillManager.inspectSkillPackageImport(payload);
          const conflictMode = confirmPackageImport(file.name, preview);
          if (conflictMode === "cancel") {
            cancelledCount += 1;
            continue;
          }
          skillManager.importSkillPackage(payload, { draft: preview.draft, conflictMode });
          importedCount += 1;
        } catch (error) {
          failed.push(file.name);
          logger.warn?.("导入执笔人包失败", file.name, error);
        }
      }
      progress.update("正在刷新执笔人列表", 92);
    });
    reportImportResult({ importedCount, cancelledCount, failed });
    return { importedCount, cancelledCount, failed };
  }

  function confirmPackageImport(fileName, preview) {
    const header = [
      `即将导入执笔人包：${fileName}`,
      "",
      preview.previewText,
      "",
      preview.sensitiveFindings.length
        ? "检测到疑似敏感字段，请确认来源可信并检查规则内容后再导入。"
        : "请确认来源可信后再导入。",
    ].join("\n");
    const win = windowRef();
    if (preview.duplicate) {
      const choice = win?.prompt?.(`${header}\n\n输入 1 覆盖现有执笔人；输入 2 另存为新执笔人；输入 3 取消导入。`, "2");
      if (choice === "1") return "replace";
      if (choice === "2" || choice === "") return "rename";
      return "cancel";
    }
    return win?.confirm?.(`${header}\n\n确认导入？`) ? "rename" : "cancel";
  }

  function confirmPrivacyRiskNotice(intro, findings = []) {
    if (!findings.length) return true;
    return Boolean(windowRef()?.confirm?.([
      intro,
      "",
      "本地预检发现以下疑似敏感或个案信息：",
      formatPrivacyRiskSummary(findings),
      "",
      "建议先脱敏或移除不应发送/分享的内容。是否继续？",
    ].join("\n")));
  }

  function isPackageFile(file) {
    return /\.skill\.json$/i.test(file?.name || "");
  }

  function getEditingSkill(extra = {}) {
    const base = ui.editingStyle || {};
    const name = els.styleNameInput?.value.trim() || base.name || "未命名执笔人";
    return {
      ...base,
      ...extra,
      name,
      handle: normalizeHandle(els.skillHandleInput?.value || base.handle || base.name || name),
    };
  }

  function reportImportResult(result) {
    const { importedCount, cancelledCount, failed } = result;
    if (importedCount > 0) {
      switchTab("style");
      toast(`已导入 ${importedCount} 个执笔人${failed.length ? `，${failed.length} 个文件格式不正确` : ""}`);
    } else if (cancelledCount > 0 && failed.length === 0) {
      toast("已取消导入执笔人包", "warn");
    } else {
      toast("未导入执笔人，请检查 .skill.json 文件格式", "warn");
    }
  }

  return {
    bindEvents,
    exportMarkdown,
    exportJson,
    exportPackage,
    importPackages,
    importPackageFiles,
    confirmPackageImport,
    confirmPrivacyRiskNotice,
    isPackageFile,
  };
}
