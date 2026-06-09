import { sanitizeFileName } from "../utils/helpers.js";

export function triggerDownload(fileName, content, type, env = {}) {
  const doc = env.document || globalThis.document;
  const urlApi = env.URL || globalThis.URL;
  const BlobCtor = env.Blob || globalThis.Blob;
  const setTimer = env.setTimeout || globalThis.setTimeout || ((callback) => callback());

  if (
    !doc?.createElement ||
    !doc.body?.appendChild ||
    !urlApi?.createObjectURL ||
    !urlApi?.revokeObjectURL ||
    typeof BlobCtor !== "function"
  ) {
    return false;
  }

  let objectUrl = "";
  let anchor = null;
  try {
    const blob = content instanceof BlobCtor ? content : new BlobCtor([content], { type });
    objectUrl = urlApi.createObjectURL(blob);
    anchor = doc.createElement("a");
    anchor.href = objectUrl;
    anchor.download = sanitizeFileName(fileName, "download");
    doc.body.appendChild(anchor);
    if (typeof anchor.click !== "function") return false;
    anchor.click();
    setTimer(() => urlApi.revokeObjectURL(objectUrl), 1000);
    return true;
  } catch {
    if (objectUrl) urlApi.revokeObjectURL(objectUrl);
    return false;
  } finally {
    anchor?.remove?.();
  }
}
