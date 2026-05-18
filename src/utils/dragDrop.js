export function isFileDragData(dataTransfer) {
  const types = Array.from(dataTransfer?.types || []);
  const items = Array.from(dataTransfer?.items || []);
  return (
    types.includes("Files") ||
    types.includes("application/x-moz-file") ||
    items.some((item) => item?.kind === "file")
  );
}
