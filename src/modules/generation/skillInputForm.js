import { escapeHtml } from "../../utils/helpers.js";

const MAX_FIELDS = 10;
const LONG_FIELD_PATTERN = /事项|要点|内容|情况|背景|安排|要求|问题|措施|经过|材料/;

export function getFieldLabel(field) {
  if (typeof field === "string") return field.trim();
  if (!field || typeof field !== "object") return "";
  return String(field.name || field.label || field.field || field.key || field.title || "").trim();
}

function getFieldHint(field) {
  if (!field || typeof field !== "object") return "";
  return String(field.description || field.hint || field.example || field.placeholder || "").trim();
}

/**
 * 汇总被调用执笔人的输入字段。同名字段只保留一次，任一执笔人要求必填即为必填。
 */
export function collectSkillInputFields(skills, parseSkillJson, { skipLabels = [] } = {}) {
  const fields = new Map();
  const skip = new Set(skipLabels);
  for (const skill of skills || []) {
    const skillJson = parseSkillJson(skill) || {};
    const contract = skillJson.input_contract;
    const required = Array.isArray(contract)
      ? contract
      : toArray(contract?.required_fields || contract?.fields || skillJson.user_input_fields || skillJson.required_user_inputs);
    const optional = Array.isArray(contract) ? [] : toArray(contract?.optional_fields);
    const add = (field, isRequired) => {
      const label = getFieldLabel(field);
      if (!label || label.length > 24 || skip.has(label)) return;
      const existing = fields.get(label);
      if (existing) {
        existing.required = existing.required || isRequired;
        return;
      }
      fields.set(label, { label, hint: getFieldHint(field), required: isRequired, long: LONG_FIELD_PATTERN.test(label) });
    };
    required.forEach((field) => add(field, true));
    optional.forEach((field) => add(field, false));
  }
  return [...fields.values()].slice(0, MAX_FIELDS);
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

/** 用户在提示词里写了“字段：内容”时，视为已经提供该字段。 */
export function isFieldCoveredByPrompt(label, prompt) {
  const escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const inlineSpace = "[^\\S\\r\\n\\u2028\\u2029]*";
  return new RegExp(`${escaped}${inlineSpace}[：:]${inlineSpace}\\S`).test(String(prompt || ""));
}

export function findMissingRequiredFields(fields, values = {}, prompt = "") {
  return fields
    .filter((field) => field.required)
    .filter((field) => !String(values[field.label] || "").trim() && !isFieldCoveredByPrompt(field.label, prompt))
    .map((field) => field.label);
}

export function buildSkillInputPrompt(fields, values = {}, prompt = "") {
  const lines = [];
  const missing = [];
  for (const field of fields) {
    const value = String(values[field.label] || "").trim();
    if (value) {
      lines.push(`- ${field.label}：${value}`);
    } else if (field.required && !isFieldCoveredByPrompt(field.label, prompt)) {
      lines.push(`- ${field.label}：【未填写】`);
      missing.push(field.label);
    }
  }
  if (lines.length === 0) return "";
  return [
    "结构化输入（用户在执笔人表单中填写，属于本次事实）：",
    ...lines,
    missing.length
      ? "标注【未填写】的项目：如果用户提示词或参考资料中已有对应事实，以其为准；确实没有时在正文对应位置使用【可替换占位符】，不得编造。"
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function createSkillInputFormController({
  els,
  ui,
  resolveInvokedSkills,
  parseSkillJsonObject,
  isGongwenWriter = () => false,
  toast = () => {},
}) {
  ui.skillInputValues = ui.skillInputValues && typeof ui.skillInputValues === "object" ? ui.skillInputValues : {};
  let currentFields = [];
  let currentSignature = "";
  let warnedSignature = "";
  let explicitlyInvoked = false;

  function bindEvents() {
    els.generatePrompt?.addEventListener("input", sync);
    els.styleSelect?.addEventListener("change", sync);
    els.skillInputFields?.addEventListener("input", handleFieldInput);
    els.clearSkillInputBtn?.addEventListener("click", clearValues);
    sync();
  }

  function getInvokedSkills() {
    return resolveInvokedSkills(els.generatePrompt?.value || "", els.styleSelect?.value || "");
  }

  function sync() {
    const skills = getInvokedSkills();
    const prompt = els.generatePrompt?.value || "";
    // 只有用户在提示词里 @ 调用的执笔人才需要生成前拦截；文档默认执笔人只展示表单。
    explicitlyInvoked = skills.some((skill) => [skill.handle, skill.name].some((name) => name && prompt.includes(`@${name}`)));
    const skipLabels = skills.some(isGongwenWriter) ? ["文种"] : [];
    const fields = collectSkillInputFields(skills, (skill) => parseSkillJsonObject(skill.skillJson, skill), { skipLabels });
    const signature = JSON.stringify([skills.map((skill) => skill.id), fields]);
    currentFields = fields;
    if (signature !== currentSignature) {
      currentSignature = signature;
      render(skills);
    }
    updateStatus();
    return fields;
  }

  function render(skills) {
    if (!els.skillInputForm || !els.skillInputFields) return;
    els.skillInputForm.hidden = currentFields.length === 0;
    if (currentFields.length === 0) {
      els.skillInputFields.innerHTML = "";
      return;
    }
    if (els.skillInputTitle) {
      els.skillInputTitle.textContent = `${skills.map((skill) => `@${skill.handle || skill.name}`).join("、")} 需要的信息`;
    }
    els.skillInputFields.innerHTML = currentFields
      .map((field, index) => {
        const id = `skillInputField-${index}`;
        const value = escapeHtml(ui.skillInputValues[field.label] || "");
        const placeholder = escapeHtml(field.hint || (field.required ? "必填，未填写时以占位符代替" : "选填"));
        const control = field.long
          ? `<textarea id="${id}" rows="2" data-skill-input="${escapeHtml(field.label)}" placeholder="${placeholder}">${value}</textarea>`
          : `<input id="${id}" type="text" data-skill-input="${escapeHtml(field.label)}" placeholder="${placeholder}" value="${value}" />`;
        return `<div class="skill-input-field${field.long ? " is-long" : ""}">
          <label for="${id}">${escapeHtml(field.label)}${field.required ? '<span class="required-mark" aria-label="必填">*</span>' : ""}</label>
          ${control}
        </div>`;
      })
      .join("");
  }

  function handleFieldInput(event) {
    const input = event.target?.closest?.("[data-skill-input]");
    if (!input) return;
    ui.skillInputValues[input.dataset.skillInput] = input.value;
    input.classList.remove("is-missing");
    updateStatus();
  }

  function updateStatus() {
    const required = currentFields.filter((field) => field.required);
    const missing = findMissingRequiredFields(currentFields, ui.skillInputValues, els.generatePrompt?.value || "");
    if (els.skillInputStatus) {
      els.skillInputStatus.textContent = required.length ? `必填 ${required.length - missing.length}/${required.length}` : "均为选填";
      els.skillInputStatus.classList.toggle("ready", required.length > 0 && missing.length === 0);
    }
    if (missing.length === 0) hideWarning();
    if (els.clearSkillInputBtn) {
      els.clearSkillInputBtn.hidden = !currentFields.some((field) => String(ui.skillInputValues[field.label] || "").trim());
    }
  }

  function clearValues() {
    currentFields.forEach((field) => delete ui.skillInputValues[field.label]);
    els.skillInputFields?.querySelectorAll("[data-skill-input]").forEach((input) => {
      input.value = "";
    });
    updateStatus();
  }

  function hideWarning() {
    if (els.skillInputWarning) els.skillInputWarning.hidden = true;
    warnedSignature = "";
  }

  /**
   * 生成前检查必填项：第一次提醒并定位，再次点击生成则按占位符处理。
   * 返回 true 表示可以继续生成。
   */
  function checkBeforeGenerate(prompt) {
    sync();
    const missing = findMissingRequiredFields(currentFields, ui.skillInputValues, prompt);
    if (missing.length === 0 || !explicitlyInvoked) {
      hideWarning();
      return true;
    }
    const signature = missing.join("|");
    if (warnedSignature === signature) {
      hideWarning();
      return true;
    }
    warnedSignature = signature;
    if (els.skillInputWarning) {
      els.skillInputWarning.textContent = `还有 ${missing.length} 项必填未填写：${missing.join("、")}。补全后生成更准确；直接再次点击生成，缺失内容会以【可替换占位符】代替。`;
      els.skillInputWarning.hidden = false;
    }
    const inputs = [...(els.skillInputFields?.querySelectorAll("[data-skill-input]") || [])];
    inputs.forEach((input) => input.classList.toggle("is-missing", missing.includes(input.dataset.skillInput)));
    inputs.find((input) => missing.includes(input.dataset.skillInput))?.focus?.();
    toast(`还有 ${missing.length} 项必填未填写`, "warn");
    return false;
  }

  function getPromptSection(prompt) {
    sync();
    return buildSkillInputPrompt(currentFields, ui.skillInputValues, prompt);
  }

  function hasValues() {
    return currentFields.some((field) => String(ui.skillInputValues[field.label] || "").trim());
  }

  return { bindEvents, sync, checkBeforeGenerate, getPromptSection, hasValues, getFields: () => currentFields };
}
