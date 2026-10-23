// AI 起草时缺失的事实统一写成【可替换占位符】，这里负责识别、分组和批量替换。
const PLACEHOLDER_PATTERN = /【[^【】\n]{1,40}】/g;

export function findPlaceholders(text) {
  const source = String(text || "");
  const matches = [];
  for (const match of source.matchAll(PLACEHOLDER_PATTERN)) {
    matches.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  }
  return matches;
}

export function groupPlaceholders(matches) {
  const groups = new Map();
  for (const match of matches) {
    const group = groups.get(match.text);
    if (group) {
      group.count += 1;
    } else {
      groups.set(match.text, { text: match.text, count: 1, first: match.start });
    }
  }
  return [...groups.values()];
}

/** 从光标位置开始找下一个（或上一个）占位符，到达末尾后回绕。 */
export function findAdjacentPlaceholder(matches, cursor, direction = 1) {
  if (!matches.length) return null;
  const position = Number(cursor) || 0;
  if (direction < 0) {
    const before = matches.filter((match) => match.start < position);
    return before.at(-1) || matches.at(-1);
  }
  return matches.find((match) => match.start >= position) || matches[0];
}

export function replacePlaceholder(text, token, value) {
  const source = String(text || "");
  if (!token) return { text: source, count: 0 };
  const parts = source.split(token);
  return { text: parts.join(String(value ?? "")), count: parts.length - 1 };
}
