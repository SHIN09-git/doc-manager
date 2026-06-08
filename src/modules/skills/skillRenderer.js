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
import { buildSkillVersionDiff } from "./skillVersionDiff.js";

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
    onNewSkill = () => {},
    onEditSkill = () => {},
    onRetrainSkill = () => {},
    onInvokeSkill = () => {},
    onToggleSkillEnabled = () => {},
    onCopySkillHandle = () => {},
    onOpenSkillDetail = null,
    onTestSkill = () => {},
    onExportSkill = () => {},
    onDeleteSkill = () => {},
    onRetrySkill = () => {},
    onCancelSkillBuild = () => {},
  } = deps;

  function renderStyleSelect() {
    const enabledStyles = state.styles.filter(isSkillEnabled);
    els.styleSelect.innerHTML = [
      '<option value="">无默认执笔人</option>',
      ...enabledStyles.map((style) => `<option value="${escapeHtml(style.id)}">@${escapeHtml(style.handle)} · ${escapeHtml(style.name)}</option>`),
    ].join("");
    els.editorSkillSelect.innerHTML = [
      '<option value="">不指定执笔人</option>',
      ...enabledStyles.map((style) => `<option value="${escapeHtml(style.id)}">@${escapeHtml(style.handle)}</option>`),
    ].join("");
  }

  function renderStyleEditor() {
    if (!ui.editingStyle) {
      ui.editingStyle = clone(state.styles[0] || createEmptyStyle());
    }
    if (els.styleNameInput) els.styleNameInput.value = ui.editingStyle.name || "";
    if (els.skillHandleInput) els.skillHandleInput.value = ui.editingStyle.handle || normalizeHandle(ui.editingStyle.name);
    if (els.skillCategorySelect) {
      const category = ui.editingStyle.category || "自定义";
      const builtInCategories = ["公文写作", "文风格式", "材料整理", "段落改写", "自定义"];
      els.skillCategorySelect.value = builtInCategories.includes(category) ? category : "自定义";
      if (els.skillCustomCategoryInput) {
        els.skillCustomCategoryInput.value = builtInCategories.includes(category) ? "" : category;
        if (els.skillCustomCategoryField) {
          els.skillCustomCategoryField.hidden = els.skillCategorySelect.value !== "自定义";
        }
      }
    }
    if (els.skillDescriptionInput) els.skillDescriptionInput.value = ui.editingStyle.description || "";
    if (els.skillEnabledInput) els.skillEnabledInput.checked = ui.editingStyle.enabled !== false;
    if (els.skillAnalysisInput) els.skillAnalysisInput.value = ui.editingStyle.analysis || "";
    if (els.skillAggregationInput) els.skillAggregationInput.value = ui.editingStyle.aggregation || "";
    if (els.styleSummaryInput) {
      const keepDraft = Boolean(ui.skillMarkdownDirty && ui.skillMarkdownDirtySkillId === ui.editingStyle.id);
      if (!keepDraft) els.styleSummaryInput.value = ui.editingStyle.summary || "";
    }
    if (els.skillJsonInput) els.skillJsonInput.value = ui.editingStyle.skillJson || "";
    renderSkillQualityReport();
    renderStyleExamples();
    renderSkillDetailExamples();
    renderSkillVersions();
    renderSkillTest();
  }

  function renderStyleExamples() {
    renderExampleList(els.styleExampleList, ui.editingStyle, {
      emptyText: "尚未添加训练样本",
      removable: true,
      onRemove: (index) => {
        ui.editingStyle.examples.splice(index, 1);
        renderStyleExamples();
      },
    });
  }

  function renderSkillDetailExamples() {
    renderExampleList(els.skillDetailExampleList, ui.editingStyle, {
      emptyText: "尚未记录训练文本",
      removable: true,
      onRemove: (index) => {
        ui.editingStyle.examples.splice(index, 1);
        commitSkillToState(ui.editingStyle);
        renderStyleEditor();
        renderStyleList();
        toast("已移除该训练文本");
      },
    });
  }

  function renderExampleList(target, skill, options = {}) {
    if (!target) return;
    const examples = skill?.examples || [];
    const { emptyText = "暂无文本", removable = false, onRemove = () => {} } = options;
    if (examples.length === 0) {
      target.innerHTML = `<div class="empty-state">${escapeHtml(emptyText)}</div>`;
      return;
    }
    target.innerHTML = examples
      .map(
        (example, index) => `<div class="example-item">
          <div class="example-title">
            <span>${escapeHtml(example.name)}</span>
            ${
              removable
                ? `<button class="tiny-button danger-text" type="button" title="移除" data-remove-example="${index}"><i data-lucide="x"></i></button>`
                : ""
            }
          </div>
          <div class="example-size">${Number(example.text?.length || example.originalLength || 0)} 字符</div>
          <details class="example-preview">
            <summary>预览文本</summary>
            <pre>${escapeHtml(String(example.text || "").slice(0, 2000))}${String(example.text || "").length > 2000 ? "\n..." : ""}</pre>
          </details>
        </div>`,
      )
      .join("");
    target.querySelectorAll("[data-remove-example]").forEach((button) => {
      button.addEventListener("click", () => onRemove(Number(button.dataset.removeExample)));
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
      `强规则：${countStrongRules(style)} 条`,
      `候选规则：${countCandidateRules(style)} 条`,
      `冲突提示：${(aggregationData.conflicts || report.conflicts || []).length || 0} 条`,
      `个案排除：${countCaseExclusions(style)} 条`,
      `隐私过滤：${countPrivacyFindings(style)} 条`,
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
      const structuredDiff = buildSkillVersionDiff(version, previous);
      lines.push(
        "",
        "与上一版对比：",
        `说明.md：${describeLengthChange((version.summary || "").length - (previous.summary || "").length)}`,
        `规则 JSON：${describeLengthChange((version.skillJson || "").length - (previous.skillJson || "").length)}`,
        `训练文本：${(version.sourceExamples || []).length} / ${(previous.sourceExamples || []).length} 份`,
      );
      if (structuredDiff.text) {
        lines.push("", structuredDiff.text);
      }
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
    ui.editingStyle.status = "ready";
    ui.editingStyle.lastBuildError = "";
    ui.editingStyle.lastBuildAt = now();
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
    renderStyleList();
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
    if (!els.styleList) return;
    const visibleStyles = getFilteredStyles();
    if (state.styles.length === 0) {
      els.styleList.innerHTML = renderEmptySkillCard("还没有执笔人", "拖入 1-3 篇同类正式文档训练你的第一个执笔人");
      bindGridEvents();
      if (window.lucide) window.lucide.createIcons();
      return;
    }
    if (visibleStyles.length === 0) {
      els.styleList.innerHTML = renderEmptySkillCard("没有匹配的执笔人", "调整筛选条件后再查看");
      bindGridEvents();
      if (window.lucide) window.lucide.createIcons();
      return;
    }
    els.styleList.innerHTML = visibleStyles.map(renderSkillCard).join("");
    bindGridEvents();
    if (window.lucide) window.lucide.createIcons();
  }

  function getFilteredStyles() {
    const category = els.skillCategoryFilter?.value || "all";
    const enabledOnly = Boolean(els.skillEnabledOnlyInput?.checked);
    const keyword = String(els.skillSearchInput?.value || "").trim().toLowerCase();
    return state.styles.filter((style) => {
      if (category !== "all" && (style.category || "自定义") !== category) return false;
      if (enabledOnly && !isSkillEnabled(style)) return false;
      if (!keyword) return true;
      const haystack = [style.name, style.handle, style.description, style.category].join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }

  function renderEmptySkillCard(title, description) {
    return `<article class="skill-empty-card">
      <div class="skill-avatar"><i data-lucide="book-open-text"></i></div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
      <button class="primary-action" type="button" data-new-skill>
        <i data-lucide="plus"></i>
        新建执笔人
      </button>
    </article>`;
  }

  function renderSkillCard(style) {
    const status = getSkillStatus(style);
    const result = style.lastBuildResult || {};
    const buildProgress = style.buildProgress || {};
    const isSelected = ui.selectedSkillCardId === style.id;
    const isExpanded = isSelected || status.key === "building" || status.key === "failed";
    const skillId = escapeHtml(style.id);
    if (!isExpanded) {
      return `<article class="skill-card is-collapsed is-${status.key}" data-skill-card="${skillId}" tabindex="0" aria-expanded="false">
        <div class="skill-card-compact">
          <div class="skill-card-title">
            <span class="skill-avatar"><i data-lucide="book-open-text"></i></span>
            <h3>${escapeHtml(style.name || "未命名执笔人")}</h3>
          </div>
          <button class="primary-action" type="button" data-invoke-skill="${skillId}">
            <i data-lucide="at-sign"></i>
            调用
          </button>
        </div>
      </article>`;
    }
    return `<article class="skill-card is-expanded ${isSelected ? "is-active" : ""} is-${status.key}" data-skill-card="${skillId}" tabindex="0" aria-expanded="true">
      <div class="skill-card-head">
        <div class="skill-card-title">
          <span class="skill-avatar"><i data-lucide="book-open-text"></i></span>
          <div>
            <h3>${escapeHtml(style.name || "未命名执笔人")}</h3>
            <button class="skill-handle-copy" type="button" data-copy-skill-handle="${skillId}" title="复制调用名">@${escapeHtml(style.handle || normalizeHandle(style.name))}</button>
          </div>
        </div>
        <span class="skill-status-badge ${status.className}">${status.label}</span>
      </div>
      <div class="skill-card-tags">
        <span>${escapeHtml(style.category || "自定义")}</span>
      </div>
      <p class="skill-card-desc">${escapeHtml(getSkillDescription(style))}</p>
      <div class="skill-card-meta">
        <span>${(style.examples || []).length} 份样本</span>
        <span>${(style.versions || []).length} 个版本</span>
        <span>${escapeHtml(formatSkillDate(style.lastBuildAt || style.updatedAt || style.createdAt))}</span>
      </div>
      ${status.key === "building" ? renderBuildProgress(style, buildProgress) : ""}
      ${status.key === "failed" ? renderBuildFailure(style) : renderBuildResult(style, result)}
      <div class="skill-card-actions">
        <button class="primary-action" type="button" data-invoke-skill="${skillId}">
          <i data-lucide="at-sign"></i>
          调用
        </button>
        <button type="button" data-edit-skill="${skillId}">编辑</button>
        <button type="button" data-retrain-skill="${skillId}">重训</button>
        <label class="inline-check skill-toggle">
          <input type="checkbox" data-toggle-skill="${skillId}" ${style.enabled !== false ? "checked" : ""} />
          <span>启用</span>
        </label>
        <details class="skill-more">
          <summary title="更多操作"><i data-lucide="more-horizontal"></i></summary>
          <div class="skill-more-menu">
            <button type="button" data-skill-detail="${skillId}">查看详情</button>
            <button type="button" data-skill-test="${skillId}">测试</button>
            <button type="button" data-skill-export="${skillId}">导出该执笔人</button>
            <button class="danger-text" type="button" data-skill-delete="${skillId}">删除</button>
          </div>
        </details>
      </div>
    </article>`;
  }

  function renderBuildProgress(style, progress) {
    const value = Math.max(0, Math.min(100, Number(progress.progress) || 8));
    const skillId = escapeHtml(style.id);
    return `<div class="skill-build-progress" role="status" aria-live="polite">
      <div class="skill-build-progress-head">
        <span>${escapeHtml(progress.message || "正在生成执笔人")}</span>
        <button class="tiny-button" type="button" data-cancel-skill-build="${skillId}">取消</button>
      </div>
      <div class="skill-progress-track"><span style="width: ${value}%"></span></div>
    </div>`;
  }

  function renderBuildFailure(style) {
    const skillId = escapeHtml(style.id);
    return `<div class="skill-build-result is-failed">
      <span>生成失败：${escapeHtml(style.lastBuildError || "请稍后重试")}</span>
      <button class="tiny-button" type="button" data-retry-skill="${skillId}">重试</button>
      <button class="tiny-button" type="button" data-skill-detail="${skillId}">查看日志</button>
    </div>`;
  }

  function renderBuildResult(style, result) {
    if (!result.version && !style.lastBuildAt) return "";
    return `<div class="skill-build-result">
      已生成${result.version ? ` v${escapeHtml(String(result.version))}` : ""}，
      强规则 ${Number(result.strongRuleCount || countStrongRules(style))} 条 ·
      候选 ${Number(result.candidateRuleCount || countCandidateRules(style))} 条
    </div>`;
  }

  function bindGridEvents() {
    els.styleList.querySelectorAll("[data-new-skill]").forEach((button) => {
      button.addEventListener("click", () => onNewSkill());
    });
    els.styleList.querySelectorAll("[data-skill-card]").forEach((card) => {
      card.addEventListener("click", (event) => {
        if (event.target.closest("button, input, label, details, summary")) return;
        selectSkillCard(card.dataset.skillCard);
      });
      card.addEventListener("keydown", (event) => {
        if (event.target !== card || !["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        selectSkillCard(card.dataset.skillCard);
      });
    });
    bindButton("[data-copy-skill-handle]", (button) => onCopySkillHandle(button.dataset.copySkillHandle));
    bindButton("[data-invoke-skill]", (button) => onInvokeSkill(button.dataset.invokeSkill));
    bindButton("[data-edit-skill]", (button) => onEditSkill(button.dataset.editSkill));
    bindButton("[data-retrain-skill]", (button) => onRetrainSkill(button.dataset.retrainSkill));
    bindButton("[data-skill-detail]", (button) => {
      const opener = onOpenSkillDetail || openSkillDetail;
      opener(button.dataset.skillDetail);
    });
    bindButton("[data-skill-test]", (button) => onTestSkill(button.dataset.skillTest));
    bindButton("[data-skill-export]", (button) => onExportSkill(button.dataset.skillExport));
    bindButton("[data-skill-delete]", (button) => onDeleteSkill(button.dataset.skillDelete));
    bindButton("[data-retry-skill]", (button) => onRetrySkill(button.dataset.retrySkill));
    bindButton("[data-cancel-skill-build]", (button) => onCancelSkillBuild(button.dataset.cancelSkillBuild));
    els.styleList.querySelectorAll("[data-toggle-skill]").forEach((input) => {
      input.addEventListener("change", () => onToggleSkillEnabled(input.dataset.toggleSkill, input.checked));
    });
  }

  function selectSkillCard(skillId) {
    const skill = state.styles.find((item) => item.id === skillId);
    if (!skill) return;
    ui.selectedSkillCardId = skill.id;
    ui.editingStyle = clone(skill);
    renderStyleEditor();
    renderStyleList();
  }

  function bindButton(selector, callback) {
    els.styleList.querySelectorAll(selector).forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        callback(button);
      });
    });
  }

  function getSkillStatus(style) {
    if (style.status === "building") return { key: "building", label: "生成中", className: "is-building" };
    if (style.status === "failed") return { key: "failed", label: "生成失败", className: "is-failed" };
    const hasTraining = (style.examples || []).length > 0 || (style.versions || []).length > 0 || style.summary;
    if (!hasTraining) return { key: "pending", label: "待训练", className: "is-pending" };
    return style.enabled === false
      ? { key: "disabled", label: "未启用", className: "is-disabled" }
      : { key: "ready", label: "已启用", className: "is-ready" };
  }

  function getSkillConfidence(style) {
    const parsed = parseSkillJson(style.skillJson);
    const confidence = style.lastBuildResult?.confidence ||
      style.qualityReport?.confidence ||
      style.aggregationData?.overall_confidence ||
      parsed.confidence ||
      "low";
    return ["low", "medium", "high"].includes(confidence) ? confidence : "low";
  }

  function getSkillDescription(style) {
    const parsed = parseSkillJson(style.skillJson);
    return (
      style.description ||
      parsed.description ||
      parsed.concise_instruction ||
      parsed.trigger_description ||
      `${style.category || "自定义"}执笔人，用于按训练样本控制文本结构、文风和格式。`
    );
  }

  function countStrongRules(style) {
    return Number(style.lastBuildResult?.strongRuleCount || 0) ||
      (style.aggregationData?.strong_rules || style.qualityReport?.strong_rules || []).length ||
      (parseSkillJson(style.skillJson).style_rules?.must || []).length ||
      0;
  }

  function countCandidateRules(style) {
    const parsed = parseSkillJson(style.skillJson);
    return Number(style.lastBuildResult?.candidateRuleCount || 0) ||
      (style.aggregationData?.candidate_rules || style.qualityReport?.candidate_rules || []).length ||
      (parsed.style_rules?.recommended || []).length + (parsed.style_rules?.optional || []).length ||
      0;
  }

  function countPrivacyFindings(style) {
    return Number(style.lastBuildResult?.privacyCount || 0) ||
      (style.aggregationData?.privacy_findings || style.qualityReport?.privacy_filter_notes || []).length ||
      0;
  }

  function countCaseExclusions(style) {
    return Number(style.lastBuildResult?.caseSpecificCount || 0) ||
      (style.aggregationData?.case_specific_exclusions || style.qualityReport?.excluded_case_specific_items || []).length ||
      0;
  }

  function parseSkillJson(value) {
    try {
      return JSON.parse(value || "{}");
    } catch {
      return {};
    }
  }

  function formatSkillDate(value) {
    if (!value) return "未更新";
    const text = formatLocalDate(value);
    return text || "未更新";
  }

  function openSkillDetail(skillId) {
    const skill = state.styles.find((item) => item.id === skillId);
    if (!skill) return;
    ui.selectedSkillCardId = skill.id;
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
    renderSkillDetailExamples,
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
