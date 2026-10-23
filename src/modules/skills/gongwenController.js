import { escapeHtml } from "../../utils/helpers.js";
import { checkGongwenDocument, GONGWEN_GENRES, isGongwenWriter } from "./gongwenWriter.js";

export function createGongwenController({ els, getCurrentDoc, resolveInvokedSkills }) {
  let currentDocumentId;
  const options = '<option value="auto">自动识别</option>' + GONGWEN_GENRES
    .map((genre) => `<option value="${genre}">${genre}</option>`).join("")
    + '<option value="unsupported">其他文种（不套参数）</option>';

  function bindEvents() {
    for (const select of [els.gongwenGenreSelect, els.gongwenCheckGenre]) {
      if (select) select.innerHTML = options;
    }
    els.gongwenCheckBtn?.addEventListener("click", () => {
      checkCurrentDocument();
      els.gongwenCheckPanel?.scrollIntoView?.({ block: "nearest" });
    });
    els.gongwenCheckCloseBtn?.addEventListener("click", () => {
      invalidate();
      els.gongwenCheckBtn?.focus?.();
    });
    els.gongwenCheckGenre?.addEventListener("change", () => checkCurrentDocument());
    els.generatePrompt?.addEventListener("input", sync);
    els.styleSelect?.addEventListener("change", sync);
    els.typeSelect?.addEventListener("change", invalidate);
    els.titleInput?.addEventListener("input", invalidate);
    els.contentEditor?.addEventListener("input", invalidate);
    sync();
  }

  function sync() {
    const doc = getCurrentDoc();
    if (currentDocumentId !== doc?.id) {
      currentDocumentId = doc?.id;
      if (els.gongwenCheckGenre) els.gongwenCheckGenre.value = doc?.writingGenre || "auto";
    }
    if (!els.gongwenOptions) return;
    const writers = resolveInvokedSkills(els.generatePrompt?.value || "", els.styleSelect?.value || "");
    els.gongwenOptions.hidden = !writers.some(isGongwenWriter);
  }

  function invalidate() {
    if (els.gongwenCheckPanel) els.gongwenCheckPanel.hidden = true;
    els.gongwenCheckBtn?.setAttribute?.("aria-expanded", "false");
  }

  function checkCurrentDocument(context = {}) {
    if (!els.gongwenCheckPanel || !els.gongwenCheckBody) return;
    const doc = getCurrentDoc();
    const report = checkGongwenDocument(els.contentEditor?.value || "", {
      genre: els.gongwenCheckGenre?.value && els.gongwenCheckGenre.value !== "auto"
        ? els.gongwenCheckGenre.value : doc?.writingGenre || "auto",
      task: els.titleInput?.value || "",
      documentType: els.typeSelect?.value || doc?.type,
      ...context,
    });
    els.gongwenCheckPanel.hidden = false;
    els.gongwenCheckBtn?.setAttribute?.("aria-expanded", "true");
    const rows = report.rows.map((row) => `<tr>
      <th scope="row">${escapeHtml(row.label)}</th><td>${row.value}</td>
      <td>${row.range ? `${row.range[0]} - ${row.range[1]}` : "未设参数"}</td>
      <td>${row.outside ? "供复核" : ""}</td></tr>`).join("");
    els.gongwenCheckBody.innerHTML = `
      <p>${escapeHtml(report.genre || "其他文种")} · ${escapeHtml(report.note)}</p>
      <div class="gongwen-table-wrap"><table><thead><tr><th>指标</th><th>实测</th><th>常见区间</th><th>提示</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <p>${report.placeholderCount ? `待确认占位内容 ${report.placeholderCount} 处。` : ""}${report.safetyNote}</p>`;
    return report;
  }

  function onDocumentGenerated({ skills, genre, task, documentType } = {}) {
    invalidate();
    if (!(skills || []).some(isGongwenWriter)) return;
    const report = checkCurrentDocument({ genre, task, documentType });
    if (els.gongwenCheckGenre && report) els.gongwenCheckGenre.value = report.genre || "unsupported";
  }

  return { bindEvents, sync, invalidate, checkCurrentDocument, onDocumentGenerated };
}
