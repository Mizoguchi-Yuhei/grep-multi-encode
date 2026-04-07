import * as vscode from "vscode";
import { SearchStats, createEmptySearchStats } from "./searchTypes";

interface SearchUiText {
  queryLabel: string;
  statusLabel: string;
  encodingsLabel: string;
  caseSensitiveLabel: string;
  excludeHint: string;
  queryPlaceholder: string;
  search: string;
  cancel: string;
  hintLine1: string;
  hintLine2: string;
  initialStatus: string;
  searchingStatus: string;
  clearedStatus: string;
}

type UiLanguage = "ja" | "en";

export interface SearchRequestOptions {
  excludeGlobs: string[];
  caseSensitive?: boolean;
}

interface SearchPanelState {
  query: string;
  excludeInput: string;
  caseSensitive: boolean;
  isSearching: boolean;
  statusMessage: string;
  statsSummary: string;
  elapsedSummary: string;
  encodingsSummary: string;
}

type SearchPanelMessage =
  | { type: "search"; query: string; excludeInput: string; caseSensitive: boolean }
  | { type: "cancel" };

export class SearchPanelProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private encodingsSummary = "-";
  private readonly uiText: SearchUiText;
  private readonly language: UiLanguage;
  private state: SearchPanelState = {
    query: "",
    excludeInput: "",
    caseSensitive: false,
    isSearching: false,
    statusMessage: "",
    statsSummary: "",
    elapsedSummary: "",
    encodingsSummary: "-"
  };

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onSearch: (query: string, options: SearchRequestOptions) => Promise<void>,
    private readonly onCancel: () => void,
    language: UiLanguage = "en"
  ) {
    this.language = language;
    this.uiText = language === "ja" ? JA_UI_TEXT : EN_UI_TEXT;
    this.state.statusMessage = this.uiText.initialStatus;
    this.state.statsSummary = this.formatStatsSummary(createEmptySearchStats());
    this.state.elapsedSummary = this.formatElapsedSummary(0);
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

    webviewView.webview.onDidReceiveMessage(async (message: SearchPanelMessage) => {
      switch (message.type) {
        case "search":
          this.state = {
            ...this.state,
            excludeInput: message.excludeInput,
            caseSensitive: message.caseSensitive
          };
          await this.onSearch(message.query, {
            excludeGlobs: parseExcludeInput(message.excludeInput),
            caseSensitive: message.caseSensitive
          });
          break;
        case "cancel":
          this.onCancel();
          break;
        default:
          break;
      }
    });

    this.pushState();
  }

  setSearching(query: string): void {
    this.state = {
      query,
      excludeInput: this.state.excludeInput,
      caseSensitive: this.state.caseSensitive,
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
      query,
      excludeInput: this.state.excludeInput,
      caseSensitive: this.state.caseSensitive,
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
      query: "",
      excludeInput: this.state.excludeInput,
      caseSensitive: this.state.caseSensitive,
      isSearching: false,
      statusMessage: this.uiText.clearedStatus,
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
    const skippedTotal = stats.skippedExcludedPaths + stats.skippedBinaryFiles + stats.skippedLargeFiles;

    if (this.language === "ja") {
      const lines = [`ヒット ${stats.totalMatches} 件（対象 ${stats.matchedFiles} ファイル）`, `スキップ ${skippedTotal} 件`];
      if (skippedTotal > 0) {
        lines.push(
          `  - 除外 ${stats.skippedExcludedPaths} / バイナリ ${stats.skippedBinaryFiles} / 大容量 ${stats.skippedLargeFiles}`
        );
      }
      return lines.join("\n");
    }

    const lines = [`Hits: ${stats.totalMatches} in ${stats.matchedFiles} file(s)`, `Skipped: ${skippedTotal}`];
    if (skippedTotal > 0) {
      lines.push(
        `  - Excluded ${stats.skippedExcludedPaths} / Binary ${stats.skippedBinaryFiles} / Large ${stats.skippedLargeFiles}`
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

      .buttons {
        display: grid;
        grid-template-columns: 1fr 1fr;
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
        <input id="excludeInput" class="input" type="text" placeholder="exclude: **/*.min.js, **/vendor/**" />
        <div class="subhint">${escapeHtml(this.uiText.excludeHint)}</div>
        <label class="toggle">
          <input id="caseSensitive" type="checkbox" />
          <span>${escapeHtml(this.uiText.caseSensitiveLabel)}</span>
        </label>
        <div class="buttons">
          <button id="search" class="primary">${escapeHtml(this.uiText.search)}</button>
          <button id="cancel" class="secondary">${escapeHtml(this.uiText.cancel)}</button>
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
      const excludeInput = document.getElementById("excludeInput");
      const caseSensitiveInput = document.getElementById("caseSensitive");
      const searchButton = document.getElementById("search");
      const cancelButton = document.getElementById("cancel");
      const status = document.getElementById("status");
      const encodingsSummary = document.getElementById("encodingsSummary");
      const statsSummary = document.getElementById("statsSummary");
      const elapsedSummary = document.getElementById("elapsedSummary");

      const submitSearch = () => {
        vscode.postMessage({
          type: "search",
          query: queryInput.value,
          excludeInput: excludeInput.value,
          caseSensitive: caseSensitiveInput.checked
        });
      };

      queryInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          submitSearch();
        }

        if (event.key === "Escape") {
          event.preventDefault();
          vscode.postMessage({ type: "cancel" });
        }
      });

      excludeInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          submitSearch();
        }
      });

      searchButton.addEventListener("click", submitSearch);
      cancelButton.addEventListener("click", () => vscode.postMessage({ type: "cancel" }));

      window.addEventListener("message", (event) => {
        const message = event.data;

        if (message.type !== "state") {
          return;
        }

        const state = message.value;
        queryInput.value = state.query || "";
        excludeInput.value = state.excludeInput || "";
        caseSensitiveInput.checked = Boolean(state.caseSensitive);
        queryInput.disabled = state.isSearching;
        excludeInput.disabled = state.isSearching;
        caseSensitiveInput.disabled = state.isSearching;
        searchButton.disabled = state.isSearching;
        cancelButton.disabled = !state.isSearching;
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

function parseExcludeInput(value: string): string[] {
  return value
    .split(",")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
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
  queryLabel: "検索クエリ",
  statusLabel: "ステータス",
  encodingsLabel: "エンコード",
  caseSensitiveLabel: "大文字小文字を区別",
  excludeHint: "一時除外（この検索のみ）。恒久的な除外は右上の歯車から設定できます。",
  queryPlaceholder: "検索したい文字列を入力",
  search: "Search",
  cancel: "Cancel",
  hintLine1: "Enter: 検索 / Esc: キャンセル",
  hintLine2: "",
  initialStatus: "",
  searchingStatus: "ワークスペースを検索中...",
  clearedStatus: "結果をクリアしました。"
};

const EN_UI_TEXT: SearchUiText = {
  queryLabel: "Search Query",
  statusLabel: "Status",
  encodingsLabel: "Encodings",
  caseSensitiveLabel: "Case Sensitive",
  excludeHint: "Temporary exclude for this search only. Use the top-right gear for persistent excludes.",
  queryPlaceholder: "Enter text to search",
  search: "Search",
  cancel: "Cancel",
  hintLine1: "Enter: search / Esc: cancel",
  hintLine2: "",
  initialStatus: "",
  searchingStatus: "Searching workspace...",
  clearedStatus: "Results cleared."
};

function getNonce(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";

  for (let index = 0; index < 32; index += 1) {
    value += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }

  return value;
}
