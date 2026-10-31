const lists = new WeakMap();

// Keep unchanged rows (and their focus, menus and icons) when a list refreshes.
export function renderKeyedList(container, items, renderItem) {
  let previous = lists.get(container);
  if (!previous) {
    container.replaceChildren();
    previous = new Map();
  }
  const next = new Map();
  const changed = [];
  const template = container.ownerDocument.createElement("template");
  for (const [index, item] of items.entries()) {
    const html = renderItem(item, index);
    let entry = previous.get(item.id);
    if (!entry || entry.html !== html) {
      template.innerHTML = html;
      const node = template.content.firstElementChild;
      entry?.node.replaceWith(node);
      entry = { html, node };
      changed.push(node);
    }
    next.set(item.id, entry);
  }
  for (const [id, entry] of previous) {
    if (!next.has(id)) entry.node.remove();
  }
  let cursor = container.firstChild;
  for (const { node } of next.values()) {
    if (node !== cursor) container.insertBefore(node, cursor);
    cursor = node.nextSibling;
  }
  lists.set(container, next);
  return changed;
}
