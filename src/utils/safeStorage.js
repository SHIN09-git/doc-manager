export function readStorageValue(storage, key, fallback = null) {
  try {
    const value = storage?.getItem?.(key);
    return value === null || value === undefined ? fallback : value;
  } catch {
    return fallback;
  }
}

export function writeStorageValue(storage, key, value) {
  try {
    storage?.setItem?.(key, value);
    return Boolean(storage?.setItem);
  } catch {
    return false;
  }
}
