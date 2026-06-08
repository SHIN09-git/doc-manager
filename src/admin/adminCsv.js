const FORMULA_PREFIX_PATTERN = /^[\t\r\n ]*[=+\-@]/;

export function buildCsv(rows) {
  const columns = collectColumns(rows);
  return [
    columns.map((column) => csvCell(column)).join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row?.[column])).join(",")),
  ].join("\n");
}

export function collectColumns(rows) {
  return Array.from((rows || []).reduce((set, row) => {
    Object.keys(row || {}).forEach((key) => set.add(key));
    return set;
  }, new Set()));
}

export function csvCell(value) {
  const text = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "");
  return `"${neutralizeCsvFormula(text).replace(/"/g, '""')}"`;
}

export function neutralizeCsvFormula(value) {
  const text = String(value ?? "");
  return FORMULA_PREFIX_PATTERN.test(text) ? `'${text}` : text;
}
