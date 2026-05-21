export function getDropImportTarget(activePanelId = "", options = {}) {
  if (options.skillBuilderOpen) return "skill-builder";
  if (activePanelId === "pptPanel") return "ppt";
  if (activePanelId === "stylePanel") return "style";
  return "documents";
}
