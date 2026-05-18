export function getDropImportTarget(activePanelId = "") {
  if (activePanelId === "pptPanel") return "ppt";
  if (activePanelId === "stylePanel") return "style";
  return "documents";
}
