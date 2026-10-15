import { escapeHtml } from "../../utils/helpers.js";
import {
  findAdjacentPlaceholder,
  findPlaceholders,
  groupPlaceholders,
  replacePlaceholder,
} from "../../utils/placeholders.js";

const REFRESH_DELAY_MS = 180;

export function createPlaceholderController({
  els,
  toast = () => {},
  recordEditorUndoPoint = () => {},
  saveEditor = () => {},
  getCurrentDocId = () => null,
  windowRef = globalThis.window,
  documentRef = globalThis.document,
}) {
  let refreshTimer = null;
  let matches = [];
  let renderedDocId = null;

  function bindEvents() {
    els.placeholderToggleBtn?.addEventListener("click", () => togglePanel());
    els.placeholderCloseBtn?.addEventListener("click", () => togglePanel(false, { restoreFocus: true }));
    els.placeholderPrevBtn?.addEventListener("click", () => jump(-1));
    els.placeholderNextBtn?.addEventListener("click", () => jump(1));
    els.placeholderList?.addEventListener("click", handleListClick);
    els.placeholderList?.addEventListener("keydown", handleListKeydown);
    els.contentEditor?.addEventListener("input", queueRefresh);
    els.contentEditor?.addEventListener("keydown", handleEditorKeydown);
    refresh();
  }

  function queueRefresh() {
    windowRef?.clearTimeout?.(refreshTimer);
    refreshTimer = windowRef?.setTimeout?.(refresh, REFRESH_DELAY_MS);
  }

  function refresh() {
    const docId = getCurrentDocId();
    if (docId !== renderedDocId) {
      renderedDocId = docId;
      if (els.placeholderList) els.placeholderList.innerHTML = "";
    }
    matches = findPlaceholders(els.contentEditor?.value || "");
    const count = matches.length;
    if (els.placeholderToggleBtn) {
      els.placeholderToggleBtn.hidden = count === 0 && !isPanelOpen();
      els.placeholderToggleBtn.setAttribute("aria-label", `待填内容 ${count} 处`);
      els.placeholderToggleBtn.title = count ? `还有 ${count} 处待填内容（F8 跳到下一处）` : "没有待填内容";
    }
    if (els.placeholderCount) els.placeholderCount.textContent = String(count);
    if (isPanelOpen()) renderList();
    return matches;
  }

  function isPanelOpen() {
    return Boolean(els.placeholderPanel && !els.placeholderPanel.hidden);
  }

  function togglePanel(force, { restoreFocus = false } = {}) {
    if (!els.placeholderPanel) return false;
    const open = typeof force === "boolean" ? force : !isPanelOpen();
    els.placeholderPanel.hidden = !open;
    els.placeholderToggleBtn?.setAttribute("aria-expanded", String(open));
    refresh();
    if (open) {
      els.placeholderList?.querySelector("input")?.focus?.();
    } else if (restoreFocus) {
      els.contentEditor?.focus?.();
    }
    return open;
  }

  function renderList() {
    if (!els.placeholderList) return;
    const groups = groupPlaceholders(matches);
    if (els.placeholderSummary) {
      els.placeholderSummary.textContent = groups.length
        ? `${matches.length} 处 · ${groups.length} 项`
        : "已全部补全";
    }
    const previousValues = readDraftValues();
    els.placeholderList.innerHTML = groups.length
      ? groups
          .map((group, index) => {
            const inputId = `placeholderFill-${index}`;
            return `<li class="placeholder-item" data-placeholder-token="${escapeHtml(group.text)}">
              <button type="button" class="placeholder-token" data-placeholder-locate="${index}" title="在正文中定位">
                <span>${escapeHtml(group.text)}</span>${group.count > 1 ? `<small>× ${group.count}</small>` : ""}
              </button>
              <label class="sr-only" for="${inputId}">替换 ${escapeHtml(group.text)} 的内容</label>
              <input id="${inputId}" type="text" data-placeholder-input="${index}" placeholder="填写后替换${group.count > 1 ? "全部" : ""}" value="${escapeHtml(previousValues.get(group.text) || "")}" />
              <button type="button" class="tiny-button" data-placeholder-fill="${index}">填入</button>
            </li>`;
          })
          .join("")
      : `<li class="placeholder-empty">没有待填内容，可以导出了。</li>`;
  }

  function readDraftValues() {
    const values = new Map();
    els.placeholderList?.querySelectorAll?.("[data-placeholder-token]").forEach((item) => {
      const value = item.querySelector("input")?.value || "";
      if (value) values.set(item.dataset.placeholderToken, value);
    });
    return values;
  }

  function getGroup(index) {
    return groupPlaceholders(matches)[Number(index)] || null;
  }

  function handleListClick(event) {
    const locate = event.target?.closest?.("[data-placeholder-locate]");
    if (locate) {
      const group = getGroup(locate.dataset.placeholderLocate);
      if (group) selectMatch(matches.find((match) => match.text === group.text));
      return;
    }
    const fill = event.target?.closest?.("[data-placeholder-fill]");
    if (fill) fillGroup(fill.dataset.placeholderFill);
  }

  function handleListKeydown(event) {
    const input = event.target?.closest?.("[data-placeholder-input]");
    if (!input || event.key !== "Enter") return;
    event.preventDefault();
    fillGroup(input.dataset.placeholderInput);
  }

  function fillGroup(index) {
    const group = getGroup(index);
    if (!group || !els.contentEditor) return 0;
    const input = els.placeholderList?.querySelector(`[data-placeholder-input="${Number(index)}"]`);
    const value = String(input?.value || "").trim();
    if (!value) {
      toast(`请先填写 ${group.text} 的内容`, "warn");
      input?.focus?.();
      return 0;
    }
    recordEditorUndoPoint();
    const result = replacePlaceholder(els.contentEditor.value, group.text, value);
    els.contentEditor.value = result.text;
    saveEditor(false);
    if (input) input.value = "";
    refresh();
    toast(`已把 ${result.count} 处${group.text}替换为“${value}”，可撤销`);
    els.placeholderList?.querySelector("input")?.focus?.();
    return result.count;
  }

  function jump(direction = 1) {
    refresh();
    if (!matches.length) {
      toast("没有待填内容", "info");
      return null;
    }
    const editor = els.contentEditor;
    const cursor = direction > 0 ? editor.selectionEnd : editor.selectionStart;
    const target = findAdjacentPlaceholder(matches, cursor, direction);
    selectMatch(target);
    return target;
  }

  function selectMatch(match) {
    const editor = els.contentEditor;
    if (!match || !editor) return;
    editor.focus();
    editor.setSelectionRange(match.start, match.end);
    scrollSelectionIntoView(editor, match.start);
  }

  function handleEditorKeydown(event) {
    if (event.key !== "F8") return;
    event.preventDefault();
    jump(event.shiftKey ? -1 : 1);
  }

  // 用镜像元素测量选区所在的像素位置，让长文中的占位符滚动到可视区域中部。
  function scrollSelectionIntoView(editor, position) {
    const view = documentRef?.defaultView || windowRef;
    if (!documentRef?.createElement || !view?.getComputedStyle) return;
    const style = view.getComputedStyle(editor);
    const mirror = documentRef.createElement("div");
    [
      "boxSizing", "width", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
      "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
      "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "wordSpacing", "tabSize",
    ].forEach((property) => {
      mirror.style[property] = style[property];
    });
    Object.assign(mirror.style, {
      position: "absolute",
      visibility: "hidden",
      top: "0",
      left: "-9999px",
      whiteSpace: "pre-wrap",
      overflowWrap: "break-word",
      height: "auto",
    });
    mirror.textContent = editor.value.slice(0, position);
    const marker = documentRef.createElement("span");
    marker.textContent = "​";
    mirror.appendChild(marker);
    documentRef.body.appendChild(mirror);
    const offset = marker.offsetTop;
    mirror.remove();
    editor.scrollTop = Math.max(0, offset - editor.clientHeight / 3);
  }

  return { bindEvents, refresh, queueRefresh, togglePanel, jump, fillGroup, getMatches: () => matches };
}
