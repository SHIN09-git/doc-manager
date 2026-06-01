export function createSkillMentionController(deps = {}) {
  const {
    state = { styles: [] },
    ui = {},
    els = {},
    isSkillEnabled = () => true,
    escapeHtml = defaultEscapeHtml,
    recordEditorUndoPoint = () => {},
    saveEditor = () => {},
    documentRef = () => globalThis.document,
    windowRef = () => globalThis.window,
  } = deps;

  function bindEvents() {
    [els.generatePrompt, els.contentEditor].filter(Boolean).forEach((textarea) => {
      textarea.addEventListener("input", () => showFor(textarea));
      textarea.addEventListener("keyup", (event) => {
        if (isNavigationKey(event.key)) return;
        showFor(textarea);
      });
      textarea.addEventListener("click", () => showFor(textarea));
      textarea.addEventListener("keydown", (event) => handleTargetKeydown(event, textarea));
    });
    els.skillMentionPanel?.addEventListener("mousedown", handlePanelMouseDown);
    documentRef()?.addEventListener?.("click", handleDocumentClick);
    preparePanel();
  }

  function preparePanel() {
    if (!els.skillMentionPanel) return;
    els.skillMentionPanel.setAttribute?.("role", "listbox");
    els.skillMentionPanel.setAttribute?.("aria-label", "可调用的执笔人");
  }

  function showFor(textarea) {
    if (!textarea || !els.skillMentionPanel) return [];
    const mention = getCurrentMention(textarea);
    if (!mention) {
      hide();
      return [];
    }
    const query = mention.query.toLowerCase();
    const matches = getMatches(query);
    if (matches.length === 0) {
      hide();
      return [];
    }
    ui.mentionTarget = textarea;
    ui.mentionRange = mention;
    ui.mentionActiveIndex = 0;
    renderMatches(matches);
    positionPanel(textarea);
    els.skillMentionPanel.hidden = false;
    updateActiveOption();
    return matches;
  }

  function getMatches(query = "") {
    return (state.styles || [])
      .filter(isSkillEnabled)
      .filter((skill) => {
        const haystack = `${skill.handle || ""} ${skill.name || ""} ${skill.category || ""} ${skill.description || ""}`.toLowerCase();
        return !query || haystack.includes(query);
      })
      .slice(0, 8);
  }

  function renderMatches(matches) {
    els.skillMentionPanel.innerHTML = matches
      .map((skill, index) => {
        const optionId = `skill-mention-option-${escapeAttribute(skill.id || index)}`;
        return `<button type="button" id="${optionId}" role="option" aria-selected="false" data-insert-skill="${escapeAttribute(skill.id)}">
          <span class="mention-name">@${escapeHtml(skill.handle || skill.name || "")}</span>
          <span>${escapeHtml(skill.name || skill.handle || "未命名执笔人")}</span>
          <small>${escapeHtml(skill.description || skill.category || "自定义执笔人")}</small>
        </button>`;
      })
      .join("");
  }

  function getCurrentMention(textarea) {
    const cursor = textarea.selectionStart || 0;
    const before = String(textarea.value || "").slice(0, cursor);
    const match = before.match(/(?:^|[\s,.;:?!()[\]{}"'，。；：？！【】（）])@([\u4e00-\u9fa5A-Za-z0-9_-]{0,30})$/);
    if (!match) return null;
    return {
      start: cursor - match[1].length - 1,
      end: cursor,
      query: match[1],
    };
  }

  function positionPanel(textarea) {
    if (!els.skillMentionPanel) return;
    const rect = textarea.getBoundingClientRect?.() || { left: 12, top: 12 };
    const win = windowRef() || {};
    els.skillMentionPanel.style.left = `${Math.max(12, rect.left + 8)}px`;
    els.skillMentionPanel.style.top = `${Math.min((win.innerHeight || 720) - 250, rect.top + 44)}px`;
  }

  function hide() {
    if (els.skillMentionPanel) {
      els.skillMentionPanel.hidden = true;
      els.skillMentionPanel.removeAttribute?.("aria-activedescendant");
    }
    ui.mentionTarget = null;
    ui.mentionRange = null;
    ui.mentionActiveIndex = -1;
  }

  function handleDocumentClick(event) {
    const target = event.target;
    if (matchesTarget(target, "#skillMentionPanel") || matchesTarget(target, "#generatePrompt, #contentEditor")) return;
    if (closestTarget(target, "#skillMentionPanel")) return;
    hide();
  }

  function handlePanelMouseDown(event) {
    const button = closestTarget(event.target, "[data-insert-skill]");
    if (!button) return;
    event.preventDefault();
    insert(button.dataset.insertSkill);
  }

  function handleTargetKeydown(event, textarea) {
    if (textarea !== ui.mentionTarget || els.skillMentionPanel?.hidden) return;
    const items = getOptionItems();
    if (items.length === 0) return;
    if (event.key === "Escape") {
      event.preventDefault();
      hide();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      ui.mentionActiveIndex = (getActiveIndex(items.length) + delta + items.length) % items.length;
      updateActiveOption();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const selected = items[getActiveIndex(items.length)];
      insert(selected?.dataset?.insertSkill);
    }
  }

  function insert(skillId) {
    const skill = (state.styles || []).find((item) => item.id === skillId);
    if (!skill || !isSkillEnabled(skill) || !ui.mentionTarget || !ui.mentionRange) return false;
    const textarea = ui.mentionTarget;
    const mentionText = `@${skill.handle || skill.name} `;
    if (textarea === els.contentEditor) {
      recordEditorUndoPoint();
    }
    textarea.value = textarea.value.slice(0, ui.mentionRange.start) + mentionText + textarea.value.slice(ui.mentionRange.end);
    textarea.focus?.();
    const cursor = ui.mentionRange.start + mentionText.length;
    textarea.setSelectionRange?.(cursor, cursor);
    if (textarea === els.contentEditor) {
      saveEditor(false);
    }
    hide();
    return true;
  }

  function updateActiveOption() {
    const items = getOptionItems();
    const activeIndex = getActiveIndex(items.length);
    items.forEach((item, index) => {
      const active = index === activeIndex;
      item.classList?.toggle?.("is-active", active);
      item.setAttribute?.("aria-selected", String(active));
      if (active && item.id) {
        els.skillMentionPanel?.setAttribute?.("aria-activedescendant", item.id);
        item.scrollIntoView?.({ block: "nearest" });
      }
    });
  }

  function getActiveIndex(length) {
    if (length <= 0) return -1;
    const index = Number.isInteger(ui.mentionActiveIndex) ? ui.mentionActiveIndex : 0;
    return Math.min(Math.max(index, 0), length - 1);
  }

  function getOptionItems() {
    return Array.from(els.skillMentionPanel?.querySelectorAll?.("[data-insert-skill]") || []);
  }

  return {
    bindEvents,
    showFor,
    hide,
    insert,
    getCurrentMention,
    handleDocumentClick,
    handlePanelMouseDown,
    handleTargetKeydown,
  };
}

function isNavigationKey(key) {
  return key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === "Escape";
}

function closestTarget(target, selector) {
  return target?.closest?.(selector) || null;
}

function matchesTarget(target, selector) {
  return Boolean(target?.matches?.(selector));
}

function escapeAttribute(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function defaultEscapeHtml(value) {
  return escapeAttribute(value);
}
