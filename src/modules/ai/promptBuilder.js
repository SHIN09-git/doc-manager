export function joinPromptSections(sections) {
  return sections.filter(Boolean).join("\n\n");
}
