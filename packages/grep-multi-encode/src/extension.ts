import * as path from "path";
import * as vscode from "vscode";
import { getExtensionConfig } from "./config";
import { searchWorkspace } from "./searchEngine";
import { SearchPanelProvider, SearchRequestOptions } from "./searchPanel";
import { FileNode, SearchResultsProvider } from "./searchView";

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel("Grep Multi Encode");
  const isJapanese = vscode.env.language.toLocaleLowerCase().startsWith("ja");
  const resultsProvider = new SearchResultsProvider(isJapanese ? "ja" : "en");
  let currentSearchCancellation: vscode.CancellationTokenSource | undefined;

  const cancelSearch = (): void => {
    currentSearchCancellation?.cancel();
    resultsProvider.cancel();
    searchPanelProvider.setIdle(
      resultsProvider.lastQueryText,
      isJapanese ? "検索をキャンセルしました。" : "Search canceled."
    );
  };

  const clearResults = (): void => {
    resultsProvider.clear();
    searchPanelProvider.clear();
  };

  const runSearch = async (rawQuery: string, options?: SearchRequestOptions): Promise<void> => {
    const query = rawQuery.trim();

    if (!query) {
      return;
    }

    currentSearchCancellation?.cancel();
    currentSearchCancellation?.dispose();
    currentSearchCancellation = new vscode.CancellationTokenSource();

    const config = getExtensionConfig();
    const runtimeExclude = options?.excludeGlobs ?? [];
    const mergedConfig = {
      ...config,
      excludeGlobs: [...config.excludeGlobs, ...runtimeExclude],
      caseSensitive: options?.caseSensitive ?? config.caseSensitive
    };
    searchPanelProvider.setEnabledEncodings(mergedConfig.enabledEncodings);
    searchPanelProvider.setCaseSensitive(mergedConfig.caseSensitive);
    const startedAt = Date.now();
    outputChannel.appendLine(`[search] Query="${query}"`);
    outputChannel.appendLine(`[search] Encodings=${mergedConfig.enabledEncodings.join(", ")}`);
    outputChannel.appendLine(`[search] Exclude globs=${mergedConfig.excludeGlobs.join(", ")}`);
    outputChannel.appendLine(`[search] Platform=${process.platform}`);

    resultsProvider.startSearch(query);
    searchPanelProvider.setSearching(query);

    void vscode.commands.executeCommand("multiEncodeSearch.results.focus");

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Grep Multi Encode: ${query}`,
          cancellable: true
        },
        async (
          progress: vscode.Progress<{ message?: string; increment?: number }>,
          progressToken: vscode.CancellationToken
        ) => {
          progressToken.onCancellationRequested(() => {
            currentSearchCancellation?.cancel();
          });

          const result = await searchWorkspace({
            query,
            config: mergedConfig,
            outputChannel,
            token: currentSearchCancellation?.token ?? progressToken,
            onResult: (fileResult, stats) => {
              resultsProvider.addResult(fileResult, stats);
              searchPanelProvider.setStatus(
                isJapanese
                  ? `検索中... ${stats.scannedFiles} files / ${stats.matchedFiles} matched`
                  : `Scanning... ${stats.scannedFiles} files / ${stats.matchedFiles} matched`,
                stats,
                Date.now() - startedAt
              );
              progress.report({
                message: `${stats.scannedFiles} scanned, ${stats.matchedFiles} matched`
              });
            }
          });

          if (currentSearchCancellation?.token.isCancellationRequested) {
            resultsProvider.cancel();
            searchPanelProvider.setIdle(
              query,
              isJapanese ? "検索をキャンセルしました。" : "Search canceled.",
              undefined,
              Date.now() - startedAt
            );
            return;
          }

          resultsProvider.finishSearch(query, result.results, result.stats);
          searchPanelProvider.setIdle(
            query,
            "",
            result.stats,
            Date.now() - startedAt
          );
          progress.report({
            message: `${result.stats.scannedFiles} scanned, ${result.stats.matchedFiles} matched`
          });
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outputChannel.appendLine(`[search:error] ${message}`);
      outputChannel.show(true);
      resultsProvider.setError(message);
      searchPanelProvider.setIdle(query, message, undefined, Date.now() - startedAt);
      void vscode.window.showErrorMessage(message);
    } finally {
      currentSearchCancellation?.dispose();
      currentSearchCancellation = undefined;
    }
  };

  const searchPanelProvider = new SearchPanelProvider(
    context.extensionUri,
    runSearch,
    cancelSearch,
    isJapanese ? "ja" : "en"
  );
  searchPanelProvider.setEnabledEncodings(getExtensionConfig().enabledEncodings);
  searchPanelProvider.setCaseSensitive(getExtensionConfig().caseSensitive);

  context.subscriptions.push(outputChannel);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("multiEncodeSearch.results", resultsProvider)
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("multiEncodeSearch.search", searchPanelProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("multiEncodeSearch.searchInWorkspace", async () => {
      const query = await vscode.window.showInputBox({
        prompt: isJapanese
          ? "複数エンコードを横断して検索する語句を入力"
          : "Enter text to search across multiple encodings",
        placeHolder: isJapanese ? "検索語" : "Search text"
      });

      if (!query) {
        return;
      }

      await runSearch(query);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("multiEncodeSearch.openMatch", async (filePath: string, line: number) => {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      const editor = await vscode.window.showTextDocument(document, {
        preview: false
      });
      const targetLine = Math.max(0, line - 1);
      const position = new vscode.Position(targetLine, 0);

      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("multiEncodeSearch.clearResults", () => {
      clearResults();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("multiEncodeSearch.cancelSearch", () => {
      cancelSearch();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("multiEncodeSearch.openSettings", () => {
      void vscode.commands.executeCommand("workbench.action.openSettings", `@ext:${context.extension.id}`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("multiEncodeSearch.copyAbsolutePath", async (node: FileNode) => {
      const filePath = node?.result?.filePath;
      if (!filePath) {
        return;
      }
      await vscode.env.clipboard.writeText(filePath);
      void vscode.window.setStatusBarMessage(
        isJapanese ? `絶対パスをコピーしました` : `Copied absolute path`,
        2500
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("multiEncodeSearch.copyRelativePath", async (node: FileNode) => {
      const filePath = node?.result?.filePath;
      if (!filePath) {
        return;
      }
      const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
      if (!folder) {
        void vscode.window.showWarningMessage(
          isJapanese
            ? "ワークスペース内のファイルではないため、相対パスを求められません。"
            : "File is not under a workspace folder; cannot build a relative path."
        );
        return;
      }
      const relative = path.relative(folder.uri.fsPath, filePath).split(path.sep).join("/");
      await vscode.env.clipboard.writeText(relative);
      void vscode.window.setStatusBarMessage(
        isJapanese ? `相対パスをコピーしました` : `Copied relative path`,
        2500
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("multiEncodeSearch.revealFileInOs", async (node: FileNode) => {
      const filePath = node?.result?.filePath;
      if (!filePath) {
        return;
      }
      await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(filePath));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("multiEncodeSearch.focusSearchView", async () => {
      await vscode.commands.executeCommand("workbench.view.extension.multiEncodeSearch");
    })
  );
}

export function deactivate(): void {
  // No-op for now.
}
