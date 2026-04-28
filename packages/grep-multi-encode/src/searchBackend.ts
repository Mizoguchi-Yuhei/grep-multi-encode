import type * as vscode from "vscode";
import type { ExtensionConfig } from "./config";
import type { FileResultItem, SearchStats } from "./searchTypes";
import { searchWorkspace } from "./searchEngine";

export interface SearchWorkspaceRunOptions {
  query: string;
  config: ExtensionConfig;
  outputChannel: vscode.OutputChannel;
  token: vscode.CancellationToken;
  onResult?: (result: FileResultItem, stats: SearchStats) => void;
}

export type SearchWorkspaceResult = Awaited<ReturnType<typeof searchWorkspace>>;

export interface SearchBackend {
  searchWorkspace(options: SearchWorkspaceRunOptions): Promise<SearchWorkspaceResult>;
}

export function createLocalSearchBackend(): SearchBackend {
  return {
    searchWorkspace
  };
}
