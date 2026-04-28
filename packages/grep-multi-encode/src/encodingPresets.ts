import type { SupportedEncoding } from "./config";

export type EncodingPresetId = "settings" | "utf8" | "ja" | "cjk";

export function normalizeEncodingPresetId(value: string): EncodingPresetId {
  if (value === "utf8" || value === "ja" || value === "cjk") {
    return value;
  }
  return "settings";
}

export function resolveEncodingPreset(
  presetId: string,
  settingsEncodings: SupportedEncoding[]
): SupportedEncoding[] {
  switch (presetId) {
    case "utf8":
      return ["utf8"];
    case "ja":
      return ["utf8", "shift_jis", "euc-jp", "cp932", "windows-31j"];
    case "cjk":
      return ["utf8", "shift_jis", "euc-jp", "gb18030", "gbk", "big5", "euc-kr"];
    case "settings":
    default:
      return [...settingsEncodings];
  }
}

export function clampDebounceMs(value: number, minMs: number, maxMs: number): number {
  if (!Number.isFinite(value)) {
    return minMs;
  }
  const rounded = Math.round(value);
  return Math.min(maxMs, Math.max(minMs, rounded));
}
