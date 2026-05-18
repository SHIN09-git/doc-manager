import { LARGE_IMPORT_WARNING_BYTES, MAX_IMPORT_FILE_BYTES } from "../config/constants.js";

function defaultConfirm(message) {
  if (typeof window !== "undefined" && typeof window.confirm === "function") {
    return window.confirm(message);
  }
  return true;
}

export function formatFileSize(bytes) {
  const size = Math.max(0, Number(bytes) || 0);
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 10 ? 1 : 2;
  return `${Number(value.toFixed(precision))} ${units[unitIndex]}`;
}

export function getImportFileSizeStatus(file, options = {}) {
  const warningBytes = options.warningBytes ?? LARGE_IMPORT_WARNING_BYTES;
  const maxBytes = options.maxBytes ?? MAX_IMPORT_FILE_BYTES;
  const size = Math.max(0, Number(file?.size) || 0);
  const name = file?.name || "未命名文件";

  if (maxBytes > 0 && size > maxBytes) {
    return {
      action: "block",
      message: `${name} 大小为 ${formatFileSize(size)}，超过单次导入上限 ${formatFileSize(maxBytes)}，已跳过。`,
    };
  }

  if (warningBytes > 0 && size > warningBytes) {
    return {
      action: "confirm",
      message: `${name} 大小为 ${formatFileSize(size)}，导入可能需要较长时间。是否继续？`,
    };
  }

  return { action: "allow", message: "" };
}

export async function filterImportableFilesBySize(files, options = {}) {
  const confirmImport = options.confirm || defaultConfirm;
  const notify = options.notify || (() => {});
  const accepted = [];
  const skipped = [];

  for (const file of Array.from(files || [])) {
    const status = getImportFileSizeStatus(file, options);
    if (status.action === "block") {
      skipped.push({ file, reason: "too-large", message: status.message });
      notify(status.message, "warn");
      continue;
    }

    if (status.action === "confirm") {
      const ok = await confirmImport(status.message, file);
      if (!ok) {
        const message = `已跳过大文件：${file?.name || "未命名文件"}`;
        skipped.push({ file, reason: "cancelled", message });
        notify(message, "warn");
        continue;
      }
    }

    accepted.push(file);
  }

  return { accepted, skipped };
}
