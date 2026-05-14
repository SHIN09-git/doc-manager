import { formatPossiblyJson } from "../../utils/formatters.js";
import {
  clone,
  createId,
  describeLengthChange,
  escapeHtml,
  formatLocalDate,
  normalizeHandle,
  now,
} from "../../utils/helpers.js";

export function createSkillRenderer(deps) {
  const {
    state,
    ui,
    els,
    createEmptyStyle,
    isSkillEnabled,
    commitSkillToState,
    getSkillLocation,
    toast,
  } = deps;

  function renderStyleSelect() {
    const enabledStyles = state.styles.filter(isSkillEnabled);
    els.styleSelect.innerHTML = [
      '<option value="">无默认执笔人</option>',
      ...enabledStyles.map((style) => `<option value="${style.id}">@${escapeHtml(style.handle)} · ${escapeHtml(style.name)}</option>`),
    ].join("");
    els.editorSkillSelect.innerHTML = enabledStyles
      .map((style) => `<option value="${style.id}">@${escapeHtml(style.handle)}</option>`)
      .join("");
  }

  function renderStyleEditor() {
    if (!ui.editingStyle) {
      ui.editingStyle = clone(state.styles[0] || createEmptyStyle());
    }
    els.styleNameInput.value = ui.editingStyle.name || "";
    els.skillHandleInput.value = ui.editingStyle.handle ? `@${ui.editingStyle.handle}` : "";
    els.skillCategorySelect.value = ui.editingStyle.category || "自定义";
    els.skillDescriptionInput.value = ui.editingStyle.description || "";
    els.skillEnabledInput.checked = ui.editingStyle.enabled !== false;
    els.skillAnalysisInput.value = ui.editingStyle.analysis || "";
    els.skillAggregationInput.value = ui.editingStyle.aggregation || "";
    els.styleSummaryInput.value = ui.editingStyle.summary || "";
    els.skillJsonInput.value = ui.editingStyle.skillJson || "";
    renderSkillQualityReport();
    renderStyleExamples();
    renderSkillVersions();
    renderSkillTest();
  }

  function renderStyleExamples() {
    const examples = ui.editingStyle.examples || [];
    if (examples.length === 0) {
      els.styleExampleList.innerHTML = '<div class="empty-state">尚未添加示范文件</div>';
      return;
    }
    els.styleExampleList.innerHTML = examples
      .map(
        (example, index) => `<div class="example-item">
          <div class="example-title">
            <span>${escapeHtml(example.name)}</span>
            <button class="tiny-button danger-text" type="button" title="移除" data-remove-example="${index}"><i data-lucide="x"></i></button>
          </div>
          <div class="example-size">${example.text.length} 字符</div>
          <details class="example-preview">
            <summary>预览文本</summary>
            <pre>${escapeHtml(example.text.slice(0, 2000))}${example.text.length > 2000 ? "\n..." : ""}</pre>
          </details>
        </div>`,
      )
      .join("");
    els.styleExampleList.querySelectorAll("[data-remove-example]").forEach((button) => {
      button.addEventListener("click", () => {
        ui.editingStyle.examples.splice(Number(button.dataset.removeExample), 1);
        renderStyleExamples();
      });
    });
    if (window.lucide) window.lucide.createIcons();
  }

  function renderSkillQualityReport() {
    if (!els.skillQualityReport || !ui.editingStyle) return;
    const style = ui.editingStyle;
    const report = style.qualityReport || {};
    const aggregationData = style.aggregationData || {};
    const lines = [
      `启用状态：${style.enabled === false ? "未启用" : "已启用"}`,
      `规则置信度：${report.confidence || aggregationData.overall_confidence || "未评估"}`,
      `强规则：${(aggregationData.strong_rules || report.strong_rules || []).length || 0} 条`,
      `候选规则：${(aggregationData.candidate_rules || report.candidate_rules || []).length || 0} 条`,
      `冲突提示：${(aggregationData.conflicts || report.conflicts || []).length || 0} 条`,
      `个案排除：${(aggregationData.case_specific_exclusions || report.case_specific_exclusions || []).length || 0} 条`,
      `隐私过滤：${(aggregationData.privacy_findings || report.privacy_findings || []).length || 0} 条`,
    ];
    if (style.lastTest?.report) {
      lines.push("", "最近测试：", formatPossiblyJson(style.lastTest.report).slice(0, 1200));
    }
    els.skillQualityReport.textContent = lines.join("\n");
  }

  function renderSkillVersions() {
    if (!els.skillVersionList || !ui.editingStyle) return;
    const versions = ui.editingStyle.versions || [];
    if (versions.length === 0) {
      els.skillVersionList.innerHTML = '<div class="empty-state">暂无版本记录</div>';
      els.skillVersionDiff.textContent = "";
      return;
    }

    els.skillVersionList.innerHTML = versions
      .map((version, index) => {
        const sourceCount = version.sourceExamples?.length || 0;
        const sourceLabel = sourceCount ? `${sourceCount} 份示范` : "未记录示范";
        return `<div class="version-item" data-version-item="${index}">
          <div>
            <strong>v${version.version || index + 1}</strong>
            <span>${escapeHtml(formatLocalDate(version.createdAt))}</span>
            <small>${escapeHtml(sourceLabel)}</small>
          </div>
          <div class="version-actions">
            <button class="tiny-button" type="button" data-view-version="${index}">查看</button>
            <button class="tiny-button" type="button" data-restore-version="${index}">回退</button>
          </div>
        </div>`;
      })
      .join("");

    els.skillVersionList.querySelectorAll("[data-view-version]").forEach((button) => {
      button.addEventListener("click", () => showSkillVersion(Number(button.dataset.viewVersion)));
    });
    els.skillVersionList.querySelectorAll("[data-restore-version]").forEach((button) => {
      button.addEventListener("click", () => restoreSkillVersion(Number(button.dataset.restoreVersion)));
    });
    showSkillVersion(versions.length - 1);
  }

  function showSkillVersion(index) {
    const versions = ui.editingStyle?.versions || [];
    const version = versions[index];
    if (!version) return;
    document.querySelectorAll("[data-version-item]").forEach((item) => {
      item.classList.toggle("active", Number(item.dataset.versionItem) === index);
    });
    const previous = versions[index - 1] || null;
    const sourceNames = (version.sourceExamples || []).map((item) => item.name).filter(Boolean);
    const lines = [
      `版本：v${version.version || index + 1}`,
      `生成时间：${formatLocalDate(version.createdAt)}`,
      `训练文本：${sourceNames.length ? sourceNames.join("、") : "未记录"}`,
      "",
      `单篇解析字数：${(version.analysis || "").length}`,
      `多篇聚合字数：${(version.aggregation || "").length}`,
      `说明.md字数：${(version.summary || "").length}`,
      `规则 JSON 字数：${(version.skillJson || "").length}`,
    ];
    if (previous) {
      lines.push(
        "",
        "与上一版对比：",
        `说明.md：${describeLengthChange((version.summary || "").length - (previous.summary || "").length)}`,
        `规则 JSON：${describeLengthChange((version.skillJson || "").length - (previous.skillJson || "").length)}`,
        `训练文本：${(version.sourceExamples || []).length} / ${(previous.sourceExamples || []).length} 份`,
      );
    }
    if (version.aggregation) {
      lines.push("", "聚合摘要：", version.aggregation.slice(0, 1200));
    }
    els.skillVersionDiff.textContent = lines.join("\n");
  }

  function restoreSkillVersion(index, confirmRestore = (message) => window.confirm(message)) {
    const version = ui.editingStyle?.versions?.[index];
    if (!version) return false;
    const ok = confirmRestore(`回退到 v${version.version || index + 1}？`);
    if (!ok) return false;
    ui.editingStyle.analyses = version.analyses || ui.editingStyle.analyses || [];
    ui.editingStyle.analysis = version.analysis || "";
    ui.editingStyle.aggregationData = version.aggregationData || ui.editingStyle.aggregationData || null;
    ui.editingStyle.aggregation = version.aggregation || "";
    ui.editingStyle.summary = version.summary || "";
    ui.editingStyle.skillJson = version.skillJson || ui.editingStyle.skillJson;
    ui.editingStyle.qualityReport = version.qualityReport || ui.editingStyle.qualityReport || null;
    ui.editingStyle.lastTest = {
      id: createId(),
      createdAt: now(),
      prompt: "版本回退携带的测试结果",
      result: version.testDoc || "",
      report: version.testReport || "",
    };
    ui.editingStyle.updatedAt = now();
    commitSkillToState(ui.editingStyle);
    renderStyleEditor();
    switchSkillDetailTab("versions");
    showSkillVersion(index);
    toast(`已回退到 v${version.version || index + 1}，当前执笔人已保存到：${getSkillLocation(ui.editingStyle)}`);
    return true;
  }

  function renderSkillTest() {
    if (!els.skillTestPrompt || !ui.editingStyle) return;
    const lastTest = ui.editingStyle.lastTest || {};
    els.skillTestPrompt.value = lastTest.prompt || "";
    els.skillTestResult.value = lastTest.result || "";
    els.skillTestReport.value = formatPossiblyJson(lastTest.report || "");
    els.skillFeedbackInput.value = "";
  }

  function renderStyleList() {
    if (state.styles.length === 0) {
      els.styleList.innerHTML = '<div class="empty-state">暂无执笔人</div>';
      return;
    }
    els.styleList.innerHTML = state.styles
      .map(
        (style) => `<div class="style-item ${ui.editingStyle?.id === style.id ? "active" : ""}">
          <button class="style-select-button" type="button" data-style-id="${style.id}">
            <span class="style-main">
              <i data-lucide="book-open-text"></i>
              <span>${escapeHtml(style.name)}</span>
            </span>
            <span class="skill-handle">@${escapeHtml(style.handle)}</span>
            <span>${escapeHtml(style.category || "自定义")} · ${isSkillEnabled(style) ? "已启用" : "未启用"}</span>
          </button>
          <button class="tiny-button" type="button" title="查看详情" data-skill-detail="${style.id}">
            <i data-lucide="panel-right-open"></i>
          </button>
        </div>`,
      )
      .join("");
    els.styleList.querySelectorAll("[data-style-id]").forEach((button) => {
      button.addEventListener("click", () => {
        ui.editingStyle = clone(state.styles.find((style) => style.id === button.dataset.styleId));
        renderStyleEditor();
        renderStyleList();
      });
    });
    els.styleList.querySelectorAll("[data-skill-detail]").forEach((button) => {
      button.addEventListener("click", () => openSkillDetail(button.dataset.skillDetail));
    });
    if (window.lucide) window.lucide.createIcons();
  }

  function openSkillDetail(skillId) {
    const skill = state.styles.find((item) => item.id === skillId);
    if (!skill) return;
    ui.editingStyle = clone(skill);
    renderStyleEditor();
    renderStyleList();
    els.skillDetailTitle.textContent = skill.name || "执笔人详情";
    els.skillDetailMeta.textContent = `@${skill.handle || normalizeHandle(skill.name)} · ${skill.examples?.length || 0} 份训练文本 · ${skill.versions?.length || 0} 个版本`;
    els.skillDetailMenu.hidden = false;
    switchSkillDetailTab("training");
    if (window.lucide) window.lucide.createIcons();
  }

  function hideSkillDetailMenu() {
    els.skillDetailMenu.hidden = true;
  }

  function switchSkillDetailTab(tabName) {
    document.querySelectorAll(".detail-tab").forEach((button) => {
      button.classList.toggle("active", button.dataset.detailTab === tabName);
    });
    document.querySelectorAll(".detail-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === `${tabName}DetailPanel`);
    });
  }

  return {
    renderStyleSelect,
    renderStyleEditor,
    renderStyleExamples,
    renderSkillQualityReport,
    renderSkillVersions,
    showSkillVersion,
    restoreSkillVersion,
    renderSkillTest,
    renderStyleList,
    openSkillDetail,
    hideSkillDetailMenu,
    switchSkillDetailTab,
  };
}
