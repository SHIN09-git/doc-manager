export function createPptController({
  els,
  ui,
  state,
  defaultSystemPrompt,
  toast,
  cancelActiveTask,
  withCancelableTask,
  withLoading,
  withProgress,
  throwIfTaskAborted,
  setupFileDrop,
  getCurrentDoc,
  resolveInvokedSkills,
  formatSkillPrompt,
  callAiJsonWithRepair,
  buildGuizangPptPrompt,
  normalizePptSpec,
  parseGuizangPptSpec,
  renderPptSpecPreview,
  inspectPptSpec,
  formatPptQualityReport,
  createPptxBlob,
  sanitizeFileName,
  getDownloadLocation,
  downloadBlob,
  filterImportableFilesBySize,
  confirmLargeImport,
  canImportFile,
  readImportFileText,
  buildUnsupportedFileMessage,
  getFocusableElements,
  savePptStyleAsSkill,
  pptStyleOptions,
  escapeHtml,
}) {
  function bindEvents() {
    setupFileDrop(els.pptPanel, importPptPromptFiles);
    setupFileDrop(els.pptPromptInput, importPptPromptFiles);
    setupFileDrop(els.pptDropZone, importPptPromptFiles);
    els.generatePptBtn?.addEventListener("click", generatePptDeck);
    els.downloadPptBtn?.addEventListener("click", downloadPptDeck);
    els.savePptStyleBtn?.addEventListener("click", savePptStyleAsSkill);
    els.pptStyleSelect?.addEventListener("change", updatePptStyleControls);
    els.pptSlideCountSelect?.addEventListener("input", () => {
      if (ui.pptDeckSpec) renderPptQualityReport(ui.pptDeckSpec);
    });
    els.pptAutoSlideCountInput?.addEventListener("change", () => {
      updatePptSlideCountControls();
      if (ui.pptDeckSpec) renderPptQualityReport(ui.pptDeckSpec);
    });
    els.pptOutput?.addEventListener("input", handlePptOutputInput);
    els.pptSlideEditor?.addEventListener("input", handlePptSlideEditorInput);
    els.pptSlideEditor?.addEventListener("change", handlePptSlideEditorInput);
    els.openPptPreviewBtn?.addEventListener("click", openPptPreviewModal);
    els.closePptPreviewBtn?.addEventListener("click", closePptPreviewModal);
    els.pptPreviewOverlay?.addEventListener("click", (event) => {
      if (event.target === els.pptPreviewOverlay) closePptPreviewModal();
    });
    els.pptPreviewOverlay?.addEventListener("keydown", handlePptPreviewModalKeydown);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && els.pptPreviewOverlay && !els.pptPreviewOverlay.hidden) {
        closePptPreviewModal();
      }
    });
    updatePptStyleControls();
    updatePptSlideCountControls();
  }

  function hydratePptStyleSelect() {
    if (!els.pptStyleSelect) return;
    const current = els.pptStyleSelect.value || "magazine";
    const groups = [...new Set(pptStyleOptions.map((option) => option.group))];
    els.pptStyleSelect.innerHTML = groups
      .map((group) => {
        const options = pptStyleOptions
          .filter((option) => option.group === group)
          .map(
            (option) =>
              `<option value="${option.id}" title="${escapeHtml(option.description)}">${escapeHtml(option.name)}</option>`,
          )
          .join("");
        return `<optgroup label="${escapeHtml(group)}">${options}</optgroup>`;
      })
      .join("");
    els.pptStyleSelect.value = pptStyleOptions.some((option) => option.id === current) ? current : "magazine";
    updatePptStyleControls();
  }

  async function generatePptDeck() {
    if (cancelActiveTask("ppt-generation")) return;
    const currentDoc = getCurrentDoc();
    const title = els.pptTitleInput.value.trim() || els.titleInput.value.trim() || currentDoc?.title || "演示稿";
    const pptOptions = getPptOptions();
    const material =
      els.pptPromptInput.value.trim() ||
      [els.titleInput.value.trim(), els.contentEditor.value.trim()].filter(Boolean).join("\n\n");
    if (!material) {
      toast("请输入 PPT 内容要求，或先打开一篇可作为素材的文档", "warn");
      return;
    }

    await withCancelableTask({
      key: "ppt-generation",
      button: els.generatePptBtn,
      busyText: "生成中",
      progressMessage: "AI 正在生成原生 PPTX 草稿",
      cancelToast: "已取消本次 PPT 生成",
    }, async ({ progress, signal }) => {
      progress.update("步骤 1/3：正在整理归藏 PPTX 提示词", 20);
      const invokedSkills = resolveInvokedSkills(material, "");
      const prompt = buildGuizangPptPrompt({
        title,
        ...pptOptions,
        content: material,
        skillPrompt: formatSkillPrompt(invokedSkills),
      });
      throwIfTaskAborted(signal);
      progress.update("步骤 2/3：正在请求 AI 生成幻灯片结构", 44);
      const output = await callAiJsonWithRepair([
        { role: "system", content: state.settings.systemPrompt || defaultSystemPrompt },
        { role: "user", content: prompt },
      ], "PPT 结构 JSON", { signal });
      throwIfTaskAborted(signal);
      progress.update("步骤 3/3：正在渲染结构预览", 74);
      const spec = normalizePptSpec(output, {
        title,
        ...pptOptions,
        content: material,
      });
      ui.pptDeckSpec = spec;
      ui.pptDraft = JSON.stringify(spec, null, 2);
      els.pptOutput.value = ui.pptDraft;
      renderPptPreview(spec);
      renderPptSlideEditor(spec);
      renderPptQualityReport(spec);
      toast(`已生成 PPTX 草稿，点击“下载 PPTX”保存到：${getDownloadLocation(`${sanitizeFileName(title)}.pptx`)}`);
    });
  }

  async function importPptPromptFiles(files) {
    if (!files || files.length === 0) return;
    const { accepted: importFiles, skipped: sizeSkipped } = await filterImportableFilesBySize(files, {
      confirm: confirmLargeImport,
      notify: toast,
    });
    if (importFiles.length === 0) return;

    let importedCount = 0;
    const skippedFiles = [];
    const sections = [];

    await withProgress(`正在导入 ${importFiles.length} 个 PPT 素材`, async (progress) => {
      for (const [index, file] of importFiles.entries()) {
        progress.update(`正在读取 ${file.name}`, Math.round((index / importFiles.length) * 78) + 10);
        if (!canImportFile(file.name)) {
          skippedFiles.push(file.name);
          continue;
        }
        try {
          const text = await readImportFileText(file);
          sections.push(`# ${file.name}\n\n${text}`);
          importedCount += 1;
        } catch (error) {
          skippedFiles.push(file.name);
          console.warn("导入 PPT 素材失败", file.name, error);
        }
      }
      progress.update("正在写入 PPT 内容区", 92);
    });

    if (importedCount === 0 && skippedFiles.length > 0) {
      toast(`未添加 PPT 素材：${buildUnsupportedFileMessage(skippedFiles[0])}`, "warn");
      return;
    }

    const existing = els.pptPromptInput.value.trim();
    const addition = sections.join("\n\n---\n\n");
    els.pptPromptInput.value = [existing, addition].filter(Boolean).join("\n\n---\n\n");
    els.pptPromptInput.focus();
    const skippedCount = skippedFiles.length + sizeSkipped.length;
    toast(`已添加 ${importedCount} 份素材到 PPT 内容区${skippedCount ? `，已跳过 ${skippedCount} 个暂不支持、过大或读取失败的文件` : ""}`);
  }

  async function downloadPptDeck() {
    const jsonText = els.pptOutput.value.trim() || ui.pptDraft;
    if (!jsonText && !ui.pptDeckSpec) {
      toast("请先生成 PPTX 草稿", "warn");
      return;
    }
    await withLoading(els.downloadPptBtn, "打包中", async () => withProgress("正在打包原生 PPTX", async (progress) => {
      progress.update("正在读取幻灯片结构", 28);
      const spec = jsonText
        ? parseGuizangPptSpec(jsonText, {
            title: els.pptTitleInput.value.trim(),
            ...getPptOptions(),
          })
        : ui.pptDeckSpec;
      const qualityReport = renderPptQualityReport(spec);
      if (qualityReport?.errors?.length) {
        toast("PPTX 结构自检发现需要处理的问题，仍将按当前结构导出。", "warn");
      }
      progress.update("正在生成 PowerPoint 文件", 68);
      const fileName = `${sanitizeFileName(spec.title || els.pptTitleInput.value || "演示稿")}.pptx`;
      const blob = await createPptxBlob(spec);
      downloadBlob(fileName, blob, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
      progress.update("已完成", 100);
      toast(`已导出原生 PPTX 到：${getDownloadLocation(fileName)}`);
    }));
  }

  function handlePptOutputInput() {
    ui.pptDraft = els.pptOutput.value;
    try {
      ui.pptDeckSpec = parseGuizangPptSpec(ui.pptDraft, {
        title: els.pptTitleInput.value.trim(),
        ...getPptOptions(),
      });
      renderPptPreview(ui.pptDeckSpec);
      renderPptSlideEditor(ui.pptDeckSpec);
      renderPptQualityReport(ui.pptDeckSpec);
    } catch {
      // Allow users to keep editing partial JSON without interrupting input.
    }
  }

  function renderPptPreview(spec) {
    const html = spec ? renderPptSpecPreview(spec) : "";
    if (els.pptPreview) els.pptPreview.srcdoc = html;
    if (els.pptPreviewModalFrame) els.pptPreviewModalFrame.srcdoc = html;
  }

  function renderPptSlideEditor(spec) {
    if (!els.pptSlideEditor) return;
    const slides = Array.isArray(spec?.slides) ? spec.slides : [];
    if (!slides.length) {
      els.pptSlideEditor.innerHTML =
        `<div class="empty-state">生成或粘贴 PPT 结构后，可以在这里逐页编辑标题、正文、要点和备注。</div>`;
      return;
    }
    els.pptSlideEditor.innerHTML = slides
      .map((slide, index) => {
        const typeOptions = getPptSlideTypeOptions(slide.type);
        return `<article class="ppt-slide-edit-card" data-ppt-slide-card="${index}">
          <div class="ppt-slide-edit-head">
            <strong>第 ${index + 1} 页</strong>
            <select data-ppt-slide-index="${index}" data-ppt-slide-field="type" aria-label="第 ${index + 1} 页版式">
              ${typeOptions}
            </select>
          </div>
          <label>
            <span>标题</span>
            <input type="text" data-ppt-slide-index="${index}" data-ppt-slide-field="title" value="${escapeHtml(slide.title || "")}" />
          </label>
          <label>
            <span>正文</span>
            <textarea rows="3" data-ppt-slide-index="${index}" data-ppt-slide-field="body">${escapeHtml(slide.body || "")}</textarea>
          </label>
          <label>
            <span>要点，每行一条</span>
            <textarea rows="3" data-ppt-slide-index="${index}" data-ppt-slide-field="bullets">${escapeHtml((slide.bullets || []).join("\n"))}</textarea>
          </label>
          <label>
            <span>演讲备注</span>
            <textarea rows="2" data-ppt-slide-index="${index}" data-ppt-slide-field="notes">${escapeHtml(slide.notes || "")}</textarea>
          </label>
        </article>`;
      })
      .join("");
  }

  function getPptSlideTypeOptions(currentType) {
    return [
      ["cover", "封面"],
      ["section", "章节"],
      ["content", "正文"],
      ["bullets", "要点"],
      ["timeline", "时间线"],
      ["comparison", "对比"],
      ["quote", "引语"],
      ["data", "数据"],
      ["roadmap", "路线图"],
      ["orgchart", "组织结构"],
      ["imageText", "图文"],
      ["appendix", "附录"],
      ["closing", "结束页"],
    ]
      .map(([value, label]) => {
        const selected = value === currentType ? " selected" : "";
        return `<option value="${value}"${selected}>${label}</option>`;
      })
      .join("");
  }

  function handlePptSlideEditorInput(event) {
    const control = event.target.closest?.("[data-ppt-slide-field]");
    if (!control || !ui.pptDeckSpec) return;
    const index = Number.parseInt(control.dataset.pptSlideIndex, 10);
    if (!Number.isFinite(index) || !ui.pptDeckSpec.slides?.[index]) return;
    const field = control.dataset.pptSlideField;
    const slides = ui.pptDeckSpec.slides.map((slide) => ({
      ...slide,
      bullets: Array.isArray(slide.bullets) ? [...slide.bullets] : [],
      table: slide.table ? { ...slide.table } : null,
    }));
    const slide = slides[index];
    const value = control.value;
    if (field === "bullets") {
      slide.bullets = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    } else if (["type", "title", "body", "notes"].includes(field)) {
      slide[field] = value;
    }
    const nextSpec = normalizePptSpec({ ...ui.pptDeckSpec, slides }, getPptOptions());
    ui.pptDeckSpec = nextSpec;
    ui.pptDraft = JSON.stringify(nextSpec, null, 2);
    if (els.pptOutput) els.pptOutput.value = ui.pptDraft;
    renderPptPreview(nextSpec);
    renderPptQualityReport(nextSpec);
  }

  function openPptPreviewModal() {
    if (!ui.pptDeckSpec) {
      toast("请先生成或粘贴一份可识别的 PPT 结构，再打开放大预览。", "warn");
      return;
    }
    ui.pptPreviewReturnFocus = document.activeElement;
    renderPptPreview(ui.pptDeckSpec);
    els.pptPreviewOverlay.hidden = false;
    document.body.classList.add("modal-open");
    window.setTimeout(() => {
      const target = els.closePptPreviewBtn || els.pptPreviewOverlay.querySelector(".preview-modal");
      target?.focus?.();
    }, 0);
  }

  function closePptPreviewModal() {
    if (!els.pptPreviewOverlay || els.pptPreviewOverlay.hidden) return;
    els.pptPreviewOverlay.hidden = true;
    document.body.classList.remove("modal-open");
    const returnTarget = ui.pptPreviewReturnFocus?.isConnected ? ui.pptPreviewReturnFocus : els.openPptPreviewBtn;
    ui.pptPreviewReturnFocus = null;
    returnTarget?.focus?.();
  }

  function handlePptPreviewModalKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closePptPreviewModal();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = getFocusableElements(els.pptPreviewOverlay);
    if (focusable.length === 0) {
      event.preventDefault();
      els.pptPreviewOverlay.querySelector(".preview-modal")?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function getPptOptions() {
    const autoSlideCount = Boolean(els.pptAutoSlideCountInput?.checked);
    const slideCount = autoSlideCount ? null : normalizePptSlideCount(els.pptSlideCountSelect.value);
    return {
      style: els.pptStyleSelect.value || "magazine",
      styleDescription: els.pptCustomStyleInput.value.trim(),
      autoSlideCount,
      slideCount,
    };
  }

  function normalizePptSlideCount(value) {
    const count = Number.parseInt(value, 10);
    const normalized = Number.isFinite(count) ? Math.min(Math.max(count, 1), 40) : 12;
    if (els.pptSlideCountSelect && String(els.pptSlideCountSelect.value) !== String(normalized)) {
      els.pptSlideCountSelect.value = String(normalized);
    }
    return normalized;
  }

  function updatePptSlideCountControls() {
    const autoSlideCount = Boolean(els.pptAutoSlideCountInput?.checked);
    els.pptSlideCountSelect.disabled = autoSlideCount;
    els.pptSlideCountSelect.title = autoSlideCount
      ? "已启用自动页数，AI 会根据素材信息量自行决定页数"
      : "手动指定 PPT 页数";
  }

  function updatePptStyleControls() {
    const isCustom = els.pptStyleSelect.value === "custom";
    els.pptCustomStyleField.classList.toggle("active", isCustom);
    els.pptCustomStyleInput.placeholder = isCustom
      ? "描述你希望复用的 PPT 风格、版式节奏、颜色倾向、适用场景和禁忌。"
      : "可选：补充本次 PPT 的风格要求，也可以选择“自定义风格”后保存为 PPT 执笔人。";
  }

  function renderPptQualityReport(spec) {
    if (!els.pptQualityReport || !spec) return null;
    const report = inspectPptSpec(spec, getPptOptions());
    els.pptQualityReport.textContent = formatPptQualityReport(report);
    if (els.pptQualityStatus) {
      els.pptQualityStatus.textContent = report.errors.length ? "需处理" : report.warnings.length ? "有提示" : "通过";
      els.pptQualityStatus.classList.toggle("ready", !report.errors.length);
      els.pptQualityStatus.classList.toggle("error", report.errors.length > 0);
    }
    return report;
  }

  return {
    bindEvents,
    hydratePptStyleSelect,
    importPptPromptFiles,
    renderPptPreview,
    renderPptQualityReport,
    updatePptStyleControls,
    updatePptSlideCountControls,
    getPptOptions,
    generatePptDeck,
    downloadPptDeck,
    openPptPreviewModal,
    closePptPreviewModal,
  };
}
