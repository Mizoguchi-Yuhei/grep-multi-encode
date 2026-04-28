import * as fs from "fs/promises";
import type { Dirent, Stats } from "fs";
import * as path from "path";
import * as vscode from "vscode";
import iconv from "iconv-lite";
import { ExtensionConfig, SupportedEncoding } from "./config";
import { type CompiledRule, compileGlobRule, matchesRule, normalizeRelativePath } from "./globRules";
import { createEmptySearchStats, FileResultItem, MatchItem, SearchStats } from "./searchTypes";

interface CandidateFile {
  absolutePath: string;
  relativePath: string;
  size: number;
}

interface SearchWorkspaceOptions {
  query: string;
  config: ExtensionConfig;
  outputChannel: vscode.OutputChannel;
  token: vscode.CancellationToken;
  onResult?: (result: FileResultItem, stats: SearchStats) => void;
}

interface SearchWorkspaceResult {
  results: FileResultItem[];
  stats: SearchStats;
}

const PREVIEW_LIMIT = 200;
const BINARY_SAMPLE_SIZE = 1024;
const WINDOWS_PATH_MATCH = process.platform === "win32";

const fileNameGlobCache = new Map<string, CompiledRule>();

export async function searchWorkspace(options: SearchWorkspaceOptions): Promise<SearchWorkspaceResult> {
  const { config, outputChannel, query, token } = options;
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    throw new Error("Open a workspace folder before running Multi-Encode Search.");
  }

  const stats = createEmptySearchStats();
  const candidates: CandidateFile[] = [];
  const excludeRules = config.excludeGlobs.map((pattern) => compileGlobRule(pattern));
  const includePatterns = config.includeGlobs.map((p) => p.trim()).filter((p) => p.length > 0);
  const includeRules = includePatterns.map((pattern) => compileGlobRule(pattern));
  const searchRootSegments = config.searchRoots
    .map((root) => normalizeRelativePath(root).replace(/^\/+|\/+$/gu, ""))
    .filter((segment) => segment.length > 0);
  const visitedDirectories = new Set<string>();

  outputChannel.appendLine(
    `[search] includeGlobs=${includePatterns.length ? includePatterns.join("; ") : "(none)"}`
  );
  outputChannel.appendLine(
    `[search] searchRoots=${searchRootSegments.length ? searchRootSegments.join("; ") : "(workspace root)"}`
  );

  for (const folder of workspaceFolders) {
    if (token.isCancellationRequested) {
      break;
    }

    const startPaths =
      searchRootSegments.length > 0
        ? searchRootSegments.map((segment) => path.join(folder.uri.fsPath, segment))
        : [folder.uri.fsPath];

    for (const startPath of startPaths) {
      if (token.isCancellationRequested) {
        break;
      }

      const startStats = await safeStat(startPath);

      if (!startStats) {
        outputChannel.appendLine(`[search] searchRoot not found, skipping: ${startPath}`);
        continue;
      }

      if (!startStats.isDirectory()) {
        outputChannel.appendLine(`[search] searchRoot is not a directory, skipping: ${startPath}`);
        continue;
      }

      await collectCandidateFiles({
        rootPath: folder.uri.fsPath,
        currentPath: startPath,
        config,
        outputChannel,
        token,
        stats,
        candidates,
        excludeRules,
        includeRules,
        inheritedIgnoreRules: [],
        visitedDirectories
      });
    }
  }

  outputChannel.appendLine(`[search] Candidate files=${candidates.length}`);

  const results: FileResultItem[] = [];
  let nextIndex = 0;
  let stop = false;
  const workerCount = Math.max(1, Math.min(config.concurrency, candidates.length || 1));

  const workers = Array.from({ length: workerCount }, async () => {
    while (!stop && !token.isCancellationRequested) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= candidates.length) {
        break;
      }

      const candidate = candidates[currentIndex];
      const searchResult = await searchFile(candidate, query, config, outputChannel, stats);

      if (!searchResult || stop || token.isCancellationRequested) {
        continue;
      }

      const remainingMatches = config.maxTotalMatches - stats.totalMatches;

      if (remainingMatches <= 0) {
        stop = true;
        break;
      }

      if (searchResult.matches.length > remainingMatches) {
        searchResult.matches = searchResult.matches.slice(0, remainingMatches);
      }

      if (searchResult.matches.length === 0) {
        continue;
      }

      results.push(searchResult);
      stats.matchedFiles += 1;
      stats.totalMatches += searchResult.matches.length;
      options.onResult?.(searchResult, { ...stats });

      if (
        stats.matchedFiles >= config.maxInitialMatchedFiles ||
        stats.totalMatches >= config.maxTotalMatches
      ) {
        stop = true;
      }
    }
  });

  await Promise.all(workers);

  results.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  return {
    results,
    stats
  };
}

async function collectCandidateFiles(params: {
  rootPath: string;
  currentPath: string;
  config: ExtensionConfig;
  outputChannel: vscode.OutputChannel;
  token: vscode.CancellationToken;
  stats: SearchStats;
  candidates: CandidateFile[];
  excludeRules: CompiledRule[];
  includeRules: CompiledRule[];
  inheritedIgnoreRules: CompiledRule[];
  visitedDirectories: Set<string>;
}): Promise<void> {
  const {
    rootPath,
    currentPath,
    config,
    outputChannel,
    token,
    stats,
    candidates,
    excludeRules,
    includeRules,
    inheritedIgnoreRules,
    visitedDirectories
  } = params;

  if (token.isCancellationRequested) {
    return;
  }

  let realCurrentPath = currentPath;

  try {
    realCurrentPath = await fs.realpath(currentPath);
  } catch {
    realCurrentPath = currentPath;
  }

  if (visitedDirectories.has(realCurrentPath)) {
    return;
  }

  visitedDirectories.add(realCurrentPath);

  let entries: Dirent[];

  try {
    entries = await fs.readdir(currentPath, { withFileTypes: true });
  } catch (error) {
    outputChannel.appendLine(
      `[walk:error] Failed to read directory: ${currentPath} (${toErrorMessage(error)})`
    );
    return;
  }

  let activeIgnoreRules = inheritedIgnoreRules;

  if (config.useGitIgnore) {
    const gitIgnoreEntry = entries.find((entry) => entry.name === ".gitignore" && entry.isFile());

    if (gitIgnoreEntry) {
      const gitIgnorePath = path.join(currentPath, gitIgnoreEntry.name);
      const basePath = normalizeRelativePath(path.relative(rootPath, currentPath));

      try {
        const content = await fs.readFile(gitIgnorePath, "utf8");
        activeIgnoreRules = [
          ...inheritedIgnoreRules,
          ...parseGitIgnore(content, basePath)
        ];
      } catch (error) {
        outputChannel.appendLine(
          `[walk:error] Failed to read .gitignore: ${gitIgnorePath} (${toErrorMessage(error)})`
        );
      }
    }
  }

  for (const entry of entries) {
    if (token.isCancellationRequested) {
      return;
    }

    const absolutePath = path.join(currentPath, entry.name);
    const relativePath = normalizeRelativePath(path.relative(rootPath, absolutePath));
    const isDirectory = entry.isDirectory();
    const isSymbolicLink = entry.isSymbolicLink();

    if (
      shouldExcludePath({
        relativePath,
        fileName: entry.name,
        isDirectory,
        excludeRules,
        ignoreRules: activeIgnoreRules,
        config
      })
    ) {
      stats.skippedExcludedPaths += 1;
      continue;
    }

    if (isSymbolicLink && !config.followSymlinks) {
      continue;
    }

    if (isDirectory || isSymbolicLink) {
      const statsTarget = isSymbolicLink ? await safeStat(absolutePath) : undefined;

      if (isSymbolicLink && !statsTarget?.isDirectory()) {
        if (statsTarget?.isFile()) {
          await pushCandidateFile({
            absolutePath,
            relativePath,
            size: statsTarget.size,
            config,
            candidates,
            stats,
            includeRules
          });
        }
        continue;
      }

      await collectCandidateFiles({
        ...params,
        currentPath: absolutePath,
        inheritedIgnoreRules: activeIgnoreRules,
        includeRules
      });
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const fileStats = await safeStat(absolutePath);

    if (!fileStats?.isFile()) {
      continue;
    }

    await pushCandidateFile({
      absolutePath,
      relativePath,
      size: fileStats.size,
      config,
      candidates,
      stats,
      includeRules
    });
  }
}

async function pushCandidateFile(params: {
  absolutePath: string;
  relativePath: string;
  size: number;
  config: ExtensionConfig;
  candidates: CandidateFile[];
  stats: SearchStats;
  includeRules: CompiledRule[];
}): Promise<void> {
  const { absolutePath, relativePath, size, config, candidates, stats, includeRules } = params;

  if (size > config.maxFileSizeBytes) {
    stats.skippedLargeFiles += 1;
    return;
  }

  if (includeRules.length > 0) {
    const normalizedPath = normalizeRelativePath(relativePath);
    const matched = includeRules.some((rule) => matchesRule(rule, normalizedPath, false));

    if (!matched) {
      stats.skippedIncludeFilter += 1;
      return;
    }
  }

  candidates.push({
    absolutePath,
    relativePath,
    size
  });
}

function detectBomEncoding(buffer: Buffer): SupportedEncoding | undefined {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return "utf8";
  }

  if (buffer.length >= 4 && buffer[0] === 0 && buffer[1] === 0 && buffer[2] === 0xfe && buffer[3] === 0xff) {
    return "utf16be";
  }

  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xfe && buffer[2] === 0 && buffer[3] === 0) {
    return "utf16le";
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return "utf16le";
  }

  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return "utf16be";
  }

  return undefined;
}

function buildEncodingTryOrder(buffer: Buffer, enabled: SupportedEncoding[]): SupportedEncoding[] {
  const bom = detectBomEncoding(buffer);
  const seen = new Set<SupportedEncoding>();
  const order: SupportedEncoding[] = [];

  if (bom !== undefined && enabled.includes(bom)) {
    order.push(bom);
    seen.add(bom);
  }

  for (const encoding of enabled) {
    if (!seen.has(encoding)) {
      order.push(encoding);
      seen.add(encoding);
    }
  }

  return order;
}

async function searchFile(
  candidate: CandidateFile,
  query: string,
  config: ExtensionConfig,
  outputChannel: vscode.OutputChannel,
  stats: SearchStats
): Promise<FileResultItem | undefined> {
  stats.scannedFiles += 1;

  let buffer: Buffer;

  try {
    buffer = await fs.readFile(candidate.absolutePath);
  } catch (error) {
    stats.erroredFiles += 1;
    outputChannel.appendLine(
      `[search:error] Failed to read file: ${candidate.absolutePath} (${toErrorMessage(error)})`
    );
    return undefined;
  }

  if (isProbablyBinary(buffer)) {
    stats.skippedBinaryFiles += 1;
    return undefined;
  }

  const tryOrder = buildEncodingTryOrder(buffer, config.enabledEncodings);

  for (const encoding of tryOrder) {
    const decodedText = decodeBuffer(buffer, encoding);

    if (!decodedText) {
      continue;
    }

    const matches = findMatchesInText(decodedText, query, config.caseSensitive, config.maxMatchesPerFile, encoding);

    if (matches.length === 0) {
      continue;
    }

    return {
      filePath: candidate.absolutePath,
      relativePath: candidate.relativePath,
      encoding,
      matches
    };
  }

  return undefined;
}

function findMatchesInText(
  text: string,
  query: string,
  caseSensitive: boolean,
  maxMatchesPerFile: number,
  encoding: SupportedEncoding
): MatchItem[] {
  const haystack = caseSensitive ? text : text.toLocaleLowerCase();
  const needle = caseSensitive ? query : query.toLocaleLowerCase();

  if (!haystack.includes(needle)) {
    return [];
  }

  const lines = text.split(/\r\n|\n|\r/u);
  const matches: MatchItem[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const comparableLine = caseSensitive ? line : line.toLocaleLowerCase();

    if (!comparableLine.includes(needle)) {
      continue;
    }

    matches.push({
      line: index + 1,
      preview: buildPreview(line),
      encoding
    });

    if (matches.length >= maxMatchesPerFile) {
      break;
    }
  }

  return matches;
}

function buildPreview(line: string): string {
  const compact = line.replace(/\s+/gu, " ").trim();

  if (compact.length <= PREVIEW_LIMIT) {
    return compact;
  }

  return `${compact.slice(0, PREVIEW_LIMIT - 3)}...`;
}

function decodeBuffer(buffer: Buffer, encoding: SupportedEncoding): string | undefined {
  try {
    const decoded = iconv.decode(buffer, mapEncodingName(encoding));

    if (!decoded || looksTooCorrupted(decoded)) {
      return undefined;
    }

    return stripBom(decoded);
  } catch {
    return undefined;
  }
}

function mapEncodingName(encoding: SupportedEncoding): string {
  switch (encoding) {
    case "shift_jis":
      return "shift_jis";
    case "cp932":
      return "cp932";
    case "windows-31j":
      return "windows-31j";
    case "euc-jp":
      return "euc-jp";
    case "utf16be":
      return "utf16be";
    case "utf16le":
      return "utf16-le";
    case "latin1":
      return "latin1";
    case "windows-1252":
      return "windows-1252";
    case "gb18030":
      return "gb18030";
    case "gbk":
      return "gbk";
    case "big5":
      return "big5";
    case "euc-kr":
      return "euc-kr";
    case "utf8":
      return "utf8";
    default:
      return encoding;
  }
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function looksTooCorrupted(text: string): boolean {
  if (text.length === 0) {
    return false;
  }

  let replacementCount = 0;
  let suspiciousControlCount = 0;

  for (const character of text) {
    if (character === "\uFFFD") {
      replacementCount += 1;
      continue;
    }

    const codePoint = character.charCodeAt(0);
    const isSuspiciousControl =
      codePoint < 32 &&
      codePoint !== 9 &&
      codePoint !== 10 &&
      codePoint !== 13;

    if (isSuspiciousControl) {
      suspiciousControlCount += 1;
    }
  }

  return replacementCount / text.length > 0.1 || suspiciousControlCount / text.length > 0.05;
}

function isProbablyBinary(buffer: Buffer): boolean {
  if (buffer.length === 0) {
    return false;
  }

  const sampleLength = Math.min(buffer.length, BINARY_SAMPLE_SIZE);
  let suspiciousBytes = 0;

  for (let index = 0; index < sampleLength; index += 1) {
    const value = buffer[index];

    if (value === 0) {
      return true;
    }

    const isTextControl = value === 9 || value === 10 || value === 13;
    const isSuspiciousControl = value < 32 && !isTextControl;

    if (isSuspiciousControl) {
      suspiciousBytes += 1;
    }
  }

  return suspiciousBytes / sampleLength > 0.3;
}

function shouldExcludePath(params: {
  relativePath: string;
  fileName: string;
  isDirectory: boolean;
  excludeRules: CompiledRule[];
  ignoreRules: CompiledRule[];
  config: ExtensionConfig;
}): boolean {
  const { relativePath, fileName, isDirectory, excludeRules, ignoreRules, config } = params;
  const normalizedPath = normalizeRelativePath(relativePath);
  const extension = path.extname(fileName);

  if (config.excludeExtensions.some((candidate) => candidateEquals(candidate, extension))) {
    return true;
  }

  if (matchesFileNameRule(fileName, config.excludeFileNames)) {
    return true;
  }

  for (const rule of excludeRules) {
    if (matchesRule(rule, normalizedPath, isDirectory)) {
      return true;
    }
  }

  return matchesIgnoreRules(ignoreRules, normalizedPath, isDirectory);
}

function matchesFileNameRule(fileName: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern.includes("*") || pattern.includes("?")) {
      let rule = fileNameGlobCache.get(pattern);

      if (!rule) {
        rule = compileGlobRule(`**/${pattern}`);
        fileNameGlobCache.set(pattern, rule);
      }

      return rule.regex.test(normalizeRelativePath(fileName));
    }

    return candidateEquals(pattern, fileName);
  });
}

function matchesIgnoreRules(rules: CompiledRule[], normalizedPath: string, isDirectory: boolean): boolean {
  let ignored = false;

  for (const rule of rules) {
    if (matchesRule(rule, normalizedPath, isDirectory)) {
      ignored = !rule.negate;
    }
  }

  return ignored;
}

function parseGitIgnore(content: string, basePath: string): CompiledRule[] {
  return content
    .split(/\r\n|\n|\r/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((pattern) => compileGitIgnoreRule(pattern, basePath));
}

function compileGitIgnoreRule(rawPattern: string, basePath: string): CompiledRule {
  let negate = false;
  let pattern = rawPattern;

  if (pattern.startsWith("!")) {
    negate = true;
    pattern = pattern.slice(1);
  }

  let directoryOnly = false;

  if (pattern.endsWith("/")) {
    directoryOnly = true;
    pattern = pattern.slice(0, -1);
  }

  const anchored = pattern.startsWith("/");

  if (anchored) {
    pattern = pattern.slice(1);
  }

  if (!pattern.includes("/")) {
    pattern = `**/${pattern}`;
  } else if (!anchored) {
    pattern = `**/${pattern}`;
  }

  return {
    ...compileGlobRule(pattern, basePath),
    negate,
    directoryOnly
  };
}

function candidateEquals(left: string, right: string): boolean {
  if (WINDOWS_PATH_MATCH) {
    return left.toLocaleLowerCase() === right.toLocaleLowerCase();
  }

  return left === right;
}

async function safeStat(targetPath: string): Promise<Stats | undefined> {
  try {
    return await fs.stat(targetPath);
  } catch {
    return undefined;
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
