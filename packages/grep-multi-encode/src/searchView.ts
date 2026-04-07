import * as vscode from "vscode";
import * as path from "path";
import { FileResultItem, SearchStats, createEmptySearchStats } from "./searchTypes";

type TreeNode = SummaryNode | FileNode | MatchNode | StatusNode | MetricsNode;

export class SearchResultsProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TreeNode | undefined | void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private lastQuery = "";
  private results: FileResultItem[] = [];
  private isSearching = false;
  private statusMessage: string;
  private stats: SearchStats = createEmptySearchStats();
  private readonly language: "ja" | "en";

  constructor(language: "ja" | "en" = "en") {
    this.language = language;
    this.statusMessage = language === "ja" ? "ワークスペース検索を開始してください。" : "Run a workspace search to begin.";
  }

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  get lastQueryText(): string {
    return this.lastQuery;
  }

  startSearch(query: string): void {
    this.lastQuery = query;
    this.results = [];
    this.isSearching = true;
    this.statusMessage = this.language === "ja" ? "ワークスペースを検索中..." : "Searching workspace...";
    this.stats = createEmptySearchStats();
    this.refresh();
  }

  addResult(result: FileResultItem, stats: SearchStats): void {
    this.results = [...this.results, result].sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath)
    );
    this.stats = { ...stats };
    this.statusMessage = `Scanning... ${stats.scannedFiles} files, ${stats.matchedFiles} matched.`;
    this.refresh();
  }

  finishSearch(query: string, results: FileResultItem[], stats: SearchStats): void {
    this.lastQuery = query;
    this.results = results;
    this.isSearching = false;
    this.stats = { ...stats };
    this.statusMessage =
      results.length === 0
        ? this.language === "ja"
          ? `一致なし。${stats.scannedFiles} ファイルを確認しました。`
          : `No matches found. Scanned ${stats.scannedFiles} files.`
        : this.language === "ja"
          ? `完了。${stats.scannedFiles} ファイルを確認し、${stats.totalMatches} 件見つかりました。`
          : `Completed. Scanned ${stats.scannedFiles} files and found ${stats.totalMatches} matches.`;
    this.refresh();
  }

  clear(): void {
    this.lastQuery = "";
    this.results = [];
    this.isSearching = false;
    this.statusMessage = this.language === "ja" ? "結果をクリアしました。" : "Results cleared.";
    this.stats = createEmptySearchStats();
    this.refresh();
  }

  cancel(): void {
    this.isSearching = false;
    this.statusMessage = this.language === "ja" ? "検索をキャンセルしました。" : "Search canceled.";
    this.refresh();
  }

  setError(message: string): void {
    this.isSearching = false;
    this.statusMessage = message;
    this.refresh();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    if (element instanceof StatusNode || element instanceof SummaryNode) {
      return element;
    }

    if (element instanceof FileNode) {
      return element;
    }

    return element;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      const nodes: TreeNode[] = [
        new SummaryNode(this.lastQuery, this.results.length, this.isSearching, this.language)
      ];

      if (this.statusMessage) {
        nodes.push(new StatusNode(this.statusMessage));
      }
      nodes.push(new MetricsNode(this.stats, this.language));

      if (this.results.length === 0) {
        return nodes;
      }

      return [...nodes, ...this.results.map((result) => new FileNode(result))];
    }

    if (element instanceof FileNode) {
      return element.result.matches.map((match) => new MatchNode(element.result.filePath, match));
    }

    return [];
  }
}

class SummaryNode extends vscode.TreeItem {
  constructor(query: string, fileCount: number, isSearching: boolean, language: "ja" | "en") {
    const label = query
      ? language === "ja"
        ? `${isSearching ? "検索中" : "検索語"}: ${query} (${fileCount} file${fileCount === 1 ? "" : "s"})`
        : `${isSearching ? "Searching" : "Query"}: ${query} (${fileCount} file${fileCount === 1 ? "" : "s"})`
      : language === "ja"
        ? "検索語は未入力です"
        : "No active query";

    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "summary";
    this.iconPath = new vscode.ThemeIcon("search");
    this.tooltip = query ? `検索語: ${query}` : "検索待機中";
  }
}

class StatusNode extends vscode.TreeItem {
  constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "status";
    this.iconPath = statusIcon(message);
  }
}

class FileNode extends vscode.TreeItem {
  constructor(public readonly result: FileResultItem) {
    super(
      path.basename(result.filePath),
      vscode.TreeItemCollapsibleState.Collapsed
    );

    this.description = `[${result.encoding}] ${result.matches.length} match${result.matches.length === 1 ? "" : "es"}`;
    this.tooltip = new vscode.MarkdownString(
      `**${escapeMarkdown(result.relativePath)}**\n\nEncoding: \`${result.encoding}\`\nMatches: \`${result.matches.length}\``
    );
    this.contextValue = "fileResult";
    this.iconPath = new vscode.ThemeIcon("file");
  }
}

class MatchNode extends vscode.TreeItem {
  constructor(filePath: string, match: FileResultItem["matches"][number]) {
    super(trimPreview(match.preview), vscode.TreeItemCollapsibleState.None);

    this.description = `L${match.line} [${match.encoding}]`;
    this.tooltip = new vscode.MarkdownString(
      `**Line ${match.line}**\n\n\`${match.encoding}\`\n\n${escapeMarkdown(match.preview)}`
    );
    this.command = {
      command: "multiEncodeSearch.openMatch",
      title: "Open Match",
      arguments: [filePath, match.line]
    };
    this.contextValue = "matchResult";
    this.iconPath = new vscode.ThemeIcon("list-selection");
  }
}

class MetricsNode extends vscode.TreeItem {
  constructor(stats: SearchStats, language: "ja" | "en") {
    const skippedTotal = stats.skippedBinaryFiles + stats.skippedExcludedPaths + stats.skippedLargeFiles;
    super(
      language === "ja"
        ? `ヒット ${stats.totalMatches} 件（対象 ${stats.matchedFiles} ファイル）`
        : `Hits ${stats.totalMatches} in ${stats.matchedFiles} file(s)`,
      vscode.TreeItemCollapsibleState.None
    );
    this.description =
      language === "ja"
        ? `Skipped ${skippedTotal} / Scanned ${stats.scannedFiles}`
        : `Skipped ${skippedTotal} / Scanned ${stats.scannedFiles}`;
    this.tooltip = new vscode.MarkdownString(
      [
        `**Search Metrics**`,
        ``,
        `- Hits: \`${stats.totalMatches}\``,
        `- Matched files: \`${stats.matchedFiles}\``,
        `- Scanned files: \`${stats.scannedFiles}\``,
        `- Skipped total: \`${skippedTotal}\``,
        `  - Excluded: \`${stats.skippedExcludedPaths}\``,
        `  - Binary: \`${stats.skippedBinaryFiles}\``,
        `  - Large: \`${stats.skippedLargeFiles}\``,
        `- Errors: \`${stats.erroredFiles}\``
      ].join("\n")
    );
    this.contextValue = "metrics";
    this.iconPath = new vscode.ThemeIcon("info");
  }
}

function trimPreview(value: string): string {
  const limit = 90;
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 3)}...`;
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}[\]()#+\-.!]/g, "\\$&");
}

function statusIcon(message: string): vscode.ThemeIcon {
  const normalized = message.toLocaleLowerCase();
  if (normalized.includes("error") || normalized.includes("failed")) {
    return new vscode.ThemeIcon("error");
  }
  if (normalized.includes("cancel")) {
    return new vscode.ThemeIcon("warning");
  }
  return new vscode.ThemeIcon("info");
}
