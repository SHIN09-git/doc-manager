import { SUPPORTED_TEXT_EXTENSIONS } from "../config/constants.js";

export function isSupportedTextFile(name) {
  const lower = String(name || "").toLowerCase();
  return SUPPORTED_TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function guessTypeFromName(name) {
  if (/纪要|会议/.test(name)) return "minutes";
  if (/总结/.test(name)) return "summary";
  if (/方案|计划/.test(name)) return "plan";
  if (/请示|报告/.test(name)) return "request";
  if (/讲话|发言/.test(name)) return "speech";
  if (/函/.test(name)) return "letter";
  return "notice";
}

export function coerceArray(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined && item !== "");
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

export function clampConfidence(value) {
  const number = Number(value);
  if (Number.isNaN(number)) return 0.5;
  return Math.max(0, Math.min(1, number));
}
