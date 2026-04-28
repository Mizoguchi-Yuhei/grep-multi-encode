import * as vscode from "vscode";
import { clampDebounceMs } from "./encodingPresets";

export const EXTENSION_SECTION = "multiEncodeSearch";

export type SupportedEncoding =
  | "utf8"
  | "shift_jis"
  | "cp932"
  | "windows-31j"
  | "euc-jp"
  | "utf16be"
  | "utf16le"
  | "latin1"
  | "windows-1252"
  | "gb18030"
  | "gbk"
  | "big5"
  | "euc-kr";

export type SearchTriggerMode = "enter" | "debounce";

export interface LanguagePresets {
  japanese: boolean;
  english: boolean;
  [key: string]: boolean;
}

export interface ExtensionConfig {
  enabledEncodings: SupportedEncoding[];
  languagePresets: LanguagePresets;
  excludeGlobs: string[];
  includeGlobs: string[];
  searchRoots: string[];
  excludeExtensions: string[];
  excludeFileNames: string[];
  useGitIgnore: boolean;
  maxInitialMatchedFiles: number;
  maxMatchesPerFile: number;
  maxTotalMatches: number;
  maxFileSizeBytes: number;
  concurrency: number;
  caseSensitive: boolean;
  followSymlinks: boolean;
  searchTriggerMode: SearchTriggerMode;
  searchDebounceMs: number;
  liveSearchMinQueryLength: number;
}

const DEFAULT_CONFIG: ExtensionConfig = {
  enabledEncodings: ["utf8", "shift_jis", "euc-jp"],
  languagePresets: {
    japanese: true,
    english: true
  },
  excludeGlobs: [
    "**/.git/**",
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/.next/**"
  ],
  includeGlobs: [],
  searchRoots: [],
  excludeExtensions: [".png", ".jpg", ".jpeg", ".gif", ".pdf", ".zip", ".exe", ".dll"],
  excludeFileNames: [],
  useGitIgnore: true,
  maxInitialMatchedFiles: 200,
  maxMatchesPerFile: 20,
  maxTotalMatches: 1000,
  maxFileSizeBytes: 2 * 1024 * 1024,
  concurrency: 6,
  caseSensitive: false,
  followSymlinks: false,
  searchTriggerMode: "enter",
  searchDebounceMs: 400,
  liveSearchMinQueryLength: 1
};

const DEBOUNCE_MIN_MS = 100;
const DEBOUNCE_MAX_MS = 5000;
const LIVE_QUERY_MIN = 1;
const LIVE_QUERY_MAX = 256;

export function getExtensionConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration(EXTENSION_SECTION);

  const rawDebounce = config.get<number>("searchDebounceMs", DEFAULT_CONFIG.searchDebounceMs);
  const rawLiveLen = config.get<number>("liveSearchMinQueryLength", DEFAULT_CONFIG.liveSearchMinQueryLength);
  const rawTrigger = config.get<string>("searchTriggerMode", DEFAULT_CONFIG.searchTriggerMode);

  return {
    enabledEncodings: config.get<SupportedEncoding[]>("enabledEncodings", DEFAULT_CONFIG.enabledEncodings),
    languagePresets: config.get<LanguagePresets>("languagePresets", DEFAULT_CONFIG.languagePresets),
    excludeGlobs: config.get<string[]>("excludeGlobs", DEFAULT_CONFIG.excludeGlobs),
    includeGlobs: config.get<string[]>("includeGlobs", DEFAULT_CONFIG.includeGlobs),
    searchRoots: config.get<string[]>("searchRoots", DEFAULT_CONFIG.searchRoots),
    excludeExtensions: config.get<string[]>("excludeExtensions", DEFAULT_CONFIG.excludeExtensions),
    excludeFileNames: config.get<string[]>("excludeFileNames", DEFAULT_CONFIG.excludeFileNames),
    useGitIgnore: config.get<boolean>("useGitIgnore", DEFAULT_CONFIG.useGitIgnore),
    maxInitialMatchedFiles: config.get<number>("maxInitialMatchedFiles", DEFAULT_CONFIG.maxInitialMatchedFiles),
    maxMatchesPerFile: config.get<number>("maxMatchesPerFile", DEFAULT_CONFIG.maxMatchesPerFile),
    maxTotalMatches: config.get<number>("maxTotalMatches", DEFAULT_CONFIG.maxTotalMatches),
    maxFileSizeBytes: config.get<number>("maxFileSizeBytes", DEFAULT_CONFIG.maxFileSizeBytes),
    concurrency: config.get<number>("concurrency", DEFAULT_CONFIG.concurrency),
    caseSensitive: config.get<boolean>("caseSensitive", DEFAULT_CONFIG.caseSensitive),
    followSymlinks: config.get<boolean>("followSymlinks", DEFAULT_CONFIG.followSymlinks),
    searchTriggerMode: rawTrigger === "debounce" ? "debounce" : "enter",
    searchDebounceMs: clampDebounceMs(rawDebounce, DEBOUNCE_MIN_MS, DEBOUNCE_MAX_MS),
    liveSearchMinQueryLength: Math.min(
      LIVE_QUERY_MAX,
      Math.max(LIVE_QUERY_MIN, Math.floor(Number.isFinite(rawLiveLen) ? rawLiveLen : LIVE_QUERY_MIN))
    )
  };
}
