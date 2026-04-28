const WINDOWS_PATH_MATCH = process.platform === "win32";

export interface CompiledRule {
  pattern: string;
  regex: RegExp;
  directorySelfRegex?: RegExp;
  negate: boolean;
  directoryOnly: boolean;
  basePath: string;
}

export function normalizeRelativePath(value: string): string {
  return value.replace(/\\/gu, "/").replace(/^\.\/+/u, "").replace(/\/+/gu, "/");
}

export function compileGlobRule(pattern: string, basePath = ""): CompiledRule {
  const normalizedPattern = normalizeRelativePath(pattern);
  const flags = WINDOWS_PATH_MATCH ? "i" : "";
  const directoryPattern = normalizedPattern.endsWith("/**")
    ? normalizedPattern.slice(0, -3)
    : undefined;

  return {
    pattern: normalizedPattern,
    regex: new RegExp(globToRegexSource(normalizedPattern), flags),
    directorySelfRegex: directoryPattern
      ? new RegExp(globToRegexSource(directoryPattern), flags)
      : undefined,
    negate: false,
    directoryOnly: normalizedPattern.endsWith("/"),
    basePath
  };
}

export function matchesRule(rule: CompiledRule, normalizedPath: string, isDirectory: boolean): boolean {
  if (rule.directoryOnly && !isDirectory) {
    return false;
  }

  const activeRegex = isDirectory && rule.directorySelfRegex ? rule.directorySelfRegex : rule.regex;

  if (rule.basePath) {
    if (normalizedPath === rule.basePath) {
      return activeRegex.test("");
    }

    if (!normalizedPath.startsWith(`${rule.basePath}/`)) {
      return false;
    }

    const scopedPath = normalizedPath.slice(rule.basePath.length + 1);
    return activeRegex.test(scopedPath);
  }

  return activeRegex.test(normalizedPath);
}

/** True when `includeGlobs` is empty or path matches at least one glob (file match). */
export function pathMatchesIncludeGlobs(relativePath: string, includeGlobs: string[]): boolean {
  const patterns = includeGlobs.map((p) => p.trim()).filter((p) => p.length > 0);

  if (patterns.length === 0) {
    return true;
  }

  const normalizedPath = normalizeRelativePath(relativePath);

  return patterns.some((pattern) => matchesRule(compileGlobRule(pattern), normalizedPath, false));
}

function globToRegexSource(pattern: string): string {
  let source = "^";
  let index = 0;

  while (index < pattern.length) {
    const current = pattern[index];
    const next = pattern[index + 1];
    const afterNext = pattern[index + 2];

    if (current === "*" && next === "*") {
      if (afterNext === "/") {
        source += "(?:.*/)?";
        index += 3;
        continue;
      }
      source += ".*";
      index += 2;
      continue;
    }

    if (current === "*") {
      source += "[^/]*";
      index += 1;
      continue;
    }

    if (current === "?") {
      source += "[^/]";
      index += 1;
      continue;
    }

    source += escapeRegex(current);
    index += 1;
  }

  source += "$";
  return source;
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+*?.]/gu, "\\$&");
}
