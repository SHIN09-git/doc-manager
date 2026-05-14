const ICONS = {
  archive: '<path d="M21 8v12H3V8"/><path d="M3 8l2-4h14l2 4"/><path d="M10 12h4"/>',
  "at-sign": '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
  "book-open-text": '<path d="M12 7v14"/><path d="M3 5a6 6 0 0 1 9 2 6 6 0 0 1 9-2v14a6 6 0 0 0-9 2 6 6 0 0 0-9-2Z"/><path d="M7 9h2"/><path d="M7 13h3"/><path d="M16 9h2"/><path d="M16 13h3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  "file-plus-2": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15h6"/>',
  "file-up": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="m9 15 3-3 3 3"/>',
  "folder-input": '<path d="M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z"/><path d="M12 11H6"/><path d="m9 8 3 3-3 3"/>',
  moon: '<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 1 0 9.8 9.8Z"/>',
  "panel-right-open": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/><path d="m10 9 3 3-3 3"/>',
  paperclip: '<path d="m21.4 11.6-8.5 8.5a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 1 1-2.8-2.8l8.5-8.5"/>',
  pencil: '<path d="M17 3a2.8 2.8 0 0 1 4 4L8 20l-5 1 1-5Z"/><path d="m15 5 4 4"/>',
  pilcrow: '<path d="M13 4v16"/><path d="M17 4v16"/><path d="M19 4H9a5 5 0 0 0 0 10h4"/>',
  "plug-zap": '<path d="M13 2 3 14h8l-1 8 10-12h-8Z"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  "refresh-cw": '<path d="M21 12a9 9 0 0 1-15.5 6.2"/><path d="M3 18h3v-3"/><path d="M3 12A9 9 0 0 1 18.5 5.8"/><path d="M21 6h-3v3"/>',
  replace: '<path d="M14 4h6v6"/><path d="m20 4-7 7"/><path d="M10 20H4v-6"/><path d="m4 20 7-7"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
  "scan-text": '<path d="M7 4H5a1 1 0 0 0-1 1v2"/><path d="M17 4h2a1 1 0 0 1 1 1v2"/><path d="M7 20H5a1 1 0 0 1-1-1v-2"/><path d="M17 20h2a1 1 0 0 0 1-1v-2"/><path d="M7 9h10"/><path d="M7 13h8"/><path d="M7 17h6"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9"/><path d="M8.1 8.1 20 20"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  sparkles: '<path d="M12 3 9.8 8.8 4 11l5.8 2.2L12 19l2.2-5.8L20 11l-5.8-2.2Z"/><path d="M5 3v4"/><path d="M3 5h4"/><path d="M19 17v4"/><path d="M17 19h4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.3 17.7-1.4 1.4"/><path d="m19.1 4.9-1.4 1.4"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  "trash-2": '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  upload: '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/>',
  "wand-sparkles": '<path d="m21 3-9 9"/><path d="m15 3 6 6"/><path d="M9 13 3 19l2 2 6-6"/><path d="M5 3v4"/><path d="M3 5h4"/><path d="M19 17v4"/><path d="M17 19h4"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
};

function renderIcon(element) {
  if (element.tagName.toLowerCase() === "svg") return;
  const name = element.getAttribute("data-lucide");
  const paths = ICONS[name] || ICONS.sparkles;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("data-lucide", name);
  svg.className = element.className || "";
  svg.innerHTML = paths;
  element.replaceWith(svg);
}

export function createIcons(root = document) {
  root.querySelectorAll("[data-lucide]").forEach(renderIcon);
}

window.lucide = {
  ...(window.lucide || {}),
  createIcons,
};
