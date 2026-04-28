import * as vscode from "vscode";
import type { ExtensionConfig, SearchTriggerMode } from "./config";
import type { EncodingPresetId } from "./encodingPresets";
import { parseCommaSeparated } from "./inputParsing";
import { SearchStats, createEmptySearchStats } from "./searchTypes";

interface SearchUiText {
  queryLabel: string;
  includeLabel: string;
  excludeLabel: string;
  rootsLabel: string;
  encodingPresetLabel: string;
  statusLabel: string;
  encodingsLabel: string;
  caseSensitiveLabel: string;
  excludeHint: string;
  includeHint: string;
  rootsHint: string;
  encodingHint: string;
  queryPlaceholder: string;
  search: string;
  cancel: string;
  clear: string;
  hintLine1: string;
  hintLine2: string;
  initialStatus: string;
  searchingStatus: string;
  clearedStatus: string;
}

type UiLanguage = "ja" | "en";

export interface SearchRequestOptions {
  excludeGlobs: string[];
  includeGlobs: string[];
  searchRoots: string[];
  caseSensitive?: boolean;
  encodingPreset: EncodingPresetId;
}

interface SearchPanelState {
  query: string;
  includeInput: string;
  excludeInput: string;
  rootsInput: string;
  encodingPreset: EncodingPresetId;
  caseSensitive: boolean;
  isSearching: boolean;
  statusMessage: string;
  statsSummary: string;
  elapsedSummary: string;
  encodingsSummary: string;
  searchTriggerMode: SearchTriggerMode;
  searchDebounceMs: number;
  liveSearchMinQueryLength: number;
}

type SearchPanelMessage =
  | {
      type: "search";
      query: string;
      includeInput: string;
      excludeInput: string;
      rootsInput: string;
      caseSensitive: boolean;
      encodingPreset: EncodingPresetId;
    }
  | { type: "cancel" }
  | { type: "clear" };

export class SearchPanelProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private encodingsSummary = "-";
  private readonly uiText: SearchUiText;
  private readonly language: UiLanguage;
  private readonly getWorkspaceConfig: () => ExtensionConfig;
  private state: SearchPanelState;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onSearch: (query: string, options: SearchRequestOptions) => Promise<void>,
    private readonly onCancel: () => void,
    private readonly onClear: () => void,
    language: UiLanguage,
    getWorkspaceConfig: () => ExtensionConfig
  ) {
    this.language = language;
    this.uiText = language === "ja" ? JA_UI_TEXT : EN_UI_TEXT;
    this.getWorkspaceConfig = getWorkspaceConfig;
    const initialConfig = getWorkspaceConfig();
    this.state = {
      query: "",
      includeInput: "",
      excludeInput: "",
      rootsInput: "",
      encodingPreset: "settings",
      caseSensitive: initialConfig.caseSensitive,
      isSearching: false,
      statusMessage: this.uiText.initialStatus,
      statsSummary: this.formatStatsSummary(createEmptySearchStats()),
      elapsedSummary: this.formatElapsedSummary(0),
      encodingsSummary: "-",
      searchTriggerMode: initialConfig.searchTriggerMode,
      searchDebounceMs: initialConfig.searchDebounceMs,
      liveSearchMinQueryLength: initialConfig.liveSearchMinQueryLength
    };
  }

  applySearchUiFromConfig(): void {
    const config = this.getWorkspaceConfig();
    this.state = {
      ...this.state,
      searchTriggerMode: config.searchTriggerMode,
      searchDebounceMs: config.searchDebounceMs,
      liveSearchMinQueryLength: config.liveSearchMinQueryLength
    };
    this.pushState();
  }

  setEnabledEncodings(encodings: string[]): void {
    this.encodingsSummary = encodings.length > 0 ? encodings.join(", ") : "-";
    this.state = {
      ...this.state,
      encodingsSummary: this.encodingsSummary
    };
    this.pushState();
  }

  setCaseSensitive(caseSensitive: boolean): void {
    this.state = {
      ...this.state,
      caseSensitive
    };
    this.pushState();
  }

  async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): Promise<void> {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);
    this.applySearchUiFromConfig();

    webviewView.webview.onDidReceiveMessage(async (message: SearchPanelMessage) => {
      switch (message.type) {
        case "search":
          this.state = {
            ...this.state,
            includeInput: message.includeInput,
            excludeInput: message.excludeInput,
            rootsInput: message.rootsInput,
            caseSensitive: message.caseSensitive,
            encodingPreset: message.encodingPreset
          };
          await this.onSearch(message.query, {
            excludeGlobs: parseCommaSeparated(message.excludeInput),
            includeGlobs: parseCommaSeparated(message.includeInput),
            searchRoots: parseCommaSeparated(message.rootsInput),
            caseSensitive: message.caseSensitive,
            encodingPreset: message.encodingPreset
          });
          break;
        case "cancel":
          this.onCancel();
          break;
        case "clear":
          this.onClear();
          break;
        default:
          break;
      }
    });

    this.pushState();
  }

  setSearching(query: string): void {
    this.state = {
      ...this.state,
      query,
      isSearching: true,
      statusMessage: this.uiText.searchingStatus,
      statsSummary: this.formatStatsSummary(createEmptySearchStats()),
      elapsedSummary: this.formatElapsedSummary(0),
      encodingsSummary: this.encodingsSummary
    };
    this.pushState();
  }

  setIdle(query: string, statusMessage: string, stats?: SearchStats, elapsedMs?: number): void {
    this.state = {
      ...this.state,
      query,
      isSearching: false,
      statusMessage,
      statsSummary: stats ? this.formatStatsSummary(stats) : this.state.statsSummary,
      elapsedSummary: this.formatElapsedSummary(elapsedMs),
      encodingsSummary: this.encodingsSummary
    };
    this.pushState();
  }

  setStatus(statusMessage: string, stats?: SearchStats, elapsedMs?: number): void {
    this.state = {
      ...this.state,
      statusMessage,
      statsSummary: stats ? this.formatStatsSummary(stats) : this.state.statsSummary,
      elapsedSummary: this.formatElapsedSummary(elapsedMs),
      encodingsSummary: this.encodingsSummary
    };
    this.pushState();
  }

  clear(): void {
    this.state = {
      ...this.state,
      query: "",
      includeInput: "",
      excludeInput: "",
      rootsInput: "",
      encodingPreset: "settings",
      isSearching: false,
      statusMessage: this.uiText.initialStatus,
      statsSummary: this.formatStatsSummary(createEmptySearchStats()),
      elapsedSummary: this.formatElapsedSummary(0),
      encodingsSummary: this.encodingsSummary
    };
    this.pushState();
  }

  private pushState(): void {
    this.view?.webview.postMessage({
      type: "state",
      value: this.state
    });
  }

  private formatStatsSummary(stats: SearchStats): string {
    const skippedTotal =
      stats.skippedExcludedPaths +
      stats.skippedBinaryFiles +
      stats.skippedLargeFiles +
      stats.skippedIncludeFilter;

    if (this.language === "ja") {
      const lines = [`ヒット ${stats.totalMatches} 件（対象 ${stats.matchedFiles} ファイル）`, `スキップ ${skippedTotal} 件`];
      if (skippedTotal > 0) {
        lines.push(
          `  - 除外 ${stats.skippedExcludedPaths} / 含めない ${stats.skippedIncludeFilter} / バイナリ ${stats.skippedBinaryFiles} / 大容量 ${stats.skippedLargeFiles}`
        );
      }
      lines.push(`走査 ${stats.scannedFiles} ファイル`);
      return lines.join("\n");
    }

    const lines = [`Hits: ${stats.totalMatches} in ${stats.matchedFiles} file(s)`, `Skipped: ${skippedTotal}`];
    if (skippedTotal > 0) {
      lines.push(
        `  - Excluded ${stats.skippedExcludedPaths} / Not included ${stats.skippedIncludeFilter} / Binary ${stats.skippedBinaryFiles} / Large ${stats.skippedLargeFiles}`
      );
    }
    lines.push(`Scanned: ${stats.scannedFiles} file(s)`);
    return lines.join("\n");
  }

  private formatElapsedSummary(elapsedMs?: number): string {
    if (typeof elapsedMs !== "number" || !Number.isFinite(elapsedMs) || elapsedMs < 0) {
      return this.language === "ja" ? "経過: --" : "Elapsed: --";
    }

    if (elapsedMs < 1000) {
      return this.language === "ja"
        ? `経過: ${Math.round(elapsedMs)} ms`
        : `Elapsed: ${Math.round(elapsedMs)} ms`;
    }

    return this.language === "ja"
      ? `経過: ${(elapsedMs / 1000).toFixed(2)} s`
      : `Elapsed: ${(elapsedMs / 1000).toFixed(2)} s`;
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      :root {
        color-scheme: light dark;
      }

      body {
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
        background: var(--vscode-sideBar-background);
        padding: 12px;
      }

      .container {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .section {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 8px;
        border-radius: 8px;
        background: color-mix(in srgb, var(--vscode-editor-background) 88%, transparent);
      }

      .label {
        font-size: 12px;
        opacity: 0.92;
        font-weight: 600;
      }

      .input {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid var(--vscode-input-border, transparent);
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        padding: 8px 10px;
        border-radius: 6px;
      }

      select.input {
        cursor: pointer;
      }

      .buttons {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 8px;
      }

      button {
        border: 1px solid var(--vscode-button-border, transparent);
        border-radius: 6px;
        padding: 7px 10px;
        cursor: pointer;
      }

      .primary {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
      }

      .secondary {
        background: var(--vscode-button-secondaryBackground, var(--vscode-button-background));
        color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));
      }

      .status {
        font-size: 12px;
        line-height: 1.5;
        opacity: 0.9;
        padding: 8px 10px;
        border-radius: 6px;
        background: color-mix(in srgb, var(--vscode-editor-background) 82%, transparent);
      }

      .metrics {
        display: grid;
        gap: 4px;
        font-size: 11px;
        opacity: 0.86;
        white-space: pre-wrap;
      }

      .metrics code {
        font-size: 11px;
      }

      .hint {
        font-size: 11px;
        opacity: 0.75;
        line-height: 1.5;
      }

      .subhint {
        font-size: 11px;
        opacity: 0.72;
        line-height: 1.4;
      }

      .row {
        display: grid;
        gap: 6px;
      }

      .toggle {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        opacity: 0.92;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="label">${escapeHtml(this.uiText.queryLabel)}</div>
      <div class="section">
        <input id="query" class="input" type="text" placeholder="${escapeHtml(this.uiText.queryPlaceholder)}" />
        <div class="label">${escapeHtml(this.uiText.includeLabel)}</div>
        <input id="includeInput" class="input" type="text" placeholder="include: **/*.ts, **/*.tsx" />
        <div class="subhint">${escapeHtml(this.uiText.includeHint)}</div>
        <div class="label">${escapeHtml(this.uiText.excludeLabel)}</div>
        <input id="excludeInput" class="input" type="text" placeholder="exclude: **/*.min.js, **/vendor/**" />
        <div class="subhint">${escapeHtml(this.uiText.excludeHint)}</div>
        <div class="label">${escapeHtml(this.uiText.rootsLabel)}</div>
        <input id="rootsInput" class="input" type="text" placeholder="src, packages/foo" />
        <div class="subhint">${escapeHtml(this.uiText.rootsHint)}</div>
        <div class="label">${escapeHtml(this.uiText.encodingPresetLabel)}</div>
        <select id="encodingPreset" class="input" title="${escapeHtml(this.uiText.encodingHint)}">
          <option value="settings">${escapeHtml(this.language === "ja" ? "設定の順序（enabledEncodings）" : "Settings order (enabledEncodings)")}</option>
          <option value="utf8">UTF-8 only</option>
          <option value="ja">${escapeHtml(this.language === "ja" ? "日本語向け" : "Japanese-heavy")}</option>
          <option value="cjk">${escapeHtml(this.language === "ja" ? "CJK 広め" : "CJK-wide")}</option>
        </select>
        <div class="subhint">${escapeHtml(this.uiText.encodingHint)}</div>
        <label class="toggle">
          <input id="caseSensitive" type="checkbox" />
          <span>${escapeHtml(this.uiText.caseSensitiveLabel)}</span>
        </label>
        <div class="buttons">
          <button id="search" class="primary">${escapeHtml(this.uiText.search)}</button>
          <button id="cancel" class="secondary">${escapeHtml(this.uiText.cancel)}</button>
          <button id="clear" class="secondary">${escapeHtml(this.uiText.clear)}</button>
        </div>
      </div>
      <div class="label">${escapeHtml(this.uiText.statusLabel)}</div>
      <div class="section">
        <div id="status" class="status"></div>
        <div class="metrics">
          <div id="encodingsSummary"></div>
          <div id="statsSummary"></div>
          <div id="elapsedSummary"></div>
        </div>
      </div>
      <div class="hint">
        ${escapeHtml(this.uiText.hintLine1)}${this.uiText.hintLine2 ? `<br />${escapeHtml(this.uiText.hintLine2)}` : ""}
      </div>
    </div>
    <script nonce="${nonce}">
      const uiText = ${JSON.stringify(this.uiText)};
      const vscode = acquireVsCodeApi();
      const queryInput = document.getElementById("query");
      const includeInput = document.getElementById("includeInput");
      const excludeInput = document.getElementById("excludeInput");
      const rootsInput = document.getElementById("rootsInput");
      const encodingPresetSelect = document.getElementById("encodingPreset");
      const caseSensitiveInput = document.getElementById("caseSensitive");
      const searchButton = document.getElementById("search");
      const cancelButton = document.getElementById("cancel");
      const clearButton = document.getElementById("clear");
      const status = document.getElementById("status");
      const encodingsSummary = document.getElementById("encodingsSummary");
      const statsSummary = document.getElementById("statsSummary");
      const elapsedSummary = document.getElementById("elapsedSummary");

      let liveState = {
        searchTriggerMode: "enter",
        searchDebounceMs: 400,
        liveSearchMinQueryLength: 1
      };
      let debounceTimer = null;

      const readEncodingPreset = () => {
        const value = encodingPresetSelect.value;
        if (value === "utf8" || value === "ja" || value === "cjk") {
          return value;
        }
        return "settings";
      };

      const submitSearch = () => {
        vscode.postMessage({
          type: "search",
          query: queryInput.value,
          includeInput: includeInput.value,
          excludeInput: excludeInput.value,
          rootsInput: rootsInput.value,
          caseSensitive: caseSensitiveInput.checked,
          encodingPreset: readEncodingPreset()
        });
      };

      const scheduleDebouncedSearch = () => {
        if (liveState.searchTriggerMode !== "debounce") {
          return;
        }
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          const q = queryInput.value.trim();
          if (q.length < liveState.liveSearchMinQueryLength) {
            return;
          }
          submitSearch();
        }, liveState.searchDebounceMs);
      };

      queryInput.addEventListener("input", () => {
        scheduleDebouncedSearch();
      });

      queryInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
          }
          submitSearch();
        }

        if (event.key === "Escape") {
          event.preventDefault();
          vscode.postMessage({ type: "cancel" });
        }
      });

      [includeInput, excludeInput, rootsInput].forEach((el) => {
        el.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submitSearch();
          }
        });
      });

      searchButton.addEventListener("click", submitSearch);
      cancelButton.addEventListener("click", () => vscode.postMessage({ type: "cancel" }));
      clearButton.addEventListener("click", () => vscode.postMessage({ type: "clear" }));

      window.addEventListener("message", (event) => {
        const message = event.data;

        if (message.type !== "state") {
          return;
        }

        const state = message.value;
        liveState = {
          searchTriggerMode: state.searchTriggerMode || "enter",
          searchDebounceMs: typeof state.searchDebounceMs === "number" ? state.searchDebounceMs : 400,
          liveSearchMinQueryLength:
            typeof state.liveSearchMinQueryLength === "number" ? state.liveSearchMinQueryLength : 1
        };

        queryInput.value = state.query || "";
        includeInput.value = state.includeInput || "";
        excludeInput.value = state.excludeInput || "";
        rootsInput.value = state.rootsInput || "";
        const preset = state.encodingPreset || "settings";
        encodingPresetSelect.value = preset === "utf8" || preset === "ja" || preset === "cjk" ? preset : "settings";
        caseSensitiveInput.checked = Boolean(state.caseSensitive);
        queryInput.disabled = state.isSearching;
        includeInput.disabled = state.isSearching;
        excludeInput.disabled = state.isSearching;
        rootsInput.disabled = state.isSearching;
        encodingPresetSelect.disabled = state.isSearching;
        caseSensitiveInput.disabled = state.isSearching;
        searchButton.disabled = state.isSearching;
        cancelButton.disabled = !state.isSearching;
        clearButton.disabled = state.isSearching;
        status.textContent = state.statusMessage;
        status.style.display = state.statusMessage ? "block" : "none";
        encodingsSummary.textContent = uiText.encodingsLabel + ": " + (state.encodingsSummary || "-");
        statsSummary.textContent = state.statsSummary;
        elapsedSummary.textContent = state.elapsedSummary;
      });
    </script>
  </body>
</html>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const JA_UI_TEXT: SearchUiText = {
  queryLabel: "検索",
  includeLabel: "含めるファイル（glob）",
  excludeLabel: "除外（一時）",
  rootsLabel: "フォルダスコープ（カンマ区切り）",
  encodingPresetLabel: "エンコード優先プリセット",
  statusLabel: "結果 / ステータス",
  encodingsLabel: "試行エンコード",
  caseSensitiveLabel: "大文字小文字を区別",
  excludeHint: "この検索のみ。恒久的な除外は設定の excludeGlobs へ。",
  includeHint: "空なら全ファイル。設定の includeGlobs とマージされます。",
  rootsHint: "ワークスペース相対パス。空ならルート全体。設定の searchRoots とマージ。",
  encodingHint: "この検索のみ。設定の enabledEncodings の順序は「設定の順序」で使用されます。",
  queryPlaceholder: "検索したい文字列を入力",
  search: "Search",
  cancel: "Cancel",
  clear: "Clear",
  hintLine1: "Enter: 検索 / Esc: キャンセル",
  hintLine2: "設定で「入力デバウンス」を有効にすると、入力に応じて自動検索します。",
  initialStatus: "",
  searchingStatus: "ワークスペースを検索中...",
  clearedStatus: ""
};

const EN_UI_TEXT: SearchUiText = {
  queryLabel: "Search",
  includeLabel: "Files to include (glob)",
  excludeLabel: "Files to exclude (temporary)",
  rootsLabel: "Folders to include (comma-separated)",
  encodingPresetLabel: "Encoding priority preset",
  statusLabel: "Results / status",
  encodingsLabel: "Encodings tried",
  caseSensitiveLabel: "Match Case",
  excludeHint: "Temporary for this search only. Persistent patterns: settings excludeGlobs.",
  includeHint: "Empty = all files. Merged with settings includeGlobs.",
  rootsHint: "Workspace-relative paths. Empty = full workspace. Merged with settings searchRoots.",
  encodingHint: "For this search only. Use “Settings order” to honor enabledEncodings order.",
  queryPlaceholder: "Enter search text",
  search: "Search",
  cancel: "Cancel",
  clear: "Clear",
  hintLine1: "Enter: search / Esc: cancel",
  hintLine2: "Enable debounced search in settings to search as you type.",
  initialStatus: "",
  searchingStatus: "Searching workspace...",
  clearedStatus: ""
};

function getNonce(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";

  for (let index = 0; index < 32; index += 1) {
    value += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }

  return value;
}
