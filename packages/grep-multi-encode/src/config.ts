import * as vscode from "vscode";

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

export interface LanguagePresets {
  japanese: boolean;
  english: boolean;
  [key: string]: boolean;
}

export interface ExtensionConfig {
  enabledEncodings: SupportedEncoding[];
  languagePresets: LanguagePresets;
  excludeGlobs: string[];
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
  excludeExtensions: [".png", ".jpg", ".jpeg", ".gif", ".pdf", ".zip", ".exe", ".dll"],
  excludeFileNames: [],
  useGitIgnore: true,
  maxInitialMatchedFiles: 200,
  maxMatchesPerFile: 20,
  maxTotalMatches: 1000,
  maxFileSizeBytes: 2 * 1024 * 1024,
  concurrency: 6,
  caseSensitive: false,
  followSymlinks: false
};

export function getExtensionConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration(EXTENSION_SECTION);

  return {
    enabledEncodings: config.get<SupportedEncoding[]>("enabledEncodings", DEFAULT_CONFIG.enabledEncodings),
    languagePresets: config.get<LanguagePresets>("languagePresets", DEFAULT_CONFIG.languagePresets),
    excludeGlobs: config.get<string[]>("excludeGlobs", DEFAULT_CONFIG.excludeGlobs),
    excludeExtensions: config.get<string[]>("excludeExtensions", DEFAULT_CONFIG.excludeExtensions),
    excludeFileNames: config.get<string[]>("excludeFileNames", DEFAULT_CONFIG.excludeFileNames),
    useGitIgnore: config.get<boolean>("useGitIgnore", DEFAULT_CONFIG.useGitIgnore),
    maxInitialMatchedFiles: config.get<number>("maxInitialMatchedFiles", DEFAULT_CONFIG.maxInitialMatchedFiles),
    maxMatchesPerFile: config.get<number>("maxMatchesPerFile", DEFAULT_CONFIG.maxMatchesPerFile),
    maxTotalMatches: config.get<number>("maxTotalMatches", DEFAULT_CONFIG.maxTotalMatches),
    maxFileSizeBytes: config.get<number>("maxFileSizeBytes", DEFAULT_CONFIG.maxFileSizeBytes),
    concurrency: config.get<number>("concurrency", DEFAULT_CONFIG.concurrency),
    caseSensitive: config.get<boolean>("caseSensitive", DEFAULT_CONFIG.caseSensitive),
    followSymlinks: config.get<boolean>("followSymlinks", DEFAULT_CONFIG.followSymlinks)
  };
}
